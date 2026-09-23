/**
 * Beacon GPS Speed Calculator
 *
 * Implements high-reliability speed determination for mobile browsers:
 * 1. Reads position.coords.speed when it is a finite non-negative value.
 * 2. When coords.speed is null/undefined/unusable, falls back to calculating speed
 *    from consecutive GPS positions (Haversine distance in meters / elapsed seconds * 3.6).
 * 3. Rejects invalid coordinates, duplicate timestamps, poor accuracy fixes, and outlier jumps.
 * 4. Applies Exponential Moving Average (EMA) smoothing to prevent single-sample spikes.
 * 5. Accurately identifies stationary state vs truly unavailable speed.
 * 6. Never uses accelerometer as vehicle speed (motion is strictly for vibration/events).
 */

export interface RawGpsFix {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed?: number | null | undefined;
  };
  timestamp: number;
}

export type GpsSpeedSource =
  | "COORDS_SPEED"
  | "CALCULATED_FALLBACK"
  | "STATIONARY"
  | "UNAVAILABLE";

export type GpsSpeedStatus =
  | "VALID"
  | "STATIONARY"
  | "FIRST_SAMPLE"
  | "POOR_ACCURACY"
  | "DUPLICATE_TIMESTAMP"
  | "INVALID_COORDS"
  | "OUTLIER_REJECTED";

export interface GpsSpeedResult {
  /** Speed in km/h, rounded to 1 decimal place. null if unavailable (e.g. first sample with null coords.speed). */
  speedKmh: number | null;
  /** Raw coords.speed converted to km/h, if provided by the device */
  rawCoordsSpeedKmh: number | null;
  /** Calculated fallback speed from consecutive positions (km/h), if calculated */
  fallbackSpeedKmh: number | null;
  /** Provenance of the reported speed */
  source: GpsSpeedSource;
  /** Status / diagnostic flag of this fix */
  status: GpsSpeedStatus;
  /** Distance in meters from previous valid GPS fix */
  distanceMeters: number | null;
  /** Elapsed seconds since previous valid GPS fix */
  elapsedSeconds: number | null;
}

export interface GpsSpeedDiagnostics {
  gpsAvailable: boolean;
  coordsSpeedRaw: number | null;
  coordsSpeedKmh: number | null;
  calculatedFallbackSpeedKmh: number | null;
  currentSpeedKmh: number | null;
  gpsAccuracyMeters: number;
  timestamp: number;
  samplesReceivedCount: number;
  speedSource: GpsSpeedSource;
  lastCalculationStatus: GpsSpeedStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum valid vehicle speed (km/h) for public transit in Kerala. Above this is rejected as a GPS teleport jump. */
export const MAX_VALID_SPEED_KMH = 140.0;

/** Accuracy threshold (meters) for calculating derivative speed. Poor accuracy circles create massive false speed spikes. */
export const POOR_ACCURACY_THRESHOLD_M = 45.0;

/** Distance threshold (meters) below which vehicle is considered stationary (noise filter). */
export const STATIONARY_DISTANCE_THRESHOLD_M = 1.5;

/** Minimum elapsed time (seconds) between fixes to perform division. */
export const MIN_ELAPSED_SECONDS = 0.25;

/** Maximum elapsed time (seconds) before consecutive calculation resets reference (e.g. phone backgrounded). */
export const MAX_ELAPSED_SECONDS = 30.0;

/** Smoothing factor (alpha) for Exponential Moving Average (EMA). Higher = more responsive; lower = smoother. */
export const SPEED_SMOOTHING_ALPHA = 0.65;

// ─────────────────────────────────────────────────────────────────────────────
// Haversine Distance in Metres
// ─────────────────────────────────────────────────────────────────────────────

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's mean radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GpsSpeedCalculator Class
// ─────────────────────────────────────────────────────────────────────────────

export class GpsSpeedCalculator {
  private prevFix: {
    lat: number;
    lng: number;
    timestamp: number;
    accuracy: number;
  } | null = null;

  private prevSmoothedSpeedKmh: number | null = null;
  private samplesReceivedCount = 0;
  private lastResult: GpsSpeedResult | null = null;
  private lastAccuracyMeters = 0;
  private lastTimestamp = 0;

  /**
   * Reset internal state (call when trip stops or GPS restarts).
   */
  reset(): void {
    this.prevFix = null;
    this.prevSmoothedSpeedKmh = null;
    this.samplesReceivedCount = 0;
    this.lastResult = null;
    this.lastAccuracyMeters = 0;
    this.lastTimestamp = 0;
  }

