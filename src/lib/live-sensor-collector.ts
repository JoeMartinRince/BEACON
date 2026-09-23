/**
 * Beacon Live Sensor Collector
 *
 * Full Real Mobile Telemetry Implementation:
 * 1. navigator.geolocation.watchPosition with production-ready options
 *    (enableHighAccuracy: true, maximumAge: 0, timeout: 10000).
 * 2. Real speed determination: coords.speed priority, Haversine consecutive position fallback.
 * 3. Cumulative travelled distance accumulation along the GPS path.
 * 4. Altitude and Heading extraction (preserving null when unavailable).
 * 5. DeviceMotionEvent & DeviceOrientationEvent: 3-axis accelerometer and gyroscope.
 * 6. Rolling 5-second / 50-sample sensor window with 34-feature readiness diagnostics.
 * 7. Road segment map matching (50m buffer, suppressed during poor GPS accuracy).
 * 8. Real-time typed telemetry stream (LiveTelemetry) and offline batch buffering.
 * 9. isSecureContext check to warn against unencrypted HTTP mobile usage.
 */

import { calculateDistanceKm } from "./trip-geocoder";
import { BATCH_FLUSH_INTERVAL_MS, MAX_OFFLINE_BUFFER_SIZE } from "./trip-state-machine";
import type { LiveTelemetry, TripGPSPoint } from "./trip-types";
import {
  GpsSpeedCalculator,
  type GpsSpeedDiagnostics,
  type GpsSpeedResult,
} from "./gps-speed-calculator";
import {
  RollingSensorWindow,
  type FeatureReadinessReport,
} from "./live-feature-pipeline";

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
  /** Rotation around X axis (pitch rate, °/s) from rotationRate.beta */
  gyro_x?: number;
  /** Rotation around Y axis (roll rate, °/s) from rotationRate.gamma */
  gyro_y?: number;
  /** Rotation around Z axis (yaw rate, °/s) from rotationRate.alpha */
  gyro_z: number;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment Matching Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentRef {
  segment_id: string;
  /** Centroid latitude of segment */
  lat: number;
  /** Centroid longitude of segment */
  lng: number;
}

export interface SegmentMatchResult {
  segmentId: string | null;
  distanceMeters: number | null;
  status: "MATCHED" | "OUT_OF_CORRIDOR" | "POOR_ACCURACY" | "SEARCHING";
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
  /** Diagnostics callback for dev mode inspection */
  onDiagnostics?: (diagnostics: GpsSpeedDiagnostics) => void;
  /** Real-time full telemetry snapshot callback */
  onTelemetry?: (telemetry: LiveTelemetry) => void;
  /** 5-second window feature readiness report */
  onFeatureReadiness?: (report: FeatureReadinessReport) => void;
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

  /** High-reliability GPS speed & distance calculator */
  private speedCalculator = new GpsSpeedCalculator();

  /** 5-second rolling window buffer for 34-feature extraction */
  private rollingWindow = new RollingSensorWindow(5.0);

  // Telemetry state counters
  private gpsSampleCount = 0;
  private rawMotionCount = 0;
  private motionSampleCount = 0;
  private observationCount = 0;
  private lastSampledMotionTimestamp = 0;
  private lastTelemetryEmitTimestamp = 0;
  private lastGpsTimestamp: number | null = null;
  private lastMotionTimestamp: number | null = null;
  private lastSpeedKmh: number | null = null;
  private lastLat: number | null = null;
  private lastLng: number | null = null;
  private lastAccuracyM: number | null = null;
  private lastAltitudeM: number | null = null;
  private lastHeadingDeg: number | null = null;
  private lastMatchResult: SegmentMatchResult = {
    segmentId: null,
    distanceMeters: null,
    status: "SEARCHING",
  };

