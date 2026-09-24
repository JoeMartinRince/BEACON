/**
 * Beacon Traveller Route Intelligence — Unit Tests
 *
 * Validates:
 * 1. Exactly 12 predefined Kerala demo corridors.
 * 2. 7 observed Kochi corridors mapped to authentic segment IDs.
 * 3. 5 statewide corridors with waypoints and INSUFFICIENT_OBSERVATIONS status.
 * 4. Length-weighted condition scoring and classification boundaries.
 * 5. Scale-safe observation confidence normalization (0-100%).
 * 6. Hazard counts arithmetic (potholes, speed breakers, broken patches, roughness).
 * 7. Suppression exclusion (filtered non-hazards are not counted as hazards).
 * 8. Zero fabrication for unmonitored statewide routes.
 */

import { describe, test, expect } from "bun:test";
import {
  DEMO_ROUTES,
  calculateRouteCondition,
  type DemoRoute,
} from "../traveller-routes";
import type { SegmentRow } from "../roadsense-data";

function createMockSegment(
  id: string,
  lengthM: number,
  score: number,
  confidence: number,
  potholes = 0,
  speedBreakers = 0,
  brokenPatches = 0,
  roughness = 0,
  suppressed = 0,
  passes = 60,
  buses = 10,
  affectedPasses = 0
): SegmentRow {
  return {
    segment_id: id,
    road_name: "NH_CORRIDOR_A",
    road_type: "HIGHWAY",
    length_m: lengthM,
    start_latitude: 9.99,
    start_longitude: 76.28,
    end_latitude: 9.991,
    end_longitude: 76.281,
    condition_score: score,
    condition_class: score >= 80 ? "GOOD" : score >= 50 ? "MODERATE" : "POOR",
    confidence,
    pothole_count: potholes,
    speed_breaker_count: speedBreakers,
    broken_patch_count: brokenPatches,
    roughness_count: roughness,
    suppressed_count: suppressed,
    pass_count: passes,
    unique_bus_count: buses,
    affected_pass_count: affectedPasses,
    last_observed_at: "2026-09-18T06:30:00Z",
  };
}

describe("Traveller Route Intelligence — Corridor Specifications", () => {
  test("defines exactly 12 predefined Kerala corridors", () => {
    expect(DEMO_ROUTES).toHaveLength(12);
  });

  test("7 routes are OBSERVED and 5 are INSUFFICIENT_OBSERVATIONS", () => {
    const observed = DEMO_ROUTES.filter((r) => r.status === "OBSERVED");
    const statewide = DEMO_ROUTES.filter((r) => r.status === "INSUFFICIENT_OBSERVATIONS");

    expect(observed).toHaveLength(7);
    expect(statewide).toHaveLength(5);
  });

  test("all 7 observed routes have non-empty segment IDs within SEG_001-SEG_160", () => {
    const observed = DEMO_ROUTES.filter((r) => r.status === "OBSERVED");
    for (const route of observed) {
      expect(route.segmentIds.length).toBeGreaterThan(0);
      for (const segId of route.segmentIds) {
        expect(segId).toMatch(/^SEG_\d{3}$/);
        const num = parseInt(segId.replace("SEG_", ""), 10);
        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(160);
      }
    }
  });

  test("all 5 unobserved statewide routes have synthetic waypoints with at least 2 points", () => {
    const statewide = DEMO_ROUTES.filter((r) => r.status === "INSUFFICIENT_OBSERVATIONS");
    for (const route of statewide) {
      expect(route.segmentIds).toHaveLength(0);
      expect(route.syntheticWaypoints).toBeDefined();
      expect(route.syntheticWaypoints!.length).toBeGreaterThanOrEqual(2);
      for (const [lat, lng] of route.syntheticWaypoints!) {
        // Kerala latitude ~ 8.2° to 12.8°, longitude ~ 74.8° to 77.5°
        expect(lat).toBeGreaterThanOrEqual(8.0);
        expect(lat).toBeLessThanOrEqual(13.0);
        expect(lng).toBeGreaterThanOrEqual(74.5);
        expect(lng).toBeLessThanOrEqual(78.0);
      }
    }
  });
});

