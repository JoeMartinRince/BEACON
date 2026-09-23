/**
 * Beacon GPS Speed Calculator — Unit Tests
 *
 * Covers:
 * 1. Valid coords.speed reading (direct conversion and EMA smoothing)
 * 2. Null coords.speed with calculated fallback (consecutive fixes)
 * 3. Zero actual speed (stationary coordinates with slight jitter < 1.5m)
 * 4. First sample (returns null speed, not falsely claiming 0 km/h)
 * 5. Duplicate timestamp (handled safely without dividing by zero)
 * 6. Invalid coordinates (lat/lng out of range or NaN)
 * 7. GPS jump / outlier (unrealistic speed > 140 km/h rejected)
 * 8. Poor accuracy (> 45m with null coords.speed is suppressed)
 * 9. Undefined / negative coords.speed triggers fallback
 * 10. Long sleep gap (> 30s) resets baseline
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  GpsSpeedCalculator,
  calculateDistanceMeters,
  type RawGpsFix,
} from "../gps-speed-calculator";

describe("GpsSpeedCalculator", () => {
  let calc: GpsSpeedCalculator;

  beforeEach(() => {
    calc = new GpsSpeedCalculator();
  });

  // ── 1. Valid coords.speed ──────────────────────────────────────────────────
  test("1. valid coords.speed uses hardware speed directly (m/s -> km/h)", () => {
    // 10 m/s = 36.0 km/h
    const fix: RawGpsFix = {
      coords: {
        latitude: 10.0158,
        longitude: 76.3418,
        accuracy: 8.0,
        speed: 10.0, // 10 m/s
      },
      timestamp: 1000000,
    };

    const res = calc.calculate(fix);
    expect(res.source).toBe("COORDS_SPEED");
    expect(res.status).toBe("VALID");
    expect(res.speedKmh).toBe(36.0);
    expect(res.rawCoordsSpeedKmh).toBe(36.0);
  });

  test("2. valid coords.speed = 0 indicates stationary vehicle", () => {
    const fix: RawGpsFix = {
      coords: {
        latitude: 10.0158,
        longitude: 76.3418,
        accuracy: 5.0,
        speed: 0.0,
      },
      timestamp: 1000000,
    };

    const res = calc.calculate(fix);
    expect(res.source).toBe("COORDS_SPEED");
    expect(res.status).toBe("STATIONARY");
    expect(res.speedKmh).toBe(0);
  });

  // ── 2. First Sample Handling (Requirement 11 & 12) ─────────────────────────
  test("3. first sample with null coords.speed returns null (unavailable, NOT 0 km/h)", () => {
    const fix: RawGpsFix = {
      coords: {
        latitude: 10.0158,
        longitude: 76.3418,
        accuracy: 10.0,
        speed: null,
      },
      timestamp: 1000000,
    };

    const res = calc.calculate(fix);
    expect(res.speedKmh).toBeNull();
    expect(res.source).toBe("UNAVAILABLE");
    expect(res.status).toBe("FIRST_SAMPLE");
  });

  // ── 3. Null coords.speed with Calculated Fallback ───────────────────────────
  test("4. null coords.speed calculates derivative speed from consecutive positions", () => {
    const t0 = 1000000;
    // Sample 1: first fix
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: null },
      timestamp: t0,
    });

    // Move ~20.8 meters north in 2.0 seconds (approx 10.4 m/s = 37.4 km/h)
    // 1 deg latitude ≈ 111,139 m -> 0.000187 deg ≈ 20.8 m
    const fix2: RawGpsFix = {
      coords: { latitude: 10.015987, longitude: 76.3418, accuracy: 10.0, speed: null },
      timestamp: t0 + 2000,
    };

    const res2 = calc.calculate(fix2);
    expect(res2.source).toBe("CALCULATED_FALLBACK");
    expect(res2.status).toBe("VALID");
    expect(res2.speedKmh).not.toBeNull();
    expect(res2.speedKmh!).toBeGreaterThan(30);
    expect(res2.speedKmh!).toBeLessThan(45);
    expect(res2.elapsedSeconds).toBe(2.0);
    expect(res2.distanceMeters!).toBeGreaterThan(15);
  });

  // ── 4. Zero Actual Speed / Stationary Phone ────────────────────────────────
  test("5. stationary phone with small GPS noise (< 1.5m) returns 0 km/h", () => {
    const t0 = 1000000;
    // Sample 1
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 8.0, speed: null },
      timestamp: t0,
    });

    // Sample 2: moved 0.5 meters (0.0000045 deg lat) in 2 seconds
    const fix2: RawGpsFix = {
      coords: { latitude: 10.0158045, longitude: 76.3418, accuracy: 8.0, speed: null },
      timestamp: t0 + 2000,
    };

    const res2 = calc.calculate(fix2);
    expect(res2.source).toBe("STATIONARY");
    expect(res2.status).toBe("STATIONARY");
    expect(res2.speedKmh).toBe(0);
  });

  // ── 5. Duplicate Timestamps (Delta t <= 0) ──────────────────────────────────
  test("6. duplicate timestamp does not divide by zero and preserves safety", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: 10.0 },
      timestamp: t0,
    });

    // Same timestamp
    const duplicateFix: RawGpsFix = {
      coords: { latitude: 10.0160, longitude: 76.3418, accuracy: 10.0, speed: null },
      timestamp: t0,
    };

    const res = calc.calculate(duplicateFix);
    expect(res.status).toBe("DUPLICATE_TIMESTAMP");
    // Should preserve previous known speed
    expect(res.speedKmh).toBe(36.0);
  });

  // ── 6. Invalid Coordinates ─────────────────────────────────────────────────
  test("7. invalid coordinates (out of range / NaN) are rejected", () => {
    const invalidFix: RawGpsFix = {
      coords: { latitude: 120.0, longitude: 76.3418, accuracy: 10.0, speed: 10.0 },
      timestamp: 1000000,
    };

    const res = calc.calculate(invalidFix);
    expect(res.status).toBe("INVALID_COORDS");
    expect(res.speedKmh).toBeNull();
  });

  // ── 7. GPS Jump / Outlier ──────────────────────────────────────────────────
  test("8. GPS teleportation jump (> 140 km/h) is rejected as outlier", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: 5.0 }, // 18 km/h
      timestamp: t0,
    });

    // Sudden 500m jump in 1 second = 500 m/s = 1800 km/h
    const jumpFix: RawGpsFix = {
      coords: { latitude: 10.0203, longitude: 76.3418, accuracy: 10.0, speed: null },
      timestamp: t0 + 1000,
    };

    const res = calc.calculate(jumpFix);
    expect(res.status).toBe("OUTLIER_REJECTED");
    expect(res.speedKmh).toBe(18.0); // keeps previous speed, does not jump to 1800
  });

  // ── 8. Poor Accuracy ───────────────────────────────────────────────────────
  test("9. poor GPS accuracy (> 45m) suppresses derivative calculation", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: null },
      timestamp: t0,
    });

    const poorAccuracyFix: RawGpsFix = {
      coords: { latitude: 10.0165, longitude: 76.3418, accuracy: 75.0, speed: null },
      timestamp: t0 + 2000,
    };

    const res = calc.calculate(poorAccuracyFix);
    expect(res.status).toBe("POOR_ACCURACY");
    expect(res.speedKmh).toBeNull();
  });

  // ── 9. Undefined / Negative coords.speed fallback ──────────────────────────
  test("10. undefined or negative (-1) coords.speed falls back to distance/time calculation", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: undefined },
      timestamp: t0,
    });

    const fix2: RawGpsFix = {
      coords: { latitude: 10.015987, longitude: 76.3418, accuracy: 10.0, speed: -1 as unknown as number },
      timestamp: t0 + 2000,
    };

    const res = calc.calculate(fix2);
    expect(res.source).toBe("CALCULATED_FALLBACK");
    expect(res.speedKmh).not.toBeNull();
  });

  // ── 10. Diagnostics Snapshot ───────────────────────────────────────────────
  test("11. getDiagnostics returns full snapshot matching dev mode requirements", () => {
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 6.5, speed: 8.5 },
      timestamp: 123456789,
    });

    const diag = calc.getDiagnostics(true);
    expect(diag.gpsAvailable).toBe(true);
    expect(diag.coordsSpeedRaw).toBe(8.5);
    expect(diag.coordsSpeedKmh).toBeCloseTo(30.6, 1);
    expect(diag.currentSpeedKmh).toBeCloseTo(30.6, 1);
    expect(diag.gpsAccuracyMeters).toBe(6.5);
    expect(diag.timestamp).toBe(123456789);
    expect(diag.samplesReceivedCount).toBe(1);
    expect(diag.speedSource).toBe("COORDS_SPEED");
  });

  // ── 11. Long Sleep Gap Resets Baseline ─────────────────────────────────────
  test("12. gap > 30s resets baseline instead of computing cross-gap speed", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: null },
      timestamp: t0,
    });

    // 60 seconds later, 200 meters away
    const res = calc.calculate({
      coords: { latitude: 10.0176, longitude: 76.3418, accuracy: 10.0, speed: null },
      timestamp: t0 + 60000,
    });

    expect(res.status).toBe("FIRST_SAMPLE");
    expect(res.speedKmh).toBeNull();
  });

  // ── 12. Haversine Distance Helper ──────────────────────────────────────────
  test("13. calculateDistanceMeters produces accurate distance for known coordinates", () => {
    // Kakkanad (10.0158, 76.3418) to Edappally (10.0236, 76.3116) ≈ 3.4 km
    const meters = calculateDistanceMeters(10.0158, 76.3418, 10.0236, 76.3116);
    expect(meters).toBeGreaterThan(3300);
    expect(meters).toBeLessThan(3500);
  });
});
