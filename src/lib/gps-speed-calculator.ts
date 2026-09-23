/**
 * Beacon GPS Speed & Distance Telemetry Calculator
 *
 * Implements high-reliability telemetry determination for mobile browsers:
 * 1. FUNDAMENTAL RULE: If the device has not demonstrated meaningful GPS movement,
 *    speedKmh MUST be 0. Never display a non-zero speed when movement is effectively zero.
 * 2. Never trust position.coords.speed blindly. Validate against actual Haversine displacement.
 * 3. Dynamic movement threshold accounts for GPS accuracy of both fixes (prevents GPS jitter while sitting still).
 * 4. Calculated GPS speed (displacement / elapsed) serves as the primary ground truth.
 * 5. Validates browser-reported speed against calculated speed; rejects wildly inconsistent spikes.
 * 6. Explicit motion states: MOVING, STATIONARY, GPS_UNCERTAIN.
 * 7. When STATIONARY: speedKmh = 0, distance does not accumulate.
 * 8. When GPS_UNCERTAIN: speedKmh = null (displays as "—"), avoiding false readings.
 * 9. Distance and speed strictly agree.
 * 10. Lightweight EMA smoothing applied only to validated movement.
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

export type GpsMotionState = "MOVING" | "STATIONARY" | "GPS_UNCERTAIN";

export type GpsSpeedSource =
  | "VALIDATED_BROWSER_SPEED"
  | "CALCULATED_GPS_SPEED"
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
  | "OUTLIER_REJECTED"
  | "INCONSISTENT_REJECTED";

export interface GpsSpeedResult {
  /** Validated speed in km/h, rounded to 1 decimal place. null if uncertain/unavailable. */
  speedKmh: number | null;
  /** Raw coords.speed converted to km/h, if provided by the device */
  rawCoordsSpeedKmh: number | null;
  /** Calculated speed from consecutive GPS positions (km/h) */
  calculatedSpeedKmh: number | null;
  /** Backward compatibility alias for calculatedSpeedKmh */
  fallbackSpeedKmh: number | null;
  /** Validated speed before smoothing (km/h) */
  validatedSpeedKmh: number | null;
  /** Internal motion classification: MOVING, STATIONARY, or GPS_UNCERTAIN */
  motionState: GpsMotionState;
  /** Provenance of the reported speed */
  source: GpsSpeedSource;
  /** Diagnostic status flag of this fix */
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
  calculatedSpeedKmh: number | null;
  calculatedFallbackSpeedKmh: number | null;
  validatedSpeedKmh: number | null;
  currentSpeedKmh: number | null;
  lastStepDistanceMeters: number | null;
  cumulativeDistanceMeters: number;
  gpsAccuracyMeters: number;
  motionState: GpsMotionState;
  altitudeMeters: number | null;
  headingDegrees: number | null;
  timestamp: number;
  samplesReceivedCount: number;
  speedSource: GpsSpeedSource;
  lastCalculationStatus: GpsSpeedStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Constants & Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_BASE_STATIONARY_THRESHOLD_M = 2.0;
export const DEFAULT_MAX_STATIONARY_THRESHOLD_M = 8.0;
export const DEFAULT_ACCURACY_FACTOR = 0.25;
export const MAX_VALID_SPEED_KMH = 140.0;
export const POOR_ACCURACY_THRESHOLD_M = 45.0;
export const MAX_DISTANCE_STEP_METERS = 300.0;
export const MIN_ELAPSED_SECONDS = 0.25;
export const MAX_ELAPSED_SECONDS = 30.0;
export const SPEED_SMOOTHING_ALPHA = 0.65;