describe("calculateRouteCondition — Scoring & Aggregation", () => {
  test("computes length-weighted condition score correctly", () => {
    const route: DemoRoute = {
      id: "TEST_ROUTE",
      name: "Test Route",
      origin: "A",
      destination: "B",
      distanceKm: 2.0,
      description: "Test corridor",
      segmentIds: ["SEG_001", "SEG_002"],
      status: "OBSERVED",
    };

    const summariesMap = new Map<string, SegmentRow>();
    // Segment 1: 1000m, score 90, confidence 0.8
    summariesMap.set("SEG_001", createMockSegment("SEG_001", 1000, 90, 0.8));
    // Segment 2: 1000m, score 70, confidence 0.9
    summariesMap.set("SEG_002", createMockSegment("SEG_002", 1000, 70, 0.9));

    const result = calculateRouteCondition(route, summariesMap);

    expect(result.hasObservations).toBe(true);
    expect(result.conditionScore).toBe(80.0); // (90*1000 + 70*1000) / 2000 = 80
    expect(result.conditionClass).toBe("GOOD");
  });

  test("computes length-weighted score with unequal segment lengths", () => {
    const route: DemoRoute = {
      id: "TEST_UNEVEN",
      name: "Test Uneven",
      origin: "A",
      destination: "B",
      distanceKm: 4.0,
      description: "Uneven lengths",
      segmentIds: ["SEG_001", "SEG_002"],
      status: "OBSERVED",
    };

    const summariesMap = new Map<string, SegmentRow>();
    // Segment 1: 3000m, score 40 (POOR)
    summariesMap.set("SEG_001", createMockSegment("SEG_001", 3000, 40, 0.9));
    // Segment 2: 1000m, score 100 (GOOD)
    summariesMap.set("SEG_002", createMockSegment("SEG_002", 1000, 100, 0.9));

    const result = calculateRouteCondition(route, summariesMap);
    // (40*3000 + 100*1000) / 4000 = (120000 + 100000) / 4000 = 220000 / 4000 = 55.0
    expect(result.conditionScore).toBe(55.0);
    expect(result.conditionClass).toBe("MODERATE");
  });

  test("normalizes confidence correctly whether 0-1 or 0-100", () => {
    const route: DemoRoute = {
      id: "TEST_CONF",
      name: "Test Confidence",
      origin: "A",
      destination: "B",
      distanceKm: 2.0,
      description: "Confidence scale test",
      segmentIds: ["SEG_001", "SEG_002"],
      status: "OBSERVED",
    };

    const summariesMap = new Map<string, SegmentRow>();
    // 0.82 scale 0-1 -> should be 82%
    summariesMap.set("SEG_001", createMockSegment("SEG_001", 1000, 85, 0.82));
    summariesMap.set("SEG_002", createMockSegment("SEG_002", 1000, 85, 0.90));

    const result = calculateRouteCondition(route, summariesMap);
    expect(result.observationConfidencePct).toBe(86); // average of 82 and 90
    expect(result.observationConfidencePct).toBeGreaterThanOrEqual(0);
    expect(result.observationConfidencePct).toBeLessThanOrEqual(100);
  });

  test("aggregates accepted hazards and excludes suppressed manoeuvres", () => {
    const route: DemoRoute = {
      id: "TEST_HAZARDS",
      name: "Test Hazards",
      origin: "A",
      destination: "B",
      distanceKm: 2.0,
      description: "Hazard aggregation",
      segmentIds: ["SEG_001", "SEG_002"],
      status: "OBSERVED",
    };

    const summariesMap = new Map<string, SegmentRow>();
    // seg 1: 3 potholes, 2 speed breakers, 1 broken patch, 4 roughness, 10 suppressed
    summariesMap.set("SEG_001", createMockSegment("SEG_001", 1000, 60, 0.85, 3, 2, 1, 4, 10, 60, 10, 15));
    // seg 2: 1 pothole, 1 speed breaker, 2 broken patch, 0 roughness, 5 suppressed
    summariesMap.set("SEG_002", createMockSegment("SEG_002", 1000, 75, 0.85, 1, 1, 2, 0, 5, 60, 10, 5));

    const result = calculateRouteCondition(route, summariesMap);
    expect(result.hazards.potholeCount).toBe(4);
    expect(result.hazards.speedBreakerCount).toBe(3);
    expect(result.hazards.brokenPatchCount).toBe(3);
    expect(result.hazards.roughnessCount).toBe(4);
    // Total = 4 + 3 + 3 + 4 = 14 (suppressed 15 are excluded!)
    expect(result.hazards.totalHazards).toBe(14);
    expect(result.hazards.affectedPasses).toBe(15); // max affected passes across segments
    expect(result.hazards.hazardDensityPerKm).toBe(7.0); // 14 / 2.0 km
  });

  test("handles unobserved statewide routes with zero fabrication", () => {
    const statewideRoute = DEMO_ROUTES.find((r) => r.id === "TVM_KOLLAM")!;
    expect(statewideRoute).toBeDefined();

    const emptyMap = new Map<string, SegmentRow>();
    const result = calculateRouteCondition(statewideRoute, emptyMap);

    expect(result.hasObservations).toBe(false);
    expect(result.conditionScore).toBeNull();
    expect(result.conditionClass).toBe("UNOBSERVED");
    expect(result.observationConfidencePct).toBeNull();
    expect(result.totalMonitoredSegments).toBe(0);
    expect(result.hazards.totalHazards).toBe(0);
    expect(result.hazards.potholeCount).toBe(0);
    expect(result.explanation).toContain("Insufficient mapped observations");
    expect(result.explanation).toContain("Awaiting KSRTC fleet pass telemetry");
  });
});
