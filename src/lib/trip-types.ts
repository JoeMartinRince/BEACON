export type TripDetectionState =
  "IDLE" | "MOVEMENT_DETECTED" | "TRIP_ACTIVE" | "TEMPORARY_STOP" | "TRIP_COMPLETED";

export type TripDetectionMode = "AUTO" | "MANUAL";

export type EventSourceType = "SYNTHETIC" | "ML" | "LIVE" | "DEMO" | "MANUAL";

export interface TripGPSPoint {
  lat: number;
  lng: number;
  speed_kmh: number | null;
  accuracy_m: number;
  timestamp: number;
  location_name?: string | undefined;
  // ── Extended fields added in Prompt 4 & 5 ─────────────────────────────────
  /** Accelerometer X axis (m/s²) from DeviceMotionEvent */
  accel_x?: number | undefined;
  /** Accelerometer Y axis (m/s²) from DeviceMotionEvent */
  accel_y?: number | undefined;
  /** Accelerometer Z axis (m/s²) from DeviceMotionEvent */
  accel_z?: number | undefined;
  /** Rotation rate around Z axis (yaw, °/s) from DeviceMotionEvent */
  gyro_z?: number | undefined;
  /** Road segment matched to this GPS fix (within 50 m buffer) */
  segment_id?: string | undefined;
  /** Whether motion sensors contributed to this observation */
  sensor_type?: "GPS_ONLY" | "GPS_AND_MOTION" | undefined;
  /** Data provenance */
  source?: EventSourceType | undefined;
  /** Provenance of the reported speed */
  speed_source?: "VALIDATED_BROWSER_SPEED" | "CALCULATED_GPS_SPEED" | "COORDS_SPEED" | "CALCULATED_FALLBACK" | "STATIONARY" | "DEMO" | "MANUAL" | "UNAVAILABLE" | undefined;
  /** Raw coords.speed converted to km/h if available */
  raw_coords_speed_kmh?: number | null | undefined;
  /** Calculated fallback speed from consecutive fixes (km/h) */
  fallback_speed_kmh?: number | null | undefined;
  /** Altitude in meters above sea level if available */
  altitude_m?: number | null | undefined;
  /** Heading in degrees (0–360°) if available */
  heading_deg?: number | null | undefined;
}

/**
 * Summary record of a road segment observed during a trip,
 * presented to the contributor as "Road Intelligence Contributed".
 * Note: strictly a UI summary; authoritative condition data remains in segment_conditions.
 */
export interface TripAffectedSegment {
  segment_id: string;
  road_name?: string | undefined;
  hazard_type?: string | undefined;
  severity?: number | undefined;
  confidence?: number | undefined;
  status: "OBSERVED" | "HAZARD_DETECTED";
  source: EventSourceType;
}

export interface Trip {
  trip_id: string;
  bus_id: string;
  start_timestamp: string;
  end_timestamp?: string | undefined;
  start_latitude: number;
  start_longitude: number;
  end_latitude?: number | undefined;
  end_longitude?: number | undefined;
  start_location_name: string;
  destination_location_name?: string | undefined;
  current_location_name?: string | undefined;
  distance_km: number;
  duration_seconds: number;
  detection_mode: TripDetectionMode;
  gps_points: TripGPSPoint[];
  event_count: number;
  segment_count: number;
  events_detected?: string[] | undefined;
  segments_covered?: string[] | undefined;
  max_speed_kmh?: number | undefined;
  avg_speed_kmh?: number | undefined;
  status: TripDetectionState;
  /** Total sensor observations recorded during this trip */
  observations_count?: number | undefined;
  /** Informational list of observed segments for contributor feedback */
  affected_segments?: TripAffectedSegment[] | undefined;
}

export interface TripSettings {
  movementSpeedThresholdKmh: number;
  startConfirmationSeconds: number;
  temporaryStopThresholdSeconds: number;
  tripEndConfirmationSeconds: number;
  stationaryRadiusMeters: number;
  minGpsAccuracyMeters: number;
}