export interface GpsCalculatorOptions {
  baseStationaryThresholdM?: number;
  accuracyFactor?: number;
  maxStationaryThresholdM?: number;
  poorAccuracyThresholdM?: number;
  maxValidSpeedKmh?: number;
  smoothingAlpha?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Math & Validation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Haversine formula to compute geodesic distance between two coordinates in metres.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth mean radius in metres
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

/**
 * Calculates a dynamic movement noise threshold in metres based on the reported
 * GPS accuracies of the two consecutive fixes.
 */
export function computeMovementThreshold(
  acc1: number,
  acc2: number,
  baseThresholdM = DEFAULT_BASE_STATIONARY_THRESHOLD_M,
  accuracyFactor = DEFAULT_ACCURACY_FACTOR,
  maxThresholdM = DEFAULT_MAX_STATIONARY_THRESHOLD_M,
): number {
  const avgAccuracy = (acc1 + acc2) / 2;
  const scaled = avgAccuracy * accuracyFactor;
  return Math.max(baseThresholdM, Math.min(maxThresholdM, scaled));
}

/**
 * Cross-validates browser-reported speed against calculated GPS displacement speed.
 * Prevents trusting noisy or stale coords.speed when stationary or in an outlier jump.
 */
export function validateSpeed(
  rawCoordsSpeedKmh: number | null,
  calculatedSpeedKmh: number,
  _stepDistanceMeters: number,
  _elapsedSeconds: number,
  prevValidatedSpeedKmh: number | null,
  isStationary: boolean,
): {
  validatedSpeedKmh: number;
  source: GpsSpeedSource;
  status: GpsSpeedStatus;
} {
  // 1. If device is stationary, speed MUST be 0
  if (isStationary) {
    return {
      validatedSpeedKmh: 0,
      source: "STATIONARY",
      status: "STATIONARY",
    };
  }

  // 2. Reject outlier calculated speeds (> 140 km/h)
  if (calculatedSpeedKmh > MAX_VALID_SPEED_KMH) {
    return {
      validatedSpeedKmh: prevValidatedSpeedKmh ?? 0,
      source: "UNAVAILABLE",
      status: "OUTLIER_REJECTED",
    };
  }

  // 3. If browser speed is available, test consistency against calculated speed
  if (rawCoordsSpeedKmh !== null && rawCoordsSpeedKmh >= 0) {
    if (rawCoordsSpeedKmh > MAX_VALID_SPEED_KMH) {
      return {
        validatedSpeedKmh: calculatedSpeedKmh,
        source: "CALCULATED_GPS_SPEED",
        status: "INCONSISTENT_REJECTED",
      };
    }

    const delta = Math.abs(rawCoordsSpeedKmh - calculatedSpeedKmh);
    const acceptableTolerance = Math.max(12.0, calculatedSpeedKmh * 0.45);

    if (delta <= acceptableTolerance) {
      // Browser speed agrees with physical displacement
      return {
        validatedSpeedKmh: rawCoordsSpeedKmh,
        source: "VALIDATED_BROWSER_SPEED",
        status: "VALID",
      };
    } else {
      // Browser speed is inconsistent with displacement — reject browser speed
      return {
        validatedSpeedKmh: calculatedSpeedKmh,
        source: "CALCULATED_GPS_SPEED",
        status: "INCONSISTENT_REJECTED",
      };
    }
  }

  // 4. Browser speed not provided: ground truth is calculated GPS speed
  return {
    validatedSpeedKmh: calculatedSpeedKmh,
    source: "CALCULATED_GPS_SPEED",
    status: "VALID",
  };
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
  private options: Required<GpsCalculatorOptions>;

  constructor(options?: GpsCalculatorOptions) {
    this.options = {
      baseStationaryThresholdM: options?.baseStationaryThresholdM ?? DEFAULT_BASE_STATIONARY_THRESHOLD_M,
      accuracyFactor: options?.accuracyFactor ?? DEFAULT_ACCURACY_FACTOR,
      maxStationaryThresholdM: options?.maxStationaryThresholdM ?? DEFAULT_MAX_STATIONARY_THRESHOLD_M,
      poorAccuracyThresholdM: options?.poorAccuracyThresholdM ?? POOR_ACCURACY_THRESHOLD_M,
      maxValidSpeedKmh: options?.maxValidSpeedKmh ?? MAX_VALID_SPEED_KMH,
      smoothingAlpha: options?.smoothingAlpha ?? SPEED_SMOOTHING_ALPHA,
    };
  }

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

  resetDistance(): void {
    this.cumulativeDistanceMeters = 0.0;
  }

  getCumulativeDistanceMeters(): number {
    return Number(this.cumulativeDistanceMeters.toFixed(1));
  }

  calculate(fix: RawGpsFix): GpsSpeedResult {
    this.samplesReceivedCount += 1;
    this.lastAccuracyMeters = fix.coords.accuracy ?? 0;
    this.lastTimestamp = fix.timestamp || Date.now();

    const lat = fix.coords.latitude;
    const lng = fix.coords.longitude;
    const accuracy = fix.coords.accuracy;
    const timestamp = fix.timestamp || Date.now();

    const altitude =
      typeof fix.coords.altitude === "number" && Number.isFinite(fix.coords.altitude)
        ? Number(fix.coords.altitude.toFixed(1))
        : null;

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

    const rawCoordsSpeed = fix.coords.speed;
    const rawCoordsSpeedKmh =
      typeof rawCoordsSpeed === "number" && Number.isFinite(rawCoordsSpeed) && rawCoordsSpeed >= 0
        ? Number((rawCoordsSpeed * 3.6).toFixed(1))
        : null;

    // 1. Validate coordinates
    if (!isValidCoordinate(lat, lng)) {
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh,
        calculatedSpeedKmh: null,
        fallbackSpeedKmh: null,
        validatedSpeedKmh: null,
        motionState: "GPS_UNCERTAIN",
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

    // 2. First Sample: cannot compute displacement yet.
    // Section 1 & 13 rule: No speed calculation until second valid sample exists.
    if (this.prevFix === null) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh,
        calculatedSpeedKmh: null,
        fallbackSpeedKmh: null,
        validatedSpeedKmh: null,
        motionState: "GPS_UNCERTAIN",
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

    // 3. Elapsed Time Check
    const elapsedSeconds = (timestamp - this.prevFix.timestamp) / 1000;

    // Duplicate or backwards timestamp
    if (elapsedSeconds <= 0) {
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh,
        calculatedSpeedKmh: null,
        fallbackSpeedKmh: null,
        validatedSpeedKmh: null,
        motionState: "GPS_UNCERTAIN",
        source: "UNAVAILABLE",
        status: "DUPLICATE_TIMESTAMP",
        distanceMeters: null,
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: 0,
        altitudeMeters: altitude,
        headingDegrees: heading,
      };
      this.lastResult = result;
      return result;
    }

    // Very rapid fix (< 0.25s) — skip division noise
    if (elapsedSeconds < MIN_ELAPSED_SECONDS) {
      const result: GpsSpeedResult = {
        speedKmh: this.prevSmoothedSpeedKmh,
        rawCoordsSpeedKmh,
        calculatedSpeedKmh: null,
        fallbackSpeedKmh: null,
        validatedSpeedKmh: this.prevSmoothedSpeedKmh,
        motionState: this.prevSmoothedSpeedKmh && this.prevSmoothedSpeedKmh > 0 ? "MOVING" : "STATIONARY",
        source: this.lastResult?.source ?? "UNAVAILABLE",
        status: "VALID",
        distanceMeters: null,
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
        altitudeMeters: altitude,
        headingDegrees: heading,
      };
      this.lastResult = result;
      return result;
    }

    // Sleep gap (> 30s) — reset reference baseline
    if (elapsedSeconds > MAX_ELAPSED_SECONDS) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      this.prevSmoothedSpeedKmh = null;
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh,
        calculatedSpeedKmh: null,
        fallbackSpeedKmh: null,
        validatedSpeedKmh: null,
        motionState: "GPS_UNCERTAIN",
        source: "UNAVAILABLE",
        status: "FIRST_SAMPLE",
        distanceMeters: null,
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
        altitudeMeters: altitude,
        headingDegrees: heading,
      };
      this.lastResult = result;
      return result;
    }