  constructor(callbacks: LiveSensorCollectorCallbacks, segments: SegmentRef[] = []) {
    this.callbacks = callbacks;
    this.segments = segments;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Start collecting sensors. Call once on mount. */
  start(): void {
    if (typeof window === "undefined") return;

    this.speedCalculator.reset();
    this.rollingWindow.reset();
    this.gpsSampleCount = 0;
    this.rawMotionCount = 0;
    this.motionSampleCount = 0;
    this.observationCount = 0;
    this.lastSampledMotionTimestamp = 0;
    this.lastTelemetryEmitTimestamp = 0;

    this.#watchOnlineStatus();
    this.#startGeolocation();
    this.#initMotionSensors();
    this.#startBatchFlushTimer();
    this.#emitTelemetry();
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

    this.speedCalculator.reset();
    this.rollingWindow.reset();

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

  /** Returns total packaged observations count */
  getObservationCount(): number {
    return this.observationCount;
  }

  /** Returns latest GPS speed diagnostics for dev mode */
  getDiagnostics(): GpsSpeedDiagnostics {
    return this.speedCalculator.getDiagnostics(this.status.location === "CONNECTED");
  }

  /** Reset accumulated distance (e.g. when starting a new trip) */
  resetDistance(): void {
    this.speedCalculator.resetDistance();
    this.#emitTelemetry();
  }

  /** Returns full typed real-time telemetry snapshot */
  getTelemetry(): LiveTelemetry {
    const isSecure =
      typeof window !== "undefined"
        ? window.isSecureContext === true || window.location.hostname === "localhost"
        : true;

    const gpsStatus: LiveTelemetry["gpsStatus"] =
      this.status.location === "CONNECTED"
        ? "ACTIVE"
        : this.status.location === "PERMISSION_DENIED"
          ? "DENIED"
          : this.status.location === "CONNECTING"
            ? "WAITING"
            : "UNAVAILABLE";
    const diag = this.speedCalculator.getDiagnostics(this.status.location === "CONNECTED");
    const gpsPermission: "GRANTED" | "DENIED" | "PROMPT" =
      this.status.location === "CONNECTED"
        ? "GRANTED"
        : this.status.location === "PERMISSION_DENIED"
          ? "DENIED"
          : "PROMPT";

    return {
      latitude: this.lastLat,
      longitude: this.lastLng,
      accuracyMeters: this.lastAccuracyM,
      speedKmh: this.lastSpeedKmh,
      rawBrowserSpeedMps: diag.coordsSpeedRawMps,
      browserSpeedKmh: diag.coordsSpeedKmh,
      calculatedSpeedKmh: diag.calculatedSpeedKmh,
      validatedSpeedKmh: diag.validatedSpeedKmh,
      motionState: diag.motionState,
      lastStepDistanceMeters: diag.lastStepDistanceMeters,
      lastGpsIntervalSeconds: diag.elapsedSeconds,
      previousGpsTimestamp: diag.previousTimestamp,
      currentGpsTimestamp: diag.timestamp,
      speedSource: diag.speedSource,
      distanceMeters: this.speedCalculator.getCumulativeDistanceMeters(),
      headingDegrees: this.lastHeadingDeg,
      altitudeMeters: this.lastAltitudeM,
      gpsStatus,
      gpsPermission,
      gpsAvailable: diag.gpsAvailable,
      gpsSampleCount: this.gpsSampleCount,
      lastGpsUpdate: this.lastGpsTimestamp,
      accelerometerAvailable: this.status.motion === "AVAILABLE",
      gyroscopeAvailable:
        this.status.motion === "AVAILABLE" &&
        this.lastMotion !== null &&
        this.lastMotion.gyro_z !== 0,
      accelerometer: this.lastMotion
        ? { x: this.lastMotion.accel_x, y: this.lastMotion.accel_y, z: this.lastMotion.accel_z }
        : null,
      gyroscope: this.lastMotion
        ? {
            alpha: this.lastMotion.gyro_z,
            beta: this.lastMotion.gyro_x ?? 0,
            gamma: this.lastMotion.gyro_y ?? 0,
          }
        : null,
      rawMotionEventsCount: this.rawMotionCount,
      motionSampleCount: this.motionSampleCount,
      lastMotionUpdate: this.lastMotionTimestamp,
      observationCount: this.observationCount,
      matchedSegmentId: this.lastMatchResult.segmentId,
      distanceToSegmentMeters: this.lastMatchResult.distanceMeters,
      segmentMatchStatus: this.lastMatchResult.status,
      isOnline: this.status.isOnline,
      isSecureContext: isSecure,
    };
  }

  /** Returns 5-second window feature readiness report */
  getFeatureReadiness(): FeatureReadinessReport {
    return this.rollingWindow.evaluateReadiness();
  }

  /**
   * Public map-matching helper with accuracy guardrail.
   */
  matchSegment(lat: number, lng: number, accuracyM?: number): SegmentMatchResult {
    // Suppress segment matching if GPS fix is too inaccurate
    if (accuracyM !== undefined && accuracyM > 45) {
      return {
        segmentId: null,
        distanceMeters: null,
        status: "POOR_ACCURACY",
      };
    }

    if (this.segments.length === 0) {
      return {
        segmentId: null,
        distanceMeters: null,
        status: "SEARCHING",
      };
    }

    let closestId: string | null = null;
    let closestDist = Infinity;

    for (const seg of this.segments) {
      const distKm = calculateDistanceKm(lat, lng, seg.lat, seg.lng);
      const distM = distKm * 1000;
      if (distM < closestDist) {
        closestDist = distM;
        if (distM <= SEGMENT_MATCH_BUFFER_M) {
          closestId = seg.segment_id;
        }
      }
    }

    if (closestId !== null) {
      return {
        segmentId: closestId,
        distanceMeters: Number(closestDist.toFixed(1)),
        status: "MATCHED",
      };
    }

    return {
      segmentId: null,
      distanceMeters: Number.isFinite(closestDist) ? Number(closestDist.toFixed(1)) : null,
      status: "OUT_OF_CORRIDOR",
    };
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
          this.#emitTelemetry();
          return true;
        } else {
          this.#updateStatus({ motion: "PERMISSION_REQUIRED" });
          this.#emitTelemetry();
          return false;
        }
      } catch (err) {
        console.warn("Motion permission request error:", err);
        this.#updateStatus({ motion: "PERMISSION_REQUIRED" });
        this.#emitTelemetry();
        return false;
      }
    } else if (typeof window.DeviceMotionEvent !== "undefined") {
      try {
        window.addEventListener("devicemotion", this.#handleMotion as EventListener);
        this.#updateStatus({ motion: "AVAILABLE" });
        this.#emitTelemetry();
        return true;
      } catch {
        this.#updateStatus({ motion: "UNSUPPORTED" });
        this.#emitTelemetry();
        return false;
      }
    }

    this.#updateStatus({ motion: "UNSUPPORTED" });
    this.#emitTelemetry();
    return false;
  }

