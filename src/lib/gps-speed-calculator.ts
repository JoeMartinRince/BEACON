/**
 * Beacon GPS Speed & Distance Telemetry Calculator
 *
 * Implements high-reliability telemetry determination for mobile browsers:
 * 1. Reads position.coords.speed when it is a finite non-negative value.
 * 2. When coords.speed is null/undefined/unusable, falls back to calculating speed
 *    from consecutive GPS positions (Haversine distance in meters / elapsed seconds * 3.6).
 * 3. Accumulates real travelled distance along the GPS path, filtering stationary noise (< 1.5m)
 *    and rejecting jumps from poor accuracy fixes (> 45m).
 * 4. Extracts altitude and heading when genuinely available from device hardware.
 * 5. Rejects invalid coordinates, duplicate timestamps, and outlier jumps (> 140 km/h).
 * 6. Applies Exponential Moving Average (EMA) smoothing to prevent single-sample spikes.
 * 7. Accurately identifies stationary state vs truly unavailable speed.
 * 8. Never uses accelerometer as vehicle speed (motion is strictly for vibration/events).
 */

export interface RawGpsFix {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed?: number | null | undefined;
    altitude?: number | null | undefined;
    heading?: number | null | undefined;
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
  /** Cumulative valid travelled distance in meters */
  cumulativeDistanceMeters: number;
  /** Elapsed seconds since previous valid GPS fix */
  elapsedSeconds: number | null;
  /** Altitude in meters above sea level, or null if unavailable */
  altitudeMeters: number | null;
  /** Heading in degrees (0–360°), or null if unavailable */
  headingDegrees: number | null;
}

export interface GpsSpeedDiagnostics {
  gpsAvailable: boolean;
  latitude: number | null;
  longitude: number | null;
  coordsSpeedRaw: number | null;
  coordsSpeedKmh: number | null;
  calculatedFallbackSpeedKmh: number | null;
  currentSpeedKmh: number | null;
  cumulativeDistanceMeters: number;
  gpsAccuracyMeters: number;
  altitudeMeters: number | null;
  headingDegrees: number | null;
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

/** Accuracy threshold (meters) for calculating derivative speed/distance. Poor accuracy circles create massive false speed spikes. */
export const POOR_ACCURACY_THRESHOLD_M = 45.0;

/** Distance threshold (meters) below which vehicle is considered stationary (noise filter). */
export const STATIONARY_DISTANCE_THRESHOLD_M = 1.5;

/** Maximum single-step distance jump (meters) accepted between consecutive fixes within typical 1-3s intervals. */
export const MAX_DISTANCE_STEP_METERS = 300.0;

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
  private cumulativeDistanceMeters = 0.0;
  private samplesReceivedCount = 0;
  private lastResult: GpsSpeedResult | null = null;
  private lastAccuracyMeters = 0;
  private lastTimestamp = 0;
  private lastLat: number | null = null;
  private lastLng: number | null = null;
  private lastAltitude: number | null = null;
  private lastHeading: number | null = null;

  /**
   * Reset internal state (call when trip stops or GPS restarts).
   */
  reset(): void {
    this.prevFix = null;
    this.prevSmoothedSpeedKmh = null;
    this.cumulativeDistanceMeters = 0.0;
    this.samplesReceivedCount = 0;
    this.lastResult = null;
    this.lastAccuracyMeters = 0;
    this.lastTimestamp = 0;
    this.lastLat = null;
    this.lastLng = null;
    this.lastAltitude = null;
    this.lastHeading = null;
  }

  /**
   * Reset only distance (e.g. at the confirmed start of a new trip).
   */
  resetDistance(): void {
    this.cumulativeDistanceMeters = 0.0;
  }

  getCumulativeDistanceMeters(): number {
    return Number(this.cumulativeDistanceMeters.toFixed(1));
  }

