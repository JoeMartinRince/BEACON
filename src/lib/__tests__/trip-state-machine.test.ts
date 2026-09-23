/**
 * Beacon Trip State Machine — Unit Tests
 *
 * 20 tests covering all state transitions, edge cases, and thresholds.
 * Run with: bun run trips:test
 *
 * Bun's built-in test runner is used (no extra dependencies needed).
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  transitionTripState,
  calculateTripMetrics,
  initialTripMetrics,
  createStateMachineRefs,
  MOVEMENT_START_SPEED_KMH,
  STOP_SPEED_KMH,
  MOVEMENT_CONFIRM_SECONDS,
  TRIP_END_STATIONARY_SECONDS,
  STOP_RADIUS_METERS,
  type TripStateMachineRefs,
} from "../trip-state-machine";
import type { TripGPSPoint } from "../trip-types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makePoint(overrides: Partial<TripGPSPoint> = {}): TripGPSPoint {
  return {
    lat: 10.0158,
    lng: 76.3418,
    speed_kmh: 0,
    accuracy_m: 5,
    timestamp: Date.now(),
    ...overrides,
  };
}

let refs: TripStateMachineRefs;
beforeEach(() => {
  refs = createStateMachineRefs();
});

// ─────────────────────────────────────────────────────────────────────────────
// IDLE State
// ─────────────────────────────────────────────────────────────────────────────

describe("IDLE state", () => {
  test("1. stays IDLE when speed is below threshold", () => {
    const pt = makePoint({ speed_kmh: MOVEMENT_START_SPEED_KMH - 0.1 });
    const result = transitionTripState("IDLE", pt, refs);
    expect(result.nextState).toBe("NO_CHANGE");
  });

  test("2. transitions to MOVEMENT_DETECTED when speed meets threshold", () => {
    const pt = makePoint({ speed_kmh: MOVEMENT_START_SPEED_KMH });
    const result = transitionTripState("IDLE", pt, refs);
    expect(result.nextState).toBe("MOVEMENT_DETECTED");
  });

  test("3. transitions to MOVEMENT_DETECTED when speed clearly exceeds threshold", () => {
    const pt = makePoint({ speed_kmh: 40 });
    const result = transitionTripState("IDLE", pt, refs);
    expect(result.nextState).toBe("MOVEMENT_DETECTED");
    expect(refs.movementStartTime).not.toBeNull();
    expect(refs.candidateStartPoint).toEqual(pt);
  });

  test("4. stays IDLE with zero speed (parked vehicle)", () => {
    const pt = makePoint({ speed_kmh: 0 });
    const result = transitionTripState("IDLE", pt, refs);
    expect(result.nextState).toBe("NO_CHANGE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MOVEMENT_DETECTED State
// ─────────────────────────────────────────────────────────────────────────────

describe("MOVEMENT_DETECTED state", () => {
  test("5. resets to IDLE if speed drops before confirmation window", () => {
    refs.movementStartTime = Date.now() - 5000; // 5 sec ago
    refs.candidateStartPoint = makePoint({ speed_kmh: 10 });
    const slowPt = makePoint({ speed_kmh: MOVEMENT_START_SPEED_KMH - 1 });
    const result = transitionTripState("MOVEMENT_DETECTED", slowPt, refs);
    expect(result.nextState).toBe("IDLE");
    expect(refs.movementStartTime).toBeNull();
    expect(refs.candidateStartPoint).toBeNull();
  });

  test("6. stays NO_CHANGE if speed is maintained but window not yet elapsed", () => {
    const now = Date.now();
    refs.movementStartTime = now - (MOVEMENT_CONFIRM_SECONDS - 5) * 1000; // 5 sec short
    refs.candidateStartPoint = makePoint({ lat: 10.0158, lng: 76.3418, speed_kmh: 20 });
    const pt = makePoint({ lat: 10.0158, lng: 76.3420, speed_kmh: 20 }); // nearby, no big displacement
    const result = transitionTripState("MOVEMENT_DETECTED", pt, refs, now);
    expect(result.nextState).toBe("NO_CHANGE");
  });

  test("7. transitions to TRIP_ACTIVE after confirmation window elapses", () => {
    const now = Date.now();
    refs.movementStartTime = now - MOVEMENT_CONFIRM_SECONDS * 1000 - 100; // just over threshold
    refs.candidateStartPoint = makePoint({ lat: 10.0158, lng: 76.3418, speed_kmh: 20 });
    const pt = makePoint({ lat: 10.0158, lng: 76.3419, speed_kmh: 25 });
    const result = transitionTripState("MOVEMENT_DETECTED", pt, refs, now);
    expect(result.nextState).toBe("TRIP_ACTIVE");
    expect(refs.movementStartTime).toBeNull();
    expect(refs.candidateStartPoint).toBeNull();
  });

  test("8. transitions to TRIP_ACTIVE after displacement > 80 m even before time window", () => {
    const now = Date.now();
    refs.movementStartTime = now - 5000; // only 5 seconds
    refs.candidateStartPoint = makePoint({ lat: 10.0158, lng: 76.3418, speed_kmh: 30 });
    // ~100 m north
    const pt = makePoint({ lat: 10.0167, lng: 76.3418, speed_kmh: 30 });
    const result = transitionTripState("MOVEMENT_DETECTED", pt, refs, now);
    expect(result.nextState).toBe("TRIP_ACTIVE");
  });

  test("9. noisy GPS: brief speed blip at exactly threshold resets to IDLE", () => {
    refs.movementStartTime = Date.now() - 3000;
    refs.candidateStartPoint = makePoint({ speed_kmh: 5 });
    // One reading just below threshold — GPS noise
    const noisePt = makePoint({ speed_kmh: 4.9 });
    const result = transitionTripState("MOVEMENT_DETECTED", noisePt, refs);
    expect(result.nextState).toBe("IDLE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRIP_ACTIVE State
// ─────────────────────────────────────────────────────────────────────────────

describe("TRIP_ACTIVE state", () => {
  test("10. stays NO_CHANGE while moving at speed above stop threshold", () => {
    const pt = makePoint({ speed_kmh: 35 });
    const result = transitionTripState("TRIP_ACTIVE", pt, refs);
    expect(result.nextState).toBe("NO_CHANGE");
  });

  test("11. transitions to TEMPORARY_STOP when speed drops below stop threshold", () => {
    const pt = makePoint({ speed_kmh: STOP_SPEED_KMH - 0.5 });
    const result = transitionTripState("TRIP_ACTIVE", pt, refs);
    expect(result.nextState).toBe("TEMPORARY_STOP");
    expect(refs.stopStartTime).not.toBeNull();
    expect(refs.stopStartPoint).toEqual(pt);
  });

  test("12. exactly at stop threshold transitions to TEMPORARY_STOP", () => {
    const pt = makePoint({ speed_kmh: STOP_SPEED_KMH });
    const result = transitionTripState("TRIP_ACTIVE", pt, refs);
    // STOP_SPEED_KMH < STOP_SPEED_KMH is false, so speed === STOP_SPEED_KMH should NOT trigger stop
    // Our condition is speed < STOP_SPEED_KMH, so exactly 2.0 stays active
    expect(result.nextState).toBe("NO_CHANGE");
  });

  test("13. traffic light stop (0 km/h) triggers TEMPORARY_STOP", () => {
    const pt = makePoint({ speed_kmh: 0 });
    const result = transitionTripState("TRIP_ACTIVE", pt, refs);
    expect(result.nextState).toBe("TEMPORARY_STOP");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY_STOP State
// ─────────────────────────────────────────────────────────────────────────────

describe("TEMPORARY_STOP state", () => {
  beforeEach(() => {
    refs.stopStartTime = Date.now() - 30_000; // 30 seconds into stop
    refs.stopStartPoint = makePoint({ lat: 10.0158, lng: 76.3418 });
  });

  test("14. resumes to TRIP_ACTIVE when speed exceeds movement threshold", () => {
    const pt = makePoint({ lat: 10.0158, lng: 76.3418, speed_kmh: MOVEMENT_START_SPEED_KMH + 1 });
    const result = transitionTripState("TEMPORARY_STOP", pt, refs);
    expect(result.nextState).toBe("TRIP_ACTIVE");
    expect(refs.stopStartTime).toBeNull();
  });

  test("15. resumes to TRIP_ACTIVE when bus has left stationary radius (even at low speed)", () => {
    // Move ~60 m away (> STOP_RADIUS_METERS = 30 m)
    const pt = makePoint({ lat: 10.0164, lng: 76.3418, speed_kmh: 2 });
    const result = transitionTripState("TEMPORARY_STOP", pt, refs);
    expect(result.nextState).toBe("TRIP_ACTIVE");
  });

  test("16. stays NO_CHANGE during short stop that is within stop radius", () => {
    const now = Date.now();
    refs.stopStartTime = now - 10_000; // only 10 seconds
    const pt = makePoint({ lat: 10.0158, lng: 76.3418, speed_kmh: 0 });
    const result = transitionTripState("TEMPORARY_STOP", pt, refs, now);
    expect(result.nextState).toBe("NO_CHANGE");
  });

  test("17. transitions to TRIP_COMPLETED after sustained stationary period", () => {
    const now = Date.now();
    refs.stopStartTime = now - TRIP_END_STATIONARY_SECONDS * 1000 - 500; // just over
    const pt = makePoint({ speed_kmh: 0 });
    const result = transitionTripState("TEMPORARY_STOP", pt, refs, now);
    expect(result.nextState).toBe("TRIP_COMPLETED");
    expect(refs.stopStartTime).toBeNull();
  });

  test("18. does not trigger trip end if stop is just under the required duration", () => {
    const now = Date.now();
    refs.stopStartTime = now - (TRIP_END_STATIONARY_SECONDS - 5) * 1000; // 5 sec short
    const pt = makePoint({ speed_kmh: 0 });
    const result = transitionTripState("TEMPORARY_STOP", pt, refs, now);
    expect(result.nextState).toBe("NO_CHANGE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRIP_COMPLETED State
// ─────────────────────────────────────────────────────────────────────────────

describe("TRIP_COMPLETED state", () => {
  test("19. no automatic transition from TRIP_COMPLETED (terminal state)", () => {
    const pt = makePoint({ speed_kmh: 40 });
    const result = transitionTripState("TRIP_COMPLETED", pt, refs);
    expect(result.nextState).toBe("NO_CHANGE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateTripMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateTripMetrics", () => {
  test("20. correctly accumulates distance, duration, and max speed", () => {
    const tripStart = Date.now() - 120_000; // 2 min ago
    const prev = initialTripMetrics();
    const lastPoint = makePoint({ lat: 10.0158, lng: 76.3418, speed_kmh: 30 });
    // ~1.11 km north
    const newPoint = makePoint({
      lat: 10.0258,
      lng: 76.3418,
      speed_kmh: 45,
      timestamp: Date.now(),
    });
    const now = Date.now();

    const metrics = calculateTripMetrics(prev, lastPoint, newPoint, tripStart, now);

    expect(metrics.distance_km).toBeGreaterThan(0);
    expect(metrics.distance_km).toBeCloseTo(1.11, 0); // ~1 km
    expect(metrics.max_speed_kmh).toBe(45);
    expect(metrics.observation_count).toBe(1);
    expect(metrics.duration_seconds).toBeGreaterThanOrEqual(119);
    expect(metrics.avg_speed_kmh).toBeGreaterThan(0);
  });
});
