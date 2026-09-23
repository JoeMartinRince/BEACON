/**
 * Beacon Live Sensor Collector
 *
 * Browser-level abstraction for:
 *   - navigator.geolocation.watchPosition  (GPS)
 *   - DeviceMotionEvent                    (accelerometer)
 *   - Online / Offline detection
 *   - Offline batch queue with configurable flush interval
 *   - Road-segment map matching (within 50 m buffer of 160 synthetic segments)
 *
 * Design principles:
 *   - No React imports — can be used from any context
 *   - All callbacks are plain functions passed by the caller
 *   - Sensor state changes are reported via onStatusChange()
 *   - GPS points are reported via onGpsPoint()
 *   - Motion readings are reported via onMotionReading()
 */

import { calculateDistanceKm } from "./trip-geocoder";
import { BATCH_FLUSH_INTERVAL_MS, MAX_OFFLINE_BUFFER_SIZE } from "./trip-state-machine";
import type { TripGPSPoint } from "./trip-types";

// ─────────────────────────────────────────────────────────────────────────────
// Sensor availability types
// ─────────────────────────────────────────────────────────────────────────────

export type LocationSensorStatus =
  | "CONNECTING"
  | "CONNECTED"
  | "PERMISSION_DENIED"
  | "UNAVAILABLE";

export type MotionSensorStatus =
  | "AVAILABLE"
  | "UNSUPPORTED"
  | "PERMISSION_REQUIRED";

export interface SensorAvailability {
  location: LocationSensorStatus;
  motion: MotionSensorStatus;
  isOnline: boolean;
}

export interface MotionReading {
  accel_x: number;
  accel_y: number;
  accel_z: number;
  /** Rotation around Z axis (yaw rate) — from rotationRate.alpha if available */
  gyro_z: number;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal road segment reference for map matching
// Populated from roadsense-data when the collector is initialised.
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentRef {
  segment_id: string;
  /** Centroid latitude of segment */
  lat: number;
  /** Centroid longitude of segment */
  lng: number;
}

/** Buffer distance (metres) for map-matching a GPS point to a road segment */
export const SEGMENT_MATCH_BUFFER_M = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Batch observation queue entry
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchObservation {
  point: TripGPSPoint;
  motion?: MotionReading;
  segment_id?: string;
  queued_at: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collector callbacks
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveSensorCollectorCallbacks {
  onGpsPoint: (point: TripGPSPoint, matched_segment_id?: string) => void;
  onMotionReading: (reading: MotionReading) => void;
  onStatusChange: (status: SensorAvailability) => void;
  /** Called when the batch queue is flushed (online) or when buffer is full (offline fallback) */
  onBatchFlush: (observations: BatchObservation[]) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Sensor Collector class
// ─────────────────────────────────────────────────────────────────────────────

export class LiveSensorCollector {
  private callbacks: LiveSensorCollectorCallbacks;
  private segments: SegmentRef[];

  private watchId: number | null = null;
  private flushTimerId: ReturnType<typeof setInterval> | null = null;

  private status: SensorAvailability = {
    location: "CONNECTING",
    motion: "UNSUPPORTED",
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  };

  /** Rolling offline buffer — capped at MAX_OFFLINE_BUFFER_SIZE */
  private buffer: BatchObservation[] = [];

  /** Last received motion reading — merged into the next GPS point */
  private lastMotion: MotionReading | null = null;

  constructor(callbacks: LiveSensorCollectorCallbacks, segments: SegmentRef[] = []) {
    this.callbacks = callbacks;
    this.segments = segments;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Start collecting sensors. Call once on mount. */
  start(): void {
    if (typeof window === "undefined") return;

    this.#watchOnlineStatus();
    this.#startGeolocation();
    this.#initMotionSensors();
    this.#startBatchFlushTimer();
  }

  /** Stop all sensors and flush remaining buffer. Call on unmount. */
  stop(): void {
    if (this.watchId !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.flushTimerId !== null) {
      clearInterval(this.flushTimerId);
      this.flushTimerId = null;
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.#handleOnline);
      window.removeEventListener("offline", this.#handleOffline);
      window.removeEventListener("devicemotion", this.#handleMotion as EventListener);
    }

    // Flush remaining buffer on stop
    this.#flushBuffer();
  }

  /** Update the road-segment reference list (called when data loads) */
  updateSegments(segments: SegmentRef[]): void {
    this.segments = segments;
  }

  /** Returns a snapshot of current sensor status */
  getStatus(): SensorAvailability {
    return { ...this.status };
  }

  /** Returns current buffered observation count */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Explicitly requests motion permission from an iOS user gesture (button tap/click).
   * Safe to call multiple times; returns true if motion is now available.
   */
  async requestMotionPermission(): Promise<boolean> {
    if (typeof window === "undefined") return false;

    const dme = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    if (typeof dme.requestPermission === "function") {
      try {
        const result = await dme.requestPermission();
        if (result === "granted") {
          window.addEventListener("devicemotion", this.#handleMotion as EventListener);
          this.#updateStatus({ motion: "AVAILABLE" });
          return true;
        } else {
          this.#updateStatus({ motion: "PERMISSION_REQUIRED" });
          return false;
        }
      } catch (err) {
        console.warn("Motion permission request error:", err);
        this.#updateStatus({ motion: "PERMISSION_REQUIRED" });
        return false;
      }
    } else if (typeof window.DeviceMotionEvent !== "undefined") {
      try {
        window.addEventListener("devicemotion", this.#handleMotion as EventListener);
        this.#updateStatus({ motion: "AVAILABLE" });
        return true;
      } catch {
        this.#updateStatus({ motion: "UNSUPPORTED" });
        return false;
      }
    }

    this.#updateStatus({ motion: "UNSUPPORTED" });
    return false;
  }

  // ── Private internals ──────────────────────────────────────────────────────

  #updateStatus(partial: Partial<SensorAvailability>): void {
    this.status = { ...this.status, ...partial };
    this.callbacks.onStatusChange({ ...this.status });
  }

  #handleOnline = (): void => {
    this.#updateStatus({ isOnline: true });
    // Immediately flush any queued observations now that we are back online
    this.#flushBuffer();
  };

  #handleOffline = (): void => {
    this.#updateStatus({ isOnline: false });
  };

  #watchOnlineStatus(): void {
    window.addEventListener("online", this.#handleOnline);
    window.addEventListener("offline", this.#handleOffline);
  }

  #startGeolocation(): void {
    if (!("geolocation" in navigator)) {
      this.#updateStatus({ location: "UNAVAILABLE" });
      return;
    }

    this.#updateStatus({ location: "CONNECTING" });

    try {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this.#handleGpsPosition(pos),
        (err) => this.#handleGpsError(err),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
      );
    } catch {
      this.#updateStatus({ location: "UNAVAILABLE" });
    }
  }

  #handleGpsPosition(pos: GeolocationPosition): void {
    const speedKmh =
      pos.coords.speed !== null && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : 0;

    const point: TripGPSPoint = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      speed_kmh: Number(speedKmh.toFixed(1)),
      accuracy_m: pos.coords.accuracy,
      timestamp: pos.timestamp,
      // Motion fields merged from latest DeviceMotion reading
      ...(this.lastMotion
        ? {
            accel_x: this.lastMotion.accel_x,
            accel_y: this.lastMotion.accel_y,
            accel_z: this.lastMotion.accel_z,
            gyro_z: this.lastMotion.gyro_z,
            sensor_type: "GPS_AND_MOTION" as const,
          }
        : { sensor_type: "GPS_ONLY" as const }),
      source: "LIVE" as const,
    };

    const matched_segment_id = this.#matchSegment(point.lat, point.lng);
    if (matched_segment_id) {
      point.segment_id = matched_segment_id;
    }

    // Update location status to CONNECTED on first good fix
    if (this.status.location !== "CONNECTED") {
      this.#updateStatus({ location: "CONNECTED" });
    }

    // Enqueue observation
    this.#enqueue({
      point,
      ...(this.lastMotion ? { motion: this.lastMotion } : {}),
      ...(matched_segment_id ? { segment_id: matched_segment_id } : {}),
      queued_at: Date.now(),
    });

    // Notify caller
    this.callbacks.onGpsPoint(point, matched_segment_id);
  }

