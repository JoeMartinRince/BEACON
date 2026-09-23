/**
 * Beacon GPS Speed Calculator & Telemetry Validation Engine
 *
 * Implements:
 * 1. Physical displacement-based speed calculation via the Haversine formula:
 *    calculatedSpeedKmh = (distanceMeters / elapsedSeconds) * 3.6
 * 2. Stationary jitter deadband (0.8m / 1.2 km/h) to reliably filter desk drift
 *    without suppressing walking (3-5 km/h) or low-speed vehicle movement.
 * 3. Browser coords.speed cross-validation against physical displacement.
 *    Rejects noisy/stale browser speeds (e.g. 21 km/h while stationary) and
 *    falls back to calculated GPS speed when coords.speed is null or inconsistent.
 * 4. GPS accuracy guardrails: poor accuracy (> 50m) flags uncertainty without
 *    scaling the stationary threshold or destroying legitimate low-speed movement.
 * 5. Full raw diagnostic snapshots with exact raw values (null preserved).
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
  /** Exact raw coords.speed in m/s directly from the browser, or null */
  rawCoordsSpeedMps: number | null;
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
  coordsSpeedRawMps: number | null;
  coordsSpeedRaw: number | null;
  coordsSpeedKmh: number | null;
  calculatedSpeedKmh: number | null;
  calculatedFallbackSpeedKmh: number | null;
  validatedSpeedKmh: number | null;
  currentSpeedKmh: number | null;
  lastStepDistanceMeters: number | null;
  cumulativeDistanceMeters: number;
  gpsAccuracyMeters: number | null;
  motionState: GpsMotionState;
  altitudeMeters: number | null;
  headingDegrees: number | null;
  timestamp: number | null;
  previousTimestamp: number | null;
  elapsedSeconds: number | null;
  samplesReceivedCount: number;
  speedSource: GpsSpeedSource;
  lastCalculationStatus: GpsSpeedStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Constants & Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Stationary jitter displacement deadband (meters) */
export const STATIONARY_DEADBAND_METERS = 0.8;

/** Minimum calculated speed to consider the device moving (km/h) */
export const MIN_MOVING_SPEED_KMH = 1.2;

/** Maximum plausible vehicle speed on public roads (km/h) */
export const MAX_VALID_SPEED_KMH = 140.0;

/** GPS horizontal accuracy threshold above which fixes are considered too degraded for reliable speed (m) */
export const POOR_ACCURACY_THRESHOLD_M = 50.0;

/** Maximum single-step displacement between updates before rejecting as an outlier teleportation (m) */
export const MAX_DISTANCE_STEP_METERS = 300.0;

/** Minimum elapsed seconds between fixes to calculate derivative speed */
export const MIN_ELAPSED_SECONDS = 0.25;

/** Maximum gap between GPS updates before resetting baseline (seconds) */
export const MAX_ELAPSED_SECONDS = 30.0;

/** Smoothing factor for exponential moving average (EMA) when moving */
export const SPEED_SMOOTHING_ALPHA = 0.5;