  // ── Private internals ──────────────────────────────────────────────────────

  #emitTelemetry(): void {
    const telemetry = this.getTelemetry();
    this.callbacks.onTelemetry?.(telemetry);
  }

  #updateStatus(partial: Partial<SensorAvailability>): void {
    this.status = { ...this.status, ...partial };
    this.callbacks.onStatusChange({ ...this.status });
  }

  #handleOnline = (): void => {
    this.#updateStatus({ isOnline: true });
    // Immediately flush any queued observations now that we are back online
    this.#flushBuffer();
    this.#emitTelemetry();
  };

  #handleOffline = (): void => {
    this.#updateStatus({ isOnline: false });
    this.#emitTelemetry();
  };

  #watchOnlineStatus(): void {
    window.addEventListener("online", this.#handleOnline);
    window.addEventListener("offline", this.#handleOffline);
  }

  #startGeolocation(): void {
    if (!("geolocation" in navigator)) {
      this.#updateStatus({ location: "UNAVAILABLE" });
      this.#emitTelemetry();
      return;
    }

    this.#updateStatus({ location: "CONNECTING" });
    this.#emitTelemetry();

    try {
      // Production GPS options: maximumAge: 0 forces fresh GPS chip readings
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this.#handleGpsPosition(pos),
        (err) => this.#handleGpsError(err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    } catch {
      this.#updateStatus({ location: "UNAVAILABLE" });
      this.#emitTelemetry();
    }
  }

  #handleGpsPosition(pos: GeolocationPosition): void {
    this.gpsSampleCount += 1;
    this.lastGpsTimestamp = pos.timestamp || Date.now();
    this.lastLat = pos.coords.latitude;
    this.lastLng = pos.coords.longitude;
    this.lastAccuracyM = Number(pos.coords.accuracy.toFixed(1));

    const speedResult: GpsSpeedResult = this.speedCalculator.calculate({
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
        altitude: pos.coords.altitude,
        heading: pos.coords.heading,
      },
      timestamp: pos.timestamp,
    });

    this.lastSpeedKmh = speedResult.speedKmh;
    this.lastAltitudeM = speedResult.altitudeMeters;
    this.lastHeadingDeg = speedResult.headingDegrees;

    const matchResult = this.matchSegment(
      pos.coords.latitude,
      pos.coords.longitude,
      pos.coords.accuracy,
    );
    this.lastMatchResult = matchResult;

    const point: TripGPSPoint = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      speed_kmh: speedResult.speedKmh,
      accuracy_m: pos.coords.accuracy,
      timestamp: pos.timestamp,
      speed_source: speedResult.source,
      raw_coords_speed_kmh: speedResult.rawCoordsSpeedKmh,
      fallback_speed_kmh: speedResult.fallbackSpeedKmh,
      altitude_m: speedResult.altitudeMeters,
      heading_deg: speedResult.headingDegrees,
      // Motion fields merged from latest DeviceMotion reading
      ...(this.lastMotion
        ? {
            accel_x: this.lastMotion.accel_x,
            accel_y: this.lastMotion.accel_y,
            accel_z: this.lastMotion.accel_z,
            gyro_x: this.lastMotion.gyro_x,
            gyro_y: this.lastMotion.gyro_y,
            gyro_z: this.lastMotion.gyro_z,
            sensor_type: "GPS_AND_MOTION" as const,
          }
        : { sensor_type: "GPS_ONLY" as const }),
      source: "LIVE" as const,
    };

    if (matchResult.segmentId) {
      point.segment_id = matchResult.segmentId;
    }

    // Update location status to CONNECTED on first good fix
    if (this.status.location !== "CONNECTED") {
      this.#updateStatus({ location: "CONNECTED" });
    }

    // Add synchronized sample to 5-second rolling window
    this.rollingWindow.addSample({
      timestamp: pos.timestamp || Date.now(),
      accel_x: this.lastMotion?.accel_x ?? 0,
      accel_y: this.lastMotion?.accel_y ?? 0,
      accel_z: this.lastMotion?.accel_z ?? 9.80665,
      gyro_x: this.lastMotion?.gyro_x ?? 0,
      gyro_y: this.lastMotion?.gyro_y ?? 0,
      gyro_z: this.lastMotion?.gyro_z ?? 0,
      speed_kmh: speedResult.speedKmh ?? 0,
      hasMotion: this.lastMotion !== null,
      hasGpsSpeed: speedResult.speedKmh !== null,
    });

    // Enqueue observation into offline batch queue
    this.#enqueue({
      point,
      ...(this.lastMotion ? { motion: this.lastMotion } : {}),
      ...(matchResult.segmentId ? { segment_id: matchResult.segmentId } : {}),
      queued_at: Date.now(),
    });

    // Fire diagnostics and telemetry callbacks
    const diagnostics = this.speedCalculator.getDiagnostics(true);
    this.callbacks.onDiagnostics?.(diagnostics);
    this.callbacks.onFeatureReadiness?.(this.rollingWindow.evaluateReadiness());
    this.#emitTelemetry();

    // Notify caller with new GPS point
    this.callbacks.onGpsPoint(point, matchResult.segmentId ?? undefined);
  }

  #handleGpsError(err: GeolocationPositionError): void {
    if (err.code === err.PERMISSION_DENIED) {
      this.#updateStatus({ location: "PERMISSION_DENIED" });
    } else {
      this.#updateStatus({ location: "UNAVAILABLE" });
    }
    const diagnostics = this.speedCalculator.getDiagnostics(false);
    this.callbacks.onDiagnostics?.(diagnostics);
    this.#emitTelemetry();
  }

  #handleMotion = (evt: DeviceMotionEvent): void => {
    const accel = evt.accelerationIncludingGravity ?? evt.acceleration;
    if (!accel) return;

    const now = Date.now();
    this.rawMotionCount += 1;
    this.lastMotionTimestamp = now;

    const reading: MotionReading = {
      accel_x: Number((accel.x ?? 0).toFixed(4)),
      accel_y: Number((accel.y ?? 0).toFixed(4)),
      accel_z: Number((accel.z ?? 0).toFixed(4)),
      gyro_x: evt.rotationRate?.beta !== undefined && evt.rotationRate.beta !== null ? Number(evt.rotationRate.beta.toFixed(4)) : 0,
      gyro_y: evt.rotationRate?.gamma !== undefined && evt.rotationRate.gamma !== null ? Number(evt.rotationRate.gamma.toFixed(4)) : 0,
      gyro_z: evt.rotationRate?.alpha !== undefined && evt.rotationRate.alpha !== null ? Number(evt.rotationRate.alpha.toFixed(4)) : 0,
      timestamp: now,
    };

    this.lastMotion = reading;
    this.callbacks.onMotionReading(reading);

    // Normalize sensor sampling to ~10Hz (every 95-100ms) for the 5-second ML rolling window
    if (now - this.lastSampledMotionTimestamp >= 95) {
      this.lastSampledMotionTimestamp = now;
      this.motionSampleCount += 1;

      // Append to rolling window for feature evaluation
      this.rollingWindow.addSample({
        timestamp: reading.timestamp,
        accel_x: reading.accel_x,
        accel_y: reading.accel_y,
        accel_z: reading.accel_z,
        gyro_x: reading.gyro_x ?? 0,
        gyro_y: reading.gyro_y ?? 0,
        gyro_z: reading.gyro_z,
        speed_kmh: this.lastSpeedKmh ?? 0,
        hasMotion: true,
        hasGpsSpeed: this.lastSpeedKmh !== null,
      });

      this.callbacks.onFeatureReadiness?.(this.rollingWindow.evaluateReadiness());

      // Throttle telemetry emissions to UI to ~4Hz (every 250ms) to avoid lagging the React render loop
      if (now - this.lastTelemetryEmitTimestamp >= 250) {
        this.lastTelemetryEmitTimestamp = now;
        this.#emitTelemetry();
      }
    }
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

  // ── Batch queue ────────────────────────────────────────────────────────────

  #enqueue(observation: BatchObservation): void {
    this.observationCount += 1;
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
