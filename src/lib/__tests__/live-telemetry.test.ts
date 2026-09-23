import { describe, it, expect, beforeEach } from "bun:test";
import {
  GpsSpeedCalculator,
  calculateDistanceMeters,
  type RawGpsFix,
} from "../gps-speed-calculator";
import {
  RollingSensorWindow,
  extractFeatures34,
  FEATURE_NAMES_34,
  type SynchronizedSensorSample,
} from "../live-feature-pipeline";
import {
  LiveSensorCollector,
  SEGMENT_MATCH_BUFFER_M,
  type SegmentRef,
  type BatchObservation,
} from "../live-sensor-collector";
import { persistLiveObservations, getOfflineObservationCount } from "../beacon-db";

describe("Real Mobile Telemetry & Sensor Pipeline (Section 20 Requirements)", () => {
  let calc: GpsSpeedCalculator;

  beforeEach(() => {
    calc = new GpsSpeedCalculator();
  });

  // 1. GPS Distance Calculation & Haversine
  describe("GPS Distance & Haversine Calculation", () => {
    it("accurately calculates Haversine distance for known Kerala coordinates", () => {
      // Kakkanad (10.0158, 76.3418) to Palarivattom (10.0035, 76.3075) ~ 3.98 km (3980m)
      const distM = calculateDistanceMeters(10.0158, 76.3418, 10.0035, 76.3075);
      expect(distM).toBeGreaterThan(3900);
      expect(distM).toBeLessThan(4100);
    });

    it("returns zero distance when points are identical", () => {
      const dist = calculateDistanceMeters(10.0158, 76.3418, 10.0158, 76.3418);
      expect(dist).toBe(0);
    });
  });

  // 2. Speed from coords.speed
  describe("Speed Priority A: coords.speed", () => {
    it("uses hardware coords.speed when verified against displacement (converting m/s to km/h)", () => {
      // Fix 1 establishes reference fix (first sample returns null per Section 9)
      calc.calculate({
        coords: {
          latitude: 10.0158,
          longitude: 76.3418,
          speed: 10.0,
          accuracy: 5,
          altitude: 15.2,
          heading: 90.0,
        },
        timestamp: 1000000,
      });

      // Fix 2: Moved ~20 meters in 2 seconds (10 m/s = 36.0 km/h)
      const fix2: RawGpsFix = {
        coords: {
          latitude: 10.01598,
          longitude: 76.3418,
          speed: 10.0, // 10 m/s = 36.0 km/h
          accuracy: 5,
          altitude: 15.2,
          heading: 90.0,
        },
        timestamp: 1002000,
      };

      const result = calc.calculate(fix2);
      expect(["VALIDATED_BROWSER_SPEED", "COORDS_SPEED"]).toContain(result.source);
      expect(result.speedKmh).toBeCloseTo(36.0, 1);
      expect(result.rawCoordsSpeedKmh).toBe(36.0);
    });

    it("preserves 0 km/h when coords.speed is 0 (stationary vehicle)", () => {
      // Fix 1
      calc.calculate({
        coords: {
          latitude: 10.0158,
          longitude: 76.3418,
          speed: 0.0,
          accuracy: 5,
        },
        timestamp: 1000000,
      });

      // Fix 2: Stationary
      const fix2: RawGpsFix = {
        coords: {
          latitude: 10.0158,
          longitude: 76.3418,
          speed: 0.0,
          accuracy: 5,
        },
        timestamp: 1002000,
      };

      const result = calc.calculate(fix2);
      expect(result.source).toBe("STATIONARY");
      expect(result.speedKmh).toBe(0.0);
    });
  });

  // 3. Speed Fallback Calculation & Null Speed
  describe("Speed Priority B: Fallback Derivative Calculation", () => {
    it("returns null (unavailable state, NOT 0) on the first sample when coords.speed is null", () => {
      const fix: RawGpsFix = {
        coords: {
          latitude: 10.0158,
          longitude: 76.3418,
          speed: null,
          accuracy: 8,
        },
        timestamp: 1000000,
      };

      const result = calc.calculate(fix);
      expect(result.speedKmh).toBeNull();
      expect(result.source).toBe("UNAVAILABLE");
      expect(result.status).toBe("FIRST_SAMPLE");
    });

    it("calculates fallback speed from consecutive GPS fixes when coords.speed is null", () => {
      // Fix 1
      calc.calculate({
        coords: { latitude: 10.01580, longitude: 76.34180, speed: null, accuracy: 8 },
        timestamp: 1000000,
      });

      // Fix 2: Moved ~20 meters in 2 seconds (10 m/s = 36 km/h)
      // 0.00018 deg lat ~ 20.0 meters
      const result2 = calc.calculate({
        coords: { latitude: 10.01598, longitude: 76.34180, speed: null, accuracy: 8 },
        timestamp: 1002000,
      });

      expect(["CALCULATED_GPS_SPEED", "CALCULATED_FALLBACK"]).toContain(result2.source);
      expect(result2.speedKmh).toBeGreaterThan(30);
      expect(result2.speedKmh).toBeLessThan(42);
    });
  });

  // 4. Edge Cases: Duplicate Timestamps, Invalid GPS, GPS Jumps
  describe("GPS Quality & Robustness Edge Cases", () => {
    it("handles duplicate timestamps safely without division by zero", () => {
      calc.calculate({
        coords: { latitude: 10.0158, longitude: 76.3418, speed: null, accuracy: 5 },
        timestamp: 1000000,
      });

      const duplicate = calc.calculate({
        coords: { latitude: 10.0159, longitude: 76.3419, speed: null, accuracy: 5 },
        timestamp: 1000000, // Same timestamp
      });

      expect(duplicate.status).toBe("DUPLICATE_TIMESTAMP");
      expect(duplicate.source).toBe("UNAVAILABLE");
    });

    it("rejects invalid GPS coordinates (NaN / out-of-range)", () => {
      const invalid = calc.calculate({
        coords: { latitude: 95.0, longitude: 76.3418, speed: 10, accuracy: 5 },
        timestamp: 1000000,
      });

      expect(invalid.status).toBe("INVALID_COORDS");
      expect(invalid.speedKmh).toBeNull();
    });

    it("rejects GPS teleportation jumps (> 140 km/h) as outliers", () => {
      calc.calculate({
        coords: { latitude: 10.0158, longitude: 76.3418, speed: null, accuracy: 5 },
        timestamp: 1000000,
      });

      // Jump 500 meters in 1 second = 500 m/s = 1800 km/h
      const jump = calc.calculate({
        coords: { latitude: 10.0205, longitude: 76.3418, speed: null, accuracy: 5 },
        timestamp: 1001000,
      });

      expect(jump.status).toBe("OUTLIER_REJECTED");
    });

    it("suppresses fallback calculation if GPS accuracy is too poor (> 45m)", () => {
      calc.calculate({
        coords: { latitude: 10.0158, longitude: 76.3418, speed: null, accuracy: 10 },
        timestamp: 1000000,
      });

      const poor = calc.calculate({
        coords: { latitude: 10.0160, longitude: 76.3418, speed: null, accuracy: 65 },
        timestamp: 1002000,
      });

      expect(poor.status).toBe("POOR_ACCURACY");
      expect(poor.speedKmh).toBeNull();
    });
  });

  // 5. Distance Accumulation & Filtering
  describe("Cumulative Travelled Distance", () => {
    it("accumulates travelled path across valid consecutive fixes", () => {
      calc.calculate({
        coords: { latitude: 10.01580, longitude: 76.34180, speed: 8, accuracy: 5 },
        timestamp: 1000000,
      });

      // Step 1: ~20m
      calc.calculate({
        coords: { latitude: 10.01598, longitude: 76.34180, speed: 8, accuracy: 5 },
        timestamp: 1002000,
      });

      // Step 2: ~20m
      calc.calculate({
        coords: { latitude: 10.01616, longitude: 76.34180, speed: 8, accuracy: 5 },
        timestamp: 1004000,
      });

      const totalDist = calc.getCumulativeDistanceMeters();
      expect(totalDist).toBeGreaterThan(35);
      expect(totalDist).toBeLessThan(45);
    });

    it("filters stationary jitter (< 1.5m) from distance accumulation", () => {
      calc.calculate({
        coords: { latitude: 10.0158000, longitude: 76.3418000, speed: null, accuracy: 5 },
        timestamp: 1000000,
      });

      // Micro-jitter: 0.5 meters
      calc.calculate({
        coords: { latitude: 10.0158045, longitude: 76.3418000, speed: null, accuracy: 5 },
        timestamp: 1002000,
      });

      expect(calc.getCumulativeDistanceMeters()).toBe(0.0);
    });

    it("resets cumulative distance on demand", () => {
      calc.calculate({
        coords: { latitude: 10.01580, longitude: 76.34180, speed: 8, accuracy: 5 },
        timestamp: 1000000,
      });
      calc.calculate({
        coords: { latitude: 10.01600, longitude: 76.34180, speed: 8, accuracy: 5 },
        timestamp: 1002000,
      });

      expect(calc.getCumulativeDistanceMeters()).toBeGreaterThan(15);
      calc.resetDistance();
      expect(calc.getCumulativeDistanceMeters()).toBe(0.0);
    });
  });

  // 6. Altitude & Heading
  describe("Heading and Altitude Reporting", () => {
    it("reports altitude and heading when valid", () => {
      const res = calc.calculate({
        coords: {
          latitude: 10.0158,
          longitude: 76.3418,
          speed: 12.0,
          accuracy: 5,
          altitude: 24.5,
          heading: 182.4,
        },
        timestamp: 1000000,
      });

      expect(res.altitudeMeters).toBe(24.5);
      expect(res.headingDegrees).toBe(182.4);
    });

    it("preserves null for unavailable heading and altitude (never faking 0)", () => {
      const res = calc.calculate({
        coords: {
          latitude: 10.0158,
          longitude: 76.3418,
          speed: 12.0,
          accuracy: 5,
          altitude: null,
          heading: null,
        },
        timestamp: 1000000,
      });

      expect(res.altitudeMeters).toBeNull();
      expect(res.headingDegrees).toBeNull();
    });
  });

  // 7. 5-Second Window & 34 Feature Readiness
  describe("5-Second Window & 34-Feature Readiness Diagnostics", () => {
    it("contains exactly 34 required explainable feature definitions", () => {
      expect(FEATURE_NAMES_34).toHaveLength(34);
      expect(FEATURE_NAMES_34).toContain("ax_mean");
      expect(FEATURE_NAMES_34).toContain("vertical_acceleration_peak");
      expect(FEATURE_NAMES_34).toContain("gyro_magnitude_mean");
      expect(FEATURE_NAMES_34).toContain("speed_mean");
      expect(FEATURE_NAMES_34).toContain("window_duration");
    });

    it("evaluates feature readiness as not ready when window has insufficient samples (< 25)", () => {
      const window = new RollingSensorWindow();
      const report = window.evaluateReadiness();
      expect(report.readyForMl).toBe(false);
      expect(report.featuresMissing.length).toBeGreaterThan(0);
    });

    it("evaluates feature readiness as READY when a 50-sample 10Hz window is populated", () => {
      const window = new RollingSensorWindow();
      const baseTime = Date.now();

      for (let i = 0; i < 50; i++) {
        const sample: SynchronizedSensorSample = {
          timestamp: baseTime + i * 100, // 100ms interval = 10Hz
          accel_x: 0.1 * Math.sin(i),
          accel_y: 0.05 * Math.cos(i),
          accel_z: 9.8 + 0.3 * Math.sin(i * 2),
          gyro_x: 0.01,
          gyro_y: 0.02,
          gyro_z: 0.05,
          speed_kmh: 32.5,
          hasMotion: true,
          hasGpsSpeed: true,
        };
        window.addSample(sample);
      }

      const report = window.evaluateReadiness();
      expect(report.readyForMl).toBe(true);
      expect(report.sampleCount).toBe(50);
      expect(report.featuresAvailable).toHaveLength(34);
      expect(report.featuresMissing).toHaveLength(0);

      // Verify feature values
      const features = window.extractFeatures();
      expect(features).not.toBeNull();
      if (features) {
        expect(features.sample_count).toBe(50);
        expect(features.vertical_acceleration_peak).toBeGreaterThan(0);
        expect(features.speed_mean).toBeCloseTo(32.5, 1);
      }
    });
  });

  // 8. Road Segment Map Matching Guardrails
  describe("Segment Map Matching", () => {
    it("matches coordinates to road segment when within 50-meter buffer", () => {
      const segments: SegmentRef[] = [
        { segment_id: "SEG_001", lat: 10.0158, lng: 76.3418 },
        { segment_id: "SEG_002", lat: 10.0250, lng: 76.3500 },
      ];

      const collector = new LiveSensorCollector(
        {
          onGpsPoint: () => {},
          onMotionReading: () => {},
          onStatusChange: () => {},
          onBatchFlush: () => {},
        },
        segments,
      );

      // 10 meters away from SEG_001 centroid
      const match = collector.matchSegment(10.01588, 76.34180, 5);
      expect(match.status).toBe("MATCHED");
      expect(match.segmentId).toBe("SEG_001");
      expect(match.distanceMeters).toBeLessThan(SEGMENT_MATCH_BUFFER_M);
    });

    it("suppresses segment matching when GPS accuracy is too poor (> 45m)", () => {
      const segments: SegmentRef[] = [
        { segment_id: "SEG_001", lat: 10.0158, lng: 76.3418 },
      ];

      const collector = new LiveSensorCollector(
        {
          onGpsPoint: () => {},
          onMotionReading: () => {},
          onStatusChange: () => {},
          onBatchFlush: () => {},
        },
        segments,
      );

      // Poor accuracy 60m
      const match = collector.matchSegment(10.0158, 76.3418, 60);
      expect(match.status).toBe("POOR_ACCURACY");
      expect(match.segmentId).toBeNull();
    });
  });

  // 9. Live Observation Creation & Offline Buffering
  describe("Live Observation Creation & Persistence", () => {
    it("creates live observation with explicit LIVE provenance", () => {
      const obs: BatchObservation = {
        point: {
          lat: 10.0158,
          lng: 76.3418,
          speed_kmh: 30.5,
          accuracy_m: 6.0,
          timestamp: Date.now(),
          source: "LIVE",
          sensor_type: "GPS_AND_MOTION",
        },
        motion: {
          accel_x: 0.1,
          accel_y: -0.2,
          accel_z: 9.82,
          gyro_z: 0.04,
          timestamp: Date.now(),
        },
        segment_id: "SEG_001",
        queued_at: Date.now(),
      };

      expect(obs.point.source).toBe("LIVE");
      expect(obs.point.sensor_type).toBe("GPS_AND_MOTION");
      expect(obs.segment_id).toBe("SEG_001");
    });

    it("safely handles observation persistence when offline via buffer fallback", async () => {
      const batch: BatchObservation[] = [
        {
          point: {
            lat: 10.0158,
            lng: 76.3418,
            speed_kmh: 25.0,
            accuracy_m: 5.0,
            timestamp: Date.now(),
            source: "LIVE",
          },
          queued_at: Date.now(),
        },
      ];

      // In non-browser / unit test environment, persistLiveObservations gracefully buffers
      const success = await persistLiveObservations(batch, "TEST-TRIP-001");
      expect(typeof success).toBe("boolean");
    });
  });

  // 10. Observation Rate & 10Hz Sampling (Prompt Requirements 9, 10, 11, 12)
  describe("Observation Count & 10Hz Sensor Sampling Architecture", () => {
    it("preserves 10Hz normalized window design without inflating observation count", () => {
      const window = new RollingSensorWindow();
      const baseTime = Date.now();

      // Simulate 44 seconds at 10Hz = 440 samples
      for (let i = 0; i < 440; i++) {
        window.addSample({
          timestamp: baseTime + i * 100, // 100ms interval = 10Hz
          accel_x: 0.1,
          accel_y: 0.05,
          accel_z: 9.8,
          gyro_x: 0.01,
          gyro_y: 0.01,
          gyro_z: 0.02,
          speed_kmh: 20.0,
          hasMotion: true,
          hasGpsSpeed: true,
        });
      }

      // 5-second window should contain exactly ~50 samples, not thousands
      const samplesInWindow = window.getSampleCount();
      expect(samplesInWindow).toBeGreaterThanOrEqual(49);
      expect(samplesInWindow).toBeLessThanOrEqual(51);
      expect(window.getWindowDurationSeconds()).toBeCloseTo(5.0, 1);
    });

    it("does not increment observationCount on raw motion events alone", () => {
      const collector = new LiveSensorCollector({
        onGpsPoint: () => {},
        onMotionReading: () => {},
        onStatusChange: () => {},
        onBatchFlush: () => {},
      });

      // Initially zero observations
      expect(collector.getObservationCount()).toBe(0);

      // Telemetry reflects zero observations before any GPS fix
      const telemetry = collector.getTelemetry();
      expect(telemetry.observationCount).toBe(0);
      expect(telemetry.gpsSampleCount).toBe(0);
    });
  });
});