export interface GpsCalculatorOptions {
  stationaryDeadbandM?: number;
  minMovingSpeedKmh?: number;
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
  return Number((R * c).toFixed(2));
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
 * Validates browser-reported speed against calculated GPS displacement speed.
 *
 * Priority:
 * 1. If device is stationary (displacement in jitter deadband): speed MUST be 0.
 * 2. If browser speed is available and consistent with displacement: use browser speed.
 * 3. If browser speed is null or wildly inconsistent with displacement: use calculated GPS speed.
 */
export function validateSpeed(
  rawCoordsSpeedKmh: number | null,
  calculatedSpeedKmh: number,
  _stepDistanceMeters: number,
  _elapsedSeconds: number,
  _prevValidatedSpeedKmh: number | null,
  isStationary: boolean,
): {
  validatedSpeedKmh: number;
  source: GpsSpeedSource;
  status: GpsSpeedStatus;
} {
  // 1. If device is stationary, validated speed MUST be 0
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
      validatedSpeedKmh: 0,
      source: "UNAVAILABLE",
      status: "OUTLIER_REJECTED",
    };
  }

  // 3. If browser speed is available, test consistency against calculated speed
  if (rawCoordsSpeedKmh !== null && rawCoordsSpeedKmh >= 0) {
    // If browser reports 0 or near 0 while physical displacement shows active movement (>= 2.5 km/h)
    if (rawCoordsSpeedKmh < 0.5 && calculatedSpeedKmh >= MIN_MOVING_SPEED_KMH) {
      return {
        validatedSpeedKmh: calculatedSpeedKmh,
        source: "CALCULATED_GPS_SPEED",
        status: "INCONSISTENT_REJECTED",
      };
    }

    if (rawCoordsSpeedKmh > MAX_VALID_SPEED_KMH) {
      return {
        validatedSpeedKmh: calculatedSpeedKmh,
        source: "CALCULATED_GPS_SPEED",
        status: "INCONSISTENT_REJECTED",
      };
    }

    const delta = Math.abs(rawCoordsSpeedKmh - calculatedSpeedKmh);
    const acceptableTolerance = Math.max(10.0, calculatedSpeedKmh * 0.45);

    if (delta <= acceptableTolerance) {
      // Browser speed agrees with physical displacement
      return {
        validatedSpeedKmh: rawCoordsSpeedKmh,
        source: "VALIDATED_BROWSER_SPEED",
        status: "VALID",
      };
    } else {
      // Browser speed is inconsistent with displacement — fallback to calculated speed
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

  private prevTimestamp: number | null = null;
  private prevSmoothedSpeedKmh: number | null = null;
  private cumulativeDistanceMeters = 0.0;
  private samplesReceivedCount = 0;
  private lastResult: GpsSpeedResult | null = null;
  private lastAccuracyMeters: number | null = null;
  private lastTimestamp: number | null = null;
  private lastLat: number | null = null;
  private lastLng: number | null = null;
  private lastAltitude: number | null = null;
  private lastHeading: number | null = null;
  private options: Required<GpsCalculatorOptions>;

  constructor(options?: GpsCalculatorOptions) {
    this.options = {
      stationaryDeadbandM: options?.stationaryDeadbandM ?? STATIONARY_DEADBAND_METERS,
      minMovingSpeedKmh: options?.minMovingSpeedKmh ?? MIN_MOVING_SPEED_KMH,
      poorAccuracyThresholdM: options?.poorAccuracyThresholdM ?? POOR_ACCURACY_THRESHOLD_M,
      maxValidSpeedKmh: options?.maxValidSpeedKmh ?? MAX_VALID_SPEED_KMH,
      smoothingAlpha: options?.smoothingAlpha ?? SPEED_SMOOTHING_ALPHA,
    };
  }

  reset(): void {
    this.prevFix = null;
    this.prevTimestamp = null;
    this.prevSmoothedSpeedKmh = null;
    this.cumulativeDistanceMeters = 0.0;
    this.samplesReceivedCount = 0;
    this.lastResult = null;
    this.lastAccuracyMeters = null;
    this.lastTimestamp = null;
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
    this.lastAccuracyMeters = fix.coords.accuracy ?? null;
    this.lastTimestamp = fix.timestamp || Date.now();

    const lat = fix.coords.latitude;
    const lng = fix.coords.longitude;
    const accuracy = fix.coords.accuracy ?? 10.0;
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

    // Read raw browser speed without converting null to 0
    const rawCoordsSpeedMps =
      typeof fix.coords.speed === "number" && Number.isFinite(fix.coords.speed) && fix.coords.speed >= 0
        ? Number(fix.coords.speed.toFixed(2))
        : null;

    const rawCoordsSpeedKmh =
      rawCoordsSpeedMps !== null
        ? Number((rawCoordsSpeedMps * 3.6).toFixed(1))
        : null;

    // 1. Validate coordinates
    if (!isValidCoordinate(lat, lng)) {
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedMps,
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

    // 2. First Sample: cannot compute displacement yet
    // Section 1 & 10 rule: Speed is null until second valid sample exists.
    if (this.prevFix === null) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      this.prevTimestamp = null;
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedMps,
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
    const prevTime = this.prevFix.timestamp;
    this.prevTimestamp = prevTime;
    const elapsedSeconds = (timestamp - prevTime) / 1000;

    // Duplicate or backwards timestamp
    if (elapsedSeconds <= 0) {
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedMps,
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

    // Long sleep gap (> 30s) — reset reference baseline
    if (elapsedSeconds > MAX_ELAPSED_SECONDS) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      this.prevSmoothedSpeedKmh = null;
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedMps,
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
    // If accuracy is severely degraded (> 50m), do not compute derivative speed
    if (accuracy > this.options.poorAccuracyThresholdM || this.prevFix.accuracy > this.options.poorAccuracyThresholdM) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedMps,
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

    // 6. Outlier Step Distance Jump (e.g. cell tower teleport > 300m)
    if (stepDistanceMeters > MAX_DISTANCE_STEP_METERS) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedMps,
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

    // 7. Calculate Derivative Displacement Speed
    const calculatedSpeedMps = stepDistanceMeters / elapsedSeconds;
    const calculatedSpeedKmh = Number((calculatedSpeedMps * 3.6).toFixed(1));

    // Reject physically impossible speeds (> 140 km/h)
    if (calculatedSpeedKmh > this.options.maxValidSpeedKmh) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      const result: GpsSpeedResult = {
        speedKmh: null,
        rawCoordsSpeedMps,
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

    // 8. Stationary State & Deadband Evaluation
    // Device is stationary when displacement is within jitter deadband AND calculated speed is below threshold
    const isStationary =
      stepDistanceMeters === 0 ||
      (stepDistanceMeters <= this.options.stationaryDeadbandM && calculatedSpeedKmh < this.options.minMovingSpeedKmh) ||
      calculatedSpeedKmh < 0.5;

    // 9. Speed Validation
    const validation = validateSpeed(
      rawCoordsSpeedKmh,
      calculatedSpeedKmh,
      stepDistanceMeters,
      elapsedSeconds,
      this.prevSmoothedSpeedKmh,
      isStationary,
    );

    const validatedSpeed = validation.validatedSpeedKmh;

    if (isStationary) {
      this.prevFix = { lat, lng, timestamp, accuracy };
      this.prevSmoothedSpeedKmh = 0;

      const result: GpsSpeedResult = {
        speedKmh: 0,
        rawCoordsSpeedMps,
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

    // 10. Moving Vehicle / Pedestrian: Lightweight EMA Smoothing
    const smoothed =
      this.prevSmoothedSpeedKmh !== null && this.prevSmoothedSpeedKmh > 0
        ? this.options.smoothingAlpha * validatedSpeed +
          (1 - this.options.smoothingAlpha) * this.prevSmoothedSpeedKmh
        : validatedSpeed;

    const finalSpeed = Number(smoothed.toFixed(1));
    this.prevSmoothedSpeedKmh = finalSpeed;
    this.prevFix = { lat, lng, timestamp, accuracy };

    // Accumulate distance ONLY from verified movement
    this.cumulativeDistanceMeters += stepDistanceMeters;

    const result: GpsSpeedResult = {
      speedKmh: finalSpeed,
      rawCoordsSpeedMps,
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
      coordsSpeedRawMps: this.lastResult?.rawCoordsSpeedMps ?? null,
      coordsSpeedRaw: this.lastResult?.rawCoordsSpeedMps ?? null,
      coordsSpeedKmh: this.lastResult?.rawCoordsSpeedKmh ?? null,
      calculatedSpeedKmh: this.lastResult?.calculatedSpeedKmh ?? null,
      calculatedFallbackSpeedKmh: this.lastResult?.calculatedSpeedKmh ?? null,
      validatedSpeedKmh: this.lastResult?.validatedSpeedKmh ?? null,
      currentSpeedKmh: this.lastResult?.speedKmh ?? null,
      lastStepDistanceMeters: this.lastResult?.distanceMeters ?? null,
      cumulativeDistanceMeters: this.getCumulativeDistanceMeters(),
      gpsAccuracyMeters:
        this.lastAccuracyMeters !== null && this.lastAccuracyMeters > 0
          ? Number(this.lastAccuracyMeters.toFixed(1))
          : null,
      motionState: this.lastResult?.motionState ?? "GPS_UNCERTAIN",
      altitudeMeters: this.lastAltitude,
      headingDegrees: this.lastHeading,
      timestamp: this.lastTimestamp,
      previousTimestamp: this.prevTimestamp,
      elapsedSeconds: this.lastResult?.elapsedSeconds ?? null,
      samplesReceivedCount: this.samplesReceivedCount,
      speedSource: this.lastResult?.source ?? "UNAVAILABLE",
      lastCalculationStatus: this.lastResult?.status ?? "FIRST_SAMPLE",
    };
  }
}