    // 4. GPS Accuracy Check
    // If accuracy is poor (> 45m), do not interpret tiny position changes as real movement
    if (accuracy > this.options.poorAccuracyThresholdM || this.prevFix.accuracy > this.options.poorAccuracyThresholdM) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh,
        calculatedSpeedKmh: null,
        fallbackSpeedKmh: null,
        validatedSpeedKmh: null,
        motionState: "GPS_UNCERTAIN",
        source: "UNAVAILABLE",
        status: "POOR_ACCURACY",
        distanceMeters: null,
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
        altitudeMeters: altitude,
        headingDegrees: heading,
      };
      this.lastResult = result;
      return result;
    }

    // 5. Calculate Haversine Displacement
    const stepDistanceMeters = calculateDistanceMeters(
      this.prevFix.lat,
      this.prevFix.lng,
      lat,
      lng,
    );

    // Compute dynamic movement noise threshold based on accuracy of both fixes
    const movementThresholdM = computeMovementThreshold(
      this.prevFix.accuracy,
      accuracy,
      this.options.baseStationaryThresholdM,
      this.options.accuracyFactor,
      this.options.maxStationaryThresholdM,
    );

    // 6. Outlier Step Distance Jump (e.g. cell tower teleport > 300m)
    if (stepDistanceMeters > MAX_DISTANCE_STEP_METERS) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh,
        calculatedSpeedKmh: null,
        fallbackSpeedKmh: null,
        validatedSpeedKmh: null,
        motionState: "GPS_UNCERTAIN",
        source: "UNAVAILABLE",
        status: "OUTLIER_REJECTED",
        distanceMeters: Number(stepDistanceMeters.toFixed(2)),
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
        altitudeMeters: altitude,
        headingDegrees: heading,
      };
      this.lastResult = result;
      return result;
    }

    // 7. STATIONARY CHECK (Fundamental Rule)
    // If distance movement is below the dynamic threshold: phone is STATIONARY
    // Speed MUST be 0. Never trust browser coords.speed when stationary.
    if (stepDistanceMeters < movementThresholdM) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      this.prevSmoothedSpeedKmh = 0;

      const result: GpsSpeedResult = {
        speedKmh: 0,
        rawCoordsSpeedKmh,
        calculatedSpeedKmh: 0,
        fallbackSpeedKmh: 0,
        validatedSpeedKmh: 0,
        motionState: "STATIONARY",
        source: "STATIONARY",
        status: "STATIONARY",
        distanceMeters: Number(stepDistanceMeters.toFixed(2)),
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
        altitudeMeters: altitude,
        headingDegrees: heading,
      };
      this.lastResult = result;
      return result;
    }

    // 8. Meaningful Movement Exists -> Calculate Reference GPS Speed
    const calculatedSpeedMps = stepDistanceMeters / elapsedSeconds;
    const calculatedSpeedKmh = Number((calculatedSpeedMps * 3.6).toFixed(1));

    // Reject physically impossible speeds
    if (calculatedSpeedKmh > this.options.maxValidSpeedKmh) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedKmh,
        calculatedSpeedKmh,
        fallbackSpeedKmh: calculatedSpeedKmh,
        validatedSpeedKmh: null,
        motionState: "GPS_UNCERTAIN",
        source: "UNAVAILABLE",
        status: "OUTLIER_REJECTED",
        distanceMeters: Number(stepDistanceMeters.toFixed(2)),
        cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
        elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
        altitudeMeters: altitude,
        headingDegrees: heading,
      };
      this.lastResult = result;
      return result;
    }

    // 9. Speed Validation & Consistency
    const validation = validateSpeed(
      rawCoordsSpeedKmh,
      calculatedSpeedKmh,
      stepDistanceMeters,
      elapsedSeconds,
      this.prevSmoothedSpeedKmh,
      false,
    );

    const validatedSpeed = validation.validatedSpeedKmh;

    // 10. Lightweight EMA Smoothing (only while moving)
    const smoothed =
      this.prevSmoothedSpeedKmh !== null && this.prevSmoothedSpeedKmh > 0
        ? this.options.smoothingAlpha * validatedSpeed +
          (1 - this.options.smoothingAlpha) * this.prevSmoothedSpeedKmh
        : validatedSpeed;

    const finalSpeed = Number(smoothed.toFixed(1));
    this.prevSmoothedSpeedKmh = finalSpeed;
    this.prevFix = { lat, lng, timestamp, accuracy };

    // Accumulate distance ONLY from validated movement
    this.cumulativeDistanceMeters += stepDistanceMeters;

    const result: GpsSpeedResult = {
      speedKmh: finalSpeed,
      rawCoordsSpeedKmh,
      calculatedSpeedKmh,
      fallbackSpeedKmh: calculatedSpeedKmh,
      validatedSpeedKmh: validatedSpeed,
      motionState: "MOVING",
      source: validation.source,
      status: validation.status,
      distanceMeters: Number(stepDistanceMeters.toFixed(2)),
      cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
      elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
      altitudeMeters: altitude,
      headingDegrees: heading,
    };
    this.lastResult = result;
    return result;
  }

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
      calculatedSpeedKmh: this.lastResult?.calculatedSpeedKmh ?? null,
      calculatedFallbackSpeedKmh: this.lastResult?.calculatedSpeedKmh ?? null,
      validatedSpeedKmh: this.lastResult?.validatedSpeedKmh ?? null,
      currentSpeedKmh: this.lastResult?.speedKmh ?? null,
      lastStepDistanceMeters: this.lastResult?.distanceMeters ?? null,
      cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
      gpsAccuracyMeters: Number(this.lastAccuracyMeters.toFixed(1)),
      motionState: this.lastResult?.motionState ?? "GPS_UNCERTAIN",
      altitudeMeters: this.lastAltitude,
      headingDegrees: this.lastHeading,
      timestamp: this.lastTimestamp,
      samplesReceivedCount: this.samplesReceivedCount,
      speedSource: this.lastResult?.source ?? "UNAVAILABLE",
      lastCalculationStatus: this.lastResult?.status ?? "FIRST_SAMPLE",
    };
  }
}