export const DEFAULT_TRIP_SETTINGS: TripSettings = {
  movementSpeedThresholdKmh: 5.0,
  startConfirmationSeconds: 45,
  temporaryStopThresholdSeconds: 120, // 2 minutes
  tripEndConfirmationSeconds: 300, // 5 minutes
  stationaryRadiusMeters: 25,
  minGpsAccuracyMeters: 35,
};

// ── Observation and Sensor Types ──────────────────────────────────────────

/**
 * A single bundled road observation submitted to the intelligence pipeline.
 * Combines a GPS fix with optional motion sensor data and segment match.
 */
export interface TripObservation {
  trip_id: string;
  point: TripGPSPoint;
  segment_id?: string | undefined;
  accel_magnitude?: number | undefined;
  gyro_magnitude?: number | undefined;
  captured_at: number;
  source: EventSourceType;
}

/**
 * Snapshot of sensor hardware availability for the current device.
 */
export interface SensorAvailability {
  location: "CONNECTING" | "CONNECTED" | "PERMISSION_DENIED" | "UNAVAILABLE";
  motion: "AVAILABLE" | "UNSUPPORTED" | "PERMISSION_REQUIRED";
  isOnline: boolean;
}

/**
 * Live running metrics computed from the current active trip.
 * Displayed in the LiveTripStatus card.
 */
export interface LiveTripMetrics {
  distance_km: number;
  duration_seconds: number;
  max_speed_kmh: number;
  avg_speed_kmh: number;
  observation_count: number;
}

export type { GpsSpeedDiagnostics, GpsMotionState, GpsSpeedSource, GpsSpeedStatus } from "./gps-speed-calculator";
export type { FeatureReadinessReport, SynchronizedSensorSample } from "./live-feature-pipeline";

export interface LiveTelemetry {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  speedKmh: number | null;
  rawBrowserSpeedMps?: number | null | undefined;
  browserSpeedKmh?: number | null | undefined;
  calculatedSpeedKmh?: number | null | undefined;
  validatedSpeedKmh?: number | null | undefined;
  motionState?: "MOVING" | "STATIONARY" | "GPS_UNCERTAIN" | undefined;
  lastStepDistanceMeters?: number | null | undefined;
  lastGpsIntervalSeconds?: number | null | undefined;
  previousGpsTimestamp?: number | null | undefined;
  currentGpsTimestamp?: number | null | undefined;
  speedSource?: "VALIDATED_BROWSER_SPEED" | "CALCULATED_GPS_SPEED" | "COORDS_SPEED" | "CALCULATED_FALLBACK" | "STATIONARY" | "DEMO" | "MANUAL" | "UNAVAILABLE" | undefined;
  distanceMeters: number;
  headingDegrees: number | null;
  altitudeMeters: number | null;
  gpsStatus: "ACTIVE" | "WAITING" | "DENIED" | "UNAVAILABLE";
  gpsPermission?: "GRANTED" | "DENIED" | "PROMPT" | undefined;
  gpsAvailable?: boolean | undefined;
  gpsSampleCount: number;
  lastGpsUpdate: number | null;
  accelerometerAvailable: boolean;
  gyroscopeAvailable: boolean;
  accelerometer: { x: number; y: number; z: number } | null;
  gyroscope: { alpha: number; beta: number; gamma: number } | null;
  rawMotionEventsCount?: number | undefined;
  motionSampleCount: number;
  lastMotionUpdate: number | null;
  observationCount: number;
  matchedSegmentId: string | null;
  distanceToSegmentMeters: number | null;
  segmentMatchStatus: "MATCHED" | "OUT_OF_CORRIDOR" | "POOR_ACCURACY" | "SEARCHING";
  isOnline?: boolean | undefined;
  isSecureContext: boolean;
}