  /**
   * Calculate speed for a new GPS fix.
   */
  calculate(fix: RawGpsFix): GpsSpeedResult {
    this.samplesReceivedCount += 1;
    this.lastAccuracyMeters = fix.coords.accuracy ?? 0;
    this.lastTimestamp = fix.timestamp || Date.now();

    const lat = fix.coords.latitude;
    const lng = fix.coords.longitude;
    const accuracy = fix.coords.accuracy;
    const timestamp = fix.timestamp || Date.now();

    // 1. Validate coordinates
    if (!isValidCoordinate(lat, lng)) {
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: null,
        source: "UNAVAILABLE",
        status: "INVALID_COORDS",
        distanceMeters: null,
        elapsedSeconds: null,
      };
      this.lastResult = result;
      return result;
    }

    // 2. Check for valid coords.speed (finite, non-negative number)
    const rawCoordsSpeed = fix.coords.speed;
    const hasValidCoordsSpeed =
      typeof rawCoordsSpeed === "number" &&
      Number.isFinite(rawCoordsSpeed) &&
      rawCoordsSpeed >= 0;

    if (hasValidCoordsSpeed) {
      const rawKmh = rawCoordsSpeed * 3.6;

      // Reject outlier coords.speed
      if (rawKmh > MAX_VALID_SPEED_KMH) {
        const result: GpsSpeedResult = {
          speedKmh: this.prevSmoothedSpeedKmh,
          rawCoordsSpeedKmh: Number(rawKmh.toFixed(1)),
          fallbackSpeedKmh: null,
          source: "UNAVAILABLE",
          status: "OUTLIER_REJECTED",
          distanceMeters: null,
          elapsedSeconds: null,
        };
        this.lastResult = result;
        return result;
      }

      // Check for zero / stationary speed
      if (rawKmh === 0) {
        this.prevSmoothedSpeedKmh = 0;
        this.prevFix = { lat, lng, timestamp, accuracy };
        const result: GpsSpeedResult = {
          speedKmh: 0,
          rawCoordsSpeedKmh: 0,
          fallbackSpeedKmh: null,
          source: "COORDS_SPEED",
          status: "STATIONARY",
          distanceMeters: 0,
          elapsedSeconds: null,
        };
        this.lastResult = result;
        return result;
      }

      // Apply slight smoothing if we had a prior speed reading
      const smoothed =
        this.prevSmoothedSpeedKmh !== null && this.prevSmoothedSpeedKmh > 0
          ? SPEED_SMOOTHING_ALPHA * rawKmh + (1 - SPEED_SMOOTHING_ALPHA) * this.prevSmoothedSpeedKmh
          : rawKmh;

      const finalSpeed = Number(smoothed.toFixed(1));
      this.prevSmoothedSpeedKmh = finalSpeed;
      this.prevFix = { lat, lng, timestamp, accuracy };

      const result: GpsSpeedResult = {
        speedKmh: finalSpeed,
        rawCoordsSpeedKmh: Number(rawKmh.toFixed(1)),
        fallbackSpeedKmh: null,
        source: "COORDS_SPEED",
        status: "VALID",
        distanceMeters: null,
        elapsedSeconds: null,
      };
      this.lastResult = result;
      return result;
    }

    // 3. Fallback: coords.speed is null, undefined, or negative.
    // Check if GPS accuracy is too poor for derivative calculation
    if (accuracy > POOR_ACCURACY_THRESHOLD_M) {
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: null,
        source: "UNAVAILABLE",
        status: "POOR_ACCURACY",
        distanceMeters: null,
        elapsedSeconds: null,
      };
      this.lastResult = result;
      return result;
    }