  #handleGpsError(err: GeolocationPositionError): void {
    if (err.code === err.PERMISSION_DENIED) {
      this.#updateStatus({ location: "PERMISSION_DENIED" });
    } else {
      this.#updateStatus({ location: "UNAVAILABLE" });
    }
  }

  #handleMotion = (evt: DeviceMotionEvent): void => {
    const accel = evt.accelerationIncludingGravity ?? evt.acceleration;
    if (!accel) return;

    const reading: MotionReading = {
      accel_x: accel.x ?? 0,
      accel_y: accel.y ?? 0,
      accel_z: accel.z ?? 0,
      gyro_z: evt.rotationRate?.alpha ?? 0,
      timestamp: Date.now(),
    };

    this.lastMotion = reading;
    this.callbacks.onMotionReading(reading);
  };

  #initMotionSensors(): void {
    if (typeof window === "undefined" || typeof window.DeviceMotionEvent === "undefined") {
      this.#updateStatus({ motion: "UNSUPPORTED" });
      return;
    }

    const dme = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    if (typeof dme.requestPermission === "function") {
      // iOS 13+: requires explicit user gesture to call requestPermission().
      // Do NOT request on page load! Mark as PERMISSION_REQUIRED so user can tap.
      this.#updateStatus({ motion: "PERMISSION_REQUIRED" });
    } else {
      // Android / browsers without permission API
      try {
        window.addEventListener("devicemotion", this.#handleMotion as EventListener);
        this.#updateStatus({ motion: "AVAILABLE" });
      } catch {
        this.#updateStatus({ motion: "UNSUPPORTED" });
      }
    }
  }

  // ── Map matching ───────────────────────────────────────────────────────────

  #matchSegment(lat: number, lng: number): string | undefined {
    let closestId: string | undefined;
    let closestDist = Infinity;

    for (const seg of this.segments) {
      const distKm = calculateDistanceKm(lat, lng, seg.lat, seg.lng);
      const distM = distKm * 1000;
      if (distM <= SEGMENT_MATCH_BUFFER_M && distM < closestDist) {
        closestDist = distM;
        closestId = seg.segment_id;
      }
    }

    return closestId;
  }

  // ── Batch queue ────────────────────────────────────────────────────────────

  #enqueue(observation: BatchObservation): void {
    // Evict oldest if buffer is full (ring-buffer behaviour)
    if (this.buffer.length >= MAX_OFFLINE_BUFFER_SIZE) {
      this.buffer.shift();
    }
    this.buffer.push(observation);

    // Force flush if buffer is full and offline (prevent unbounded growth)
    if (!this.status.isOnline && this.buffer.length >= MAX_OFFLINE_BUFFER_SIZE) {
      this.#flushBuffer();
    }
  }

  #startBatchFlushTimer(): void {
    this.flushTimerId = setInterval(() => {
      if (this.status.isOnline && this.buffer.length > 0) {
        this.#flushBuffer();
      }
    }, BATCH_FLUSH_INTERVAL_MS);
  }

  #flushBuffer(): void {
    if (this.buffer.length === 0) return;
    const flushed = this.buffer.splice(0, this.buffer.length);
    this.callbacks.onBatchFlush(flushed);
  }
}