  /**
   * Calculate speed and accumulate distance for a new GPS fix.
   */
  calculate(fix: RawGpsFix): GpsSpeedResult {
    this.samplesReceivedCount += 1;
    this.lastAccuracyMeters = fix.coords.accuracy ?? 0;
    this.lastTimestamp = fix.timestamp || Date.now();

    const lat = fix.coords.latitude;
    const lng = fix.coords.longitude;
    const accuracy = fix.coords.accuracy;
    const timestamp = fix.timestamp || Date.now();

    // Altitude: expose only when finite number
    const altitude =
      typeof fix.coords.altitude === "number" && Number.isFinite(fix.coords.altitude)
        ? Number(fix.coords.altitude.toFixed(1))
        : null;

    // Heading: expose only when finite number >= 0
    const heading =
      typeof fix.coords.heading === "number" &&
      Number.isFinite(fix.coords.heading) &&
      fix.coords.heading >= 0
        ? Number(fix.coords.heading.toFixed(1))
        : null;

    this.lastLat = lat;
    this.lastLng = lng;
    this.lastAltitude = altitude;
    this.lastHeading = heading;

    // 1. Validate coordinates
    if (!isValidCoordinate(lat, lng)) {
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: null,
        source: "UNAVAILABLE",
        status: "INVALID_COORDS",
        distanceMeters: null,
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: null,
        altitudeMeters: altitude,
        headingDegrees: heading,
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

    // Handle distance accumulation if we have a previous fix
    let incrementalDist = 0;
    let elapsedSeconds: number | null = null;

    if (this.prevFix !== null) {
      elapsedSeconds = (timestamp - this.prevFix.timestamp) / 1000;
      if (elapsedSeconds > 0 && elapsedSeconds <= MAX_ELAPSED_SECONDS) {
        const stepDist = calculateDistanceMeters(this.prevFix.lat, this.prevFix.lng, lat, lng);
        // Only accumulate if accuracy is acceptable, step is above stationary noise, and not a teleport jump
        if (
          accuracy <= POOR_ACCURACY_THRESHOLD_M &&
          this.prevFix.accuracy <= POOR_ACCURACY_THRESHOLD_M &&
          stepDist >= STATIONARY_DISTANCE_THRESHOLD_M &&
          stepDist <= MAX_DISTANCE_STEP_METERS
        ) {
          const stepSpeedKmh = (stepDist / elapsedSeconds) * 3.6;
          if (stepSpeedKmh <= MAX_VALID_SPEED_KMH) {
            incrementalDist = stepDist;
            this.cumulativeDistanceMeters += stepDist;
          }
        }
      }
    }

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
          distanceMeters: incrementalDist > 0 ? Number(incrementalDist.toFixed(2)) : null,
          cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
          elapsedSeconds,
          altitudeMeters: altitude,
          headingDegrees: heading,
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
          cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
          elapsedSeconds,
          altitudeMeters: altitude,
          headingDegrees: heading,
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
        distanceMeters: incrementalDist > 0 ? Number(incrementalDist.toFixed(2)) : null,
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds,
        altitudeMeters: altitude,
        headingDegrees: heading,
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
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds,
        altitudeMeters: altitude,
        headingDegrees: heading,
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
        cumulativeDistanceMeters: 0,
        elapsedSeconds: null,
        altitudeMeters: altitude,
        headingDegrees: heading,
      };
      this.lastResult = result;
      return result;
    }

    // Elapsed time calculation
    const elapsed = (timestamp - this.prevFix.timestamp) / 1000;

    // Duplicate or backwards timestamp
    if (elapsed <= 0) {
      const result: GpsSpeedResult = {
        speedKmh: this.prevSmoothedSpeedKmh,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: null,
        source: this.prevSmoothedSpeedKmh !== null ? "CALCULATED_FALLBACK" : "UNAVAILABLE",
        status: "DUPLICATE_TIMESTAMP",
        distanceMeters: null,
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: elapsed,
        altitudeMeters: altitude,
        headingDegrees: heading,
      };
      this.lastResult = result;
      return result;
    }

    // Very rapid fix (< 0.25s) — skip derivative to avoid division noise
    if (elapsed < MIN_ELAPSED_SECONDS) {
      const result: GpsSpeedResult = {
        speedKmh: this.prevSmoothedSpeedKmh,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: null,
        source: this.prevSmoothedSpeedKmh !== null ? "CALCULATED_FALLBACK" : "UNAVAILABLE",
        status: "VALID",
        distanceMeters: null,
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: elapsed,
        altitudeMeters: altitude,
        headingDegrees: heading,
      };
      this.lastResult = result;
      return result;
    }

    // Long gap (> 30s) — reset baseline rather than computing speed across sleep gap
    if (elapsed > MAX_ELAPSED_SECONDS) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      this.prevSmoothedSpeedKmh = null;
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh: null,
        fallbackSpeedKmh: null,
        source: "UNAVAILABLE",
        status: "FIRST_SAMPLE",
        distanceMeters: null,
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: elapsed,
        altitudeMeters: altitude,
        headingDegrees: heading,
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
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: Number(elapsed.toFixed(2)),
        altitudeMeters: altitude,
        headingDegrees: heading,
      };
      this.lastResult = result;
      return result;
    }

    // Calculate derived speed: m/s -> km/h
    const metersPerSecond = distanceMeters / elapsed;
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
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: Number(elapsed.toFixed(2)),
        altitudeMeters: altitude,
        headingDegrees: heading,
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
      cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
      elapsedSeconds: Number(elapsed.toFixed(2)),
      altitudeMeters: altitude,
      headingDegrees: heading,
    };
    this.lastResult = result;
    return result;
  }

  /**
   * Return a diagnostics snapshot suitable for dev mode inspection.
   */
  getDiagnostics(gpsAvailable?: boolean): GpsSpeedDiagnostics {
    const isAvailable =
      gpsAvailable !== undefined
        ? gpsAvailable
        : this.samplesReceivedCount > 0 && this.lastLat !== null;
    return {
      gpsAvailable: isAvailable,
      latitude: this.lastLat,
      longitude: this.lastLng,
      coordsSpeedRaw:
        this.lastResult?.rawCoordsSpeedKmh !== null && this.lastResult?.rawCoordsSpeedKmh !== undefined
          ? Number((this.lastResult.rawCoordsSpeedKmh / 3.6).toFixed(2))
          : null,
      coordsSpeedKmh: this.lastResult?.rawCoordsSpeedKmh ?? null,
      calculatedFallbackSpeedKmh: this.lastResult?.fallbackSpeedKmh ?? null,
      currentSpeedKmh: this.lastResult?.speedKmh ?? null,
      cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
      gpsAccuracyMeters: Number(this.lastAccuracyMeters.toFixed(1)),
      altitudeMeters: this.lastAltitude,
      headingDegrees: this.lastHeading,
      timestamp: this.lastTimestamp,
      samplesReceivedCount: this.samplesReceivedCount,
      speedSource: this.lastResult?.source ?? "UNAVAILABLE",
      lastCalculationStatus: this.lastResult?.status ?? "FIRST_SAMPLE",
    };
  }
}