    // First sample case — insufficient information to compute distance/time derivative
    if (this.prevFix === null) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: null,
        source: "UNAVAILABLE",
        status: "FIRST_SAMPLE",
        distanceMeters: null,
        elapsedSeconds: null,
      };
      this.lastResult = result;
      return result;
    }

    // Elapsed time calculation
    const elapsedSeconds = (timestamp - this.prevFix.timestamp) / 1000;

    // Duplicate or backwards timestamp
    if (elapsedSeconds <= 0) {
      const result: GpsSpeedResult = {
        speedKmh: this.prevSmoothedSpeedKmh,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: null,
        source: this.prevSmoothedSpeedKmh !== null ? "CALCULATED_FALLBACK" : "UNAVAILABLE",
        status: "DUPLICATE_TIMESTAMP",
        distanceMeters: null,
        elapsedSeconds,
      };
      this.lastResult = result;
      return result;
    }

    // Very rapid fix (< 0.25s) — skip derivative to avoid division noise
    if (elapsedSeconds < MIN_ELAPSED_SECONDS) {
      const result: GpsSpeedResult = {
        speedKmh: this.prevSmoothedSpeedKmh,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: null,
        source: this.prevSmoothedSpeedKmh !== null ? "CALCULATED_FALLBACK" : "UNAVAILABLE",
        status: "VALID",
        distanceMeters: null,
        elapsedSeconds,
      };
      this.lastResult = result;
      return result;
    }

    // Long gap (> 30s) — reset baseline rather than computing speed across sleep gap
    if (elapsedSeconds > MAX_ELAPSED_SECONDS) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      this.prevSmoothedSpeedKmh = null;
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: null,
        source: "UNAVAILABLE",
        status: "FIRST_SAMPLE",
        distanceMeters: null,
        elapsedSeconds,
      };
      this.lastResult = result;
      return result;
    }

    // Calculate distance moved in metres
    const distanceMeters = calculateDistanceMeters(
      this.prevFix.lat,
      this.prevFix.lng,
      lat,
      lng,
    );

    // Stationary phone check: movement below stationary noise threshold
    if (distanceMeters < STATIONARY_DISTANCE_THRESHOLD_M) {
      this.prevSmoothedSpeedKmh = 0;
      this.prevFix = { lat, lng, timestamp, accuracy };
      const result: GpsSpeedResult = {
        speedKmh: 0,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: 0,
        source: "STATIONARY",
        status: "STATIONARY",
        distanceMeters: Number(distanceMeters.toFixed(2)),
        elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
      };
      this.lastResult = result;
      return result;
    }

    // Calculate derived speed: m/s -> km/h
    const metersPerSecond = distanceMeters / elapsedSeconds;
    const rawFallbackSpeedKmh = metersPerSecond * 3.6;

    // Outlier check: reject physically implausible vehicle speeds
    if (rawFallbackSpeedKmh > MAX_VALID_SPEED_KMH) {
      const result: GpsSpeedResult = {
        speedKmh: this.prevSmoothedSpeedKmh,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: Number(rawFallbackSpeedKmh.toFixed(1)),
        source: "UNAVAILABLE",
        status: "OUTLIER_REJECTED",
        distanceMeters: Number(distanceMeters.toFixed(2)),
        elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
      };
      this.lastResult = result;
      return result;
    }

    // Smooth speed slightly using EMA
    const smoothed =
      this.prevSmoothedSpeedKmh !== null && this.prevSmoothedSpeedKmh > 0
        ? SPEED_SMOOTHING_ALPHA * rawFallbackSpeedKmh +
          (1 - SPEED_SMOOTHING_ALPHA) * this.prevSmoothedSpeedKmh
        : rawFallbackSpeedKmh;

    const finalSpeed = Number(smoothed.toFixed(1));
    this.prevSmoothedSpeedKmh = finalSpeed;
    this.prevFix = { lat, lng, timestamp, accuracy };

    const result: GpsSpeedResult = {
      speedKmh: finalSpeed,
      rawCoordsSpeedKmh: null,
      fallbackSpeedKmh: Number(rawFallbackSpeedKmh.toFixed(1)),
      source: "CALCULATED_FALLBACK",
      status: "VALID",
      distanceMeters: Number(distanceMeters.toFixed(2)),
      elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
    };
    this.lastResult = result;
    return result;
  }

  /**
   * Return a diagnostics snapshot suitable for dev mode inspection.
   */
  getDiagnostics(gpsAvailable: boolean): GpsSpeedDiagnostics {
    return {
      gpsAvailable,
      coordsSpeedRaw:
        this.lastResult?.rawCoordsSpeedKmh !== null && this.lastResult?.rawCoordsSpeedKmh !== undefined
          ? Number((this.lastResult.rawCoordsSpeedKmh / 3.6).toFixed(2))
          : null,
      coordsSpeedKmh: this.lastResult?.rawCoordsSpeedKmh ?? null,
      calculatedFallbackSpeedKmh: this.lastResult?.fallbackSpeedKmh ?? null,
      currentSpeedKmh: this.lastResult?.speedKmh ?? null,
      gpsAccuracyMeters: Number(this.lastAccuracyMeters.toFixed(1)),
      timestamp: this.lastTimestamp,
      samplesReceivedCount: this.samplesReceivedCount,
      speedSource: this.lastResult?.source ?? "UNAVAILABLE",
      lastCalculationStatus: this.lastResult?.status ?? "FIRST_SAMPLE",
    };
  }
}
