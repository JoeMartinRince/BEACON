/**
 * Beacon GPS Speed Calculator — Unit Tests
 *
 * Implements the 10 required test cases specified in Section 13:
 * 1. Stationary GPS + coords.speed = 21 km/h -> validatedSpeed = 0
 * 2. Stationary GPS + coords.speed = null -> validatedSpeed = 0
 * 3. Small GPS jitter -> speed = 0, distance does not accumulate
 * 4. Real movement -> calculatedSpeed > 0
 * 5. Browser speed and calculated speed agree -> valid speed
 * 6. Browser speed is wildly inconsistent with displacement -> reject browser speed
 * 7. Poor GPS accuracy (> 45m) -> rejected, speed = null
 * 8. GPS jump (> 140 km/h) -> rejected, speed = null
 * 9. Duplicate timestamps (elapsed <= 0) -> speed = null
 * 10. First GPS sample -> speed = null until second sample
 * Plus diagnostic snapshot and distance validation.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  GpsSpeedCalculator,
  calculateDistanceMeters,
  type RawGpsFix,
} from "../gps-speed-calculator";

describe("GpsSpeedCalculator — Section 13 Required Test Scenarios", () => {
  let calc: GpsSpeedCalculator;

  beforeEach(() => {
    calc = new GpsSpeedCalculator();
  });

  // ── 1. Stationary GPS + coords.speed = 21 km/h ─────────────────────────────
  test("1. Stationary GPS + coords.speed = 21 km/h -> validatedSpeed = 0", () => {
    const t0 = 1000000;
    // Sample 1: first fix
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: 5.83 }, // ~21 km/h
      timestamp: t0,
    });

    // Sample 2: 2 seconds later at exactly the same spot (stationary on table),
    // but phone browser still reports noisy 5.83 m/s (~21 km/h)
    const res2 = calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: 5.83 },
      timestamp: t0 + 2000,
    });

    expect(res2.speedKmh).toBe(0);
    expect(res2.validatedSpeedKmh).toBe(0);
    expect(res2.motionState).toBe("STATIONARY");
    expect(res2.status).toBe("STATIONARY");
    expect(res2.source).toBe("STATIONARY");
    expect(res2.cumulativeDistanceMeters).toBe(0);
    expect(calc.getCumulativeDistanceMeters()).toBe(0);
  });

  // ── 2. Stationary GPS + coords.speed = null ────────────────────────────────
  test("2. Stationary GPS + coords.speed = null -> validatedSpeed = 0", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 8.0, speed: null },
      timestamp: t0,
    });

    const res2 = calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 8.0, speed: null },
      timestamp: t0 + 2000,
    });

    expect(res2.speedKmh).toBe(0);
    expect(res2.validatedSpeedKmh).toBe(0);
    expect(res2.motionState).toBe("STATIONARY");
    expect(res2.status).toBe("STATIONARY");
    expect(res2.source).toBe("STATIONARY");
    expect(calc.getCumulativeDistanceMeters()).toBe(0);
  });

  // ── 3. Small GPS Jitter ───────────────────────────────────────────────────
  test("3. Small GPS jitter -> speed = 0, distance does not accumulate", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 8.0, speed: null },
      timestamp: t0,
    });

    // Micro-jitter: moved 0.5 meters (0.0000045 deg lat) in 2 seconds (below threshold ~2.5m)
    const res2 = calc.calculate({
      coords: { latitude: 10.0158045, longitude: 76.3418, accuracy: 8.0, speed: null },
      timestamp: t0 + 2000,
    });

    expect(res2.speedKmh).toBe(0);
    expect(res2.motionState).toBe("STATIONARY");
    expect(res2.status).toBe("STATIONARY");
    expect(calc.getCumulativeDistanceMeters()).toBe(0);

    // Another micro-jitter: moved 0.4 meters
    const res3 = calc.calculate({
      coords: { latitude: 10.015808, longitude: 76.3418, accuracy: 8.0, speed: null },
      timestamp: t0 + 4000,
    });

    expect(res3.speedKmh).toBe(0);
    expect(res3.motionState).toBe("STATIONARY");
    expect(calc.getCumulativeDistanceMeters()).toBe(0);
  });

  // ── 4. Real Movement ───────────────────────────────────────────────────────
  test("4. Real movement -> calculatedSpeed > 0", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 8.0, speed: null },
      timestamp: t0,
    });

    // Real movement: ~20.8 meters in 2.0s (~10.4 m/s = 37.4 km/h)
    const res2 = calc.calculate({
      coords: { latitude: 10.015987, longitude: 76.3418, accuracy: 8.0, speed: null },
      timestamp: t0 + 2000,
    });

    expect(res2.calculatedSpeedKmh).not.toBeNull();
    expect(res2.calculatedSpeedKmh!).toBeGreaterThan(30);
    expect(res2.calculatedSpeedKmh!).toBeLessThan(45);
    expect(res2.speedKmh).toBeGreaterThan(0);
    expect(res2.motionState).toBe("MOVING");
    expect(res2.status).toBe("VALID");
    expect(res2.cumulativeDistanceMeters).toBeGreaterThan(15);
  });

  // ── 5. Browser Speed and Calculated Speed Agree ────────────────────────────
  test("5. Browser speed and calculated speed agree -> valid speed", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 8.0, speed: 10.0 }, // 36 km/h
      timestamp: t0,
    });

    // Moved ~20 meters in 2s (calculated speed ~36 km/h), browser reports 10 m/s = 36 km/h
    const res2 = calc.calculate({
      coords: { latitude: 10.01598, longitude: 76.3418, accuracy: 8.0, speed: 10.0 },
      timestamp: t0 + 2000,
    });

    expect(res2.status).toBe("VALID");
    expect(res2.motionState).toBe("MOVING");
    expect(res2.speedKmh).toBeCloseTo(36.0, 1);
    expect(["VALIDATED_BROWSER_SPEED", "COORDS_SPEED"]).toContain(res2.source);
  });

  // ── 6. Browser Speed Wildly Inconsistent with Displacement ──────────────────
  test("6. Browser speed is wildly inconsistent with displacement -> reject browser speed", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 8.0, speed: 10.0 },
      timestamp: t0,
    });

    // Moved ~20 meters in 2s (calculated speed ~36 km/h), but browser speed claims 25 m/s = 90 km/h!
    const res2 = calc.calculate({
      coords: { latitude: 10.01598, longitude: 76.3418, accuracy: 8.0, speed: 25.0 },
      timestamp: t0 + 2000,
    });

    expect(res2.status).toBe("INCONSISTENT_REJECTED");
    expect(res2.source).toBe("CALCULATED_GPS_SPEED");
    expect(res2.validatedSpeedKmh).toBeLessThan(50);
    expect(res2.speedKmh).toBeLessThan(50);
    expect(res2.motionState).toBe("MOVING");
  });

  // ── 7. Poor GPS Accuracy (> 45m) ───────────────────────────────────────────
  test("7. Poor GPS accuracy (>45m) -> rejected, speed = null", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: null },
      timestamp: t0,
    });

    const res2 = calc.calculate({
      coords: { latitude: 10.0165, longitude: 76.3418, accuracy: 75.0, speed: null },
      timestamp: t0 + 2000,
    });

    expect(res2.status).toBe("POOR_ACCURACY");
    expect(res2.speedKmh).toBeNull();
    expect(res2.motionState).toBe("GPS_UNCERTAIN");
  });

  // ── 8. GPS Jump (> 140 km/h) ───────────────────────────────────────────────
  test("8. GPS jump (>140 km/h) -> rejected, speed = null", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: null },
      timestamp: t0,
    });

    // Sudden 500m jump in 1s = 500 m/s = 1800 km/h
    const res2 = calc.calculate({
      coords: { latitude: 10.0203, longitude: 76.3418, accuracy: 10.0, speed: null },
      timestamp: t0 + 1000,
    });

    expect(res2.status).toBe("OUTLIER_REJECTED");
    expect(res2.speedKmh).toBeNull();
    expect(res2.motionState).toBe("GPS_UNCERTAIN");
  });

  // ── 9. Duplicate Timestamps (elapsed <= 0) ─────────────────────────────────
  test("9. Duplicate timestamps (elapsed <= 0) -> speed = null", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: 10.0 },
      timestamp: t0,
    });

    const res2 = calc.calculate({
      coords: { latitude: 10.0160, longitude: 76.3418, accuracy: 10.0, speed: 10.0 },
      timestamp: t0, // Same timestamp
    });

    expect(res2.status).toBe("DUPLICATE_TIMESTAMP");
    expect(res2.speedKmh).toBeNull();
    expect(res2.motionState).toBe("GPS_UNCERTAIN");
  });

  // ── 10. First GPS Sample ───────────────────────────────────────────────────
  test("10. First GPS sample -> speed = null until second sample", () => {
    // Even if browser provides a non-zero speed reading on sample 1,
    // displacement cannot yet be validated, so speed MUST be null
    const res1 = calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 10.0, speed: 10.0 },
      timestamp: 1000000,
    });

    expect(res1.status).toBe("FIRST_SAMPLE");
    expect(res1.speedKmh).toBeNull();
    expect(res1.validatedSpeedKmh).toBeNull();
    expect(res1.calculatedSpeedKmh).toBeNull();
    expect(res1.motionState).toBe("GPS_UNCERTAIN");
    expect(res1.source).toBe("UNAVAILABLE");
  });

  // ── 11. Diagnostics Snapshot ───────────────────────────────────────────────
  test("11. getDiagnostics returns full snapshot matching dev mode requirements", () => {
    const t0 = 1000000;
    calc.calculate({
      coords: { latitude: 10.0158, longitude: 76.3418, accuracy: 6.5, speed: 10.0 },
      timestamp: t0,
    });

    calc.calculate({
      coords: { latitude: 10.01598, longitude: 76.3418, accuracy: 6.5, speed: 10.0 },
      timestamp: t0 + 2000,
    });

    const diag = calc.getDiagnostics(true);
    expect(diag.gpsAvailable).toBe(true);
    expect(diag.coordsSpeedKmh).toBeCloseTo(36.0, 1);
    expect(diag.calculatedSpeedKmh).not.toBeNull();
    expect(diag.validatedSpeedKmh).not.toBeNull();
    expect(diag.currentSpeedKmh).not.toBeNull();
    expect(diag.gpsAccuracyMeters).toBe(6.5);
    expect(diag.motionState).toBe("MOVING");
    expect(diag.lastStepDistanceMeters).toBeGreaterThan(15);
    expect(diag.cumulativeDistanceMeters).toBeGreaterThan(15);
    expect(diag.samplesReceivedCount).toBe(2);
  });

  // ── 12. Long Sleep Gap Resets Baseline ─────────────────────────────────────
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

  // ── 13. Haversine Distance Helper ──────────────────────────────────────────
  test("13. calculateDistanceMeters produces accurate distance for known coordinates", () => {
    // Kakkanad (10.0158, 76.3418) to Edappally (10.0236, 76.3116) ≈ 3.4 km
    const meters = calculateDistanceMeters(10.0158, 76.3418, 10.0236, 76.3116);
    expect(meters).toBeGreaterThan(3300);
    expect(meters).toBeLessThan(3500);
  });
});
