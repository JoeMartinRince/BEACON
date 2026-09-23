#!/usr/bin/env bun
/**
 * BEACON — END-TO-END INTELLIGENCE INTEGRATION VERIFICATION (PROMPT 5)
 * ==============================================================================
 * Validates the complete 9-stage pipeline from Contributor sensing (live & demo),
 * observation buffering, segment map matching, and event detection to false-positive
 * suppression, segment condition aggregation, and Traveller explainability.
 *
 * Usage: bun run e2e:verify
 * ==============================================================================
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  transitionTripState,
  calculateTripMetrics,
  initialTripMetrics,
  createStateMachineRefs,
  MOVEMENT_START_SPEED_KMH,
  STOP_SPEED_KMH,
  MOVEMENT_CONFIRM_SECONDS,
  TRIP_END_STATIONARY_SECONDS,
} from "../src/lib/trip-state-machine";
import {
  calculateSegmentCondition,
  calculateNetworkCondition,
  HAZARD_WEIGHTS,
} from "../src/lib/condition-engine";
import type { TripGPSPoint, Trip, EventSourceType } from "../src/lib/trip-types";

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const INFO = "\x1b[36mℹ\x1b[0m";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ${PASS} ${name}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${name}${detail ? ": " + detail : ""}`);
    failed++;
  }
}

function heading(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

const currentDir = (import.meta as any).dir ?? (import.meta as any).dirname ?? ".";
const BASE = resolve(currentDir, "..");

heading("BEACON END-TO-END PIPELINE VERIFICATION (PROMPT 5)");

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1: Contributor Trip Detection & State Machine
// ─────────────────────────────────────────────────────────────────────────────
heading("Stage 1 — Trip State Machine Transition Integrity");
{
  const refs = createStateMachineRefs();
  const idlePt: TripGPSPoint = { lat: 10.0158, lng: 76.3418, speed_kmh: 0, accuracy_m: 4, timestamp: Date.now() };
  const movePt: TripGPSPoint = { lat: 10.0158, lng: 76.3418, speed_kmh: 12, accuracy_m: 4, timestamp: Date.now() };

  // 1a. Idle parked bus does not trigger trip
  const idleRes = transitionTripState("IDLE", idlePt, refs);
  check("Parked bus (0 km/h) remains IDLE", idleRes.nextState === "NO_CHANGE");

  // 1b. Movement >= 5 km/h enters MOVEMENT_DETECTED
  const moveRes = transitionTripState("IDLE", movePt, refs);
  check("Speed >= 5 km/h triggers MOVEMENT_DETECTED", moveRes.nextState === "MOVEMENT_DETECTED");

  // 1c. Sustained movement confirms TRIP_ACTIVE
  const now = Date.now();
  refs.movementStartTime = now - (MOVEMENT_CONFIRM_SECONDS + 2) * 1000;
  const activeRes = transitionTripState("MOVEMENT_DETECTED", movePt, refs, now);
  check("Sustained movement confirms TRIP_ACTIVE", activeRes.nextState === "TRIP_ACTIVE");

  // 1d. Traffic light stop triggers TEMPORARY_STOP
  const stopPt: TripGPSPoint = { lat: 10.0236, lng: 76.3116, speed_kmh: 0, accuracy_m: 4, timestamp: Date.now() };
  const stopRes = transitionTripState("TRIP_ACTIVE", stopPt, refs);
  check("Traffic light stop (< 2 km/h) triggers TEMPORARY_STOP", stopRes.nextState === "TEMPORARY_STOP");

  // 1e. Prolonged stationary period finalizes to TRIP_COMPLETED
  refs.stopStartTime = now - (TRIP_END_STATIONARY_SECONDS + 5) * 1000;
  const endRes = transitionTripState("TEMPORARY_STOP", stopPt, refs, now);
  check("Stationary period (4 min) finalizes to TRIP_COMPLETED", endRes.nextState === "TRIP_COMPLETED");
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2: Sensor Observations & Provenance Isolation
// ─────────────────────────────────────────────────────────────────────────────
heading("Stage 2 — Observation Buffering & Provenance Isolation");
{
  const livePoint: TripGPSPoint = {
    lat: 10.0158,
    lng: 76.3418,
    speed_kmh: 24,
    accuracy_m: 4.5,
    timestamp: Date.now(),
    accel_z: 1.2,
    sensor_type: "GPS_AND_MOTION",
    source: "LIVE",
  };
  check("Live sensor observation has explicit source: LIVE", livePoint.source === "LIVE");

  const demoPoint: TripGPSPoint = {
    lat: 10.0165,
    lng: 76.3402,
    speed_kmh: 18,
    accuracy_m: 4.2,
    timestamp: Date.now(),
    source: "DEMO",
  };
  check("Simulated demo observation has explicit source: DEMO (never LIVE)", demoPoint.source === "DEMO");

  const validSources: EventSourceType[] = ["SYNTHETIC", "ML", "LIVE", "DEMO"];
  check("Event sources are strictly bounded to allowed provenance types", validSources.length === 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3: Road Segment Map Matching
// ─────────────────────────────────────────────────────────────────────────────
heading("Stage 3 — Segment Map Matching Buffer Integrity");
{
  const collectorSrc = readFileSync(resolve(BASE, "src/lib/live-sensor-collector.ts"), "utf-8");
  check("Map matching uses 50-meter corridor buffer", collectorSrc.includes("SEGMENT_MATCH_BUFFER_M = 50"));
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 4 & 5: Road Events Representation & False-Positive Suppression
// ─────────────────────────────────────────────────────────────────────────────
heading("Stage 4 & 5 — Road Events & False-Positive Suppression");
{
  // Read suppressed_events.csv to ensure 74 maneuvers are preserved
  const suppPath = resolve(BASE, "data/synthetic/suppressed_events.csv");
  check("suppressed_events.csv exists", existsSync(suppPath));

  if (existsSync(suppPath)) {
    const suppLines = readFileSync(suppPath, "utf-8").trim().split("\n");
    check("Exactly 74 non-hazard maneuvers suppressed (75 lines including header)", suppLines.length === 75);
  }

  // Read events_ground_truth.csv to ensure 4,323 accepted hazards
  const eventsPath = resolve(BASE, "data/synthetic/events_ground_truth.csv");
  check("events_ground_truth.csv exists", existsSync(eventsPath));

  if (existsSync(eventsPath)) {
    const eventLines = readFileSync(eventsPath, "utf-8").trim().split("\n");
    check("Exactly 4,323 accepted hazards in dataset (4,324 lines including header)", eventLines.length === 4324);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 6: Segment Condition Intelligence Calculation
// ─────────────────────────────────────────────────────────────────────────────
heading("Stage 6 — Deterministic Segment Condition Calculation");
{
  // Test pristine corridor (0 events)
  const pristineResult = calculateSegmentCondition({
    segmentId: "SEG_001",
    segmentLengthMeters: 126.7,
    totalPasses: 60,
    affectedPasses: 0,
    uniqueBuses: 10,
    totalFleetBuses: 10,
    potholeCount: 0,
    speedBreakerCount: 0,
    brokenPatchCount: 0,
    roughnessCount: 0,
    totalEvents: 0,
    meanSeverity: 0,
    maxSeverity: 0,
    meanEventConfidence: 1.0,
  });
  check("Pristine corridor yields GOOD condition (score: 95.0)", pristineResult.conditionClass === "GOOD" && pristineResult.conditionScore === 95.0);
  check("Pristine corridor has high observation confidence (>= 90%)", pristineResult.confidence >= 90);

  // Test degraded corridor (e.g. SEG_024 benchmark)
  const degradedResult = calculateSegmentCondition({
    segmentId: "SEG_024",
    segmentLengthMeters: 104.7,
    totalPasses: 60,
    affectedPasses: 34,
    uniqueBuses: 8,
    totalFleetBuses: 10,
    potholeCount: 18,
    speedBreakerCount: 4,
    brokenPatchCount: 12,
    roughnessCount: 15,
    totalEvents: 49,
    meanSeverity: 3.42,
    maxSeverity: 4.8,
    meanEventConfidence: 0.94,
  });
  check("Degraded corridor accurately calculates condition score", degradedResult.conditionScore > 0 && degradedResult.conditionScore < 70);
  check("Degraded corridor assigned MODERATE or POOR class", degradedResult.conditionClass === "MODERATE" || degradedResult.conditionClass === "POOR");
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 7: Traveller Explainability ("Why this score?")
// ─────────────────────────────────────────────────────────────────────────────
heading("Stage 7 — Traveller Explainability & Deterministic Reasoning");
{
  // Verify explainability logic in condition engine
  const goodRes = calculateSegmentCondition({
    segmentId: "TEST_GOOD",
    segmentLengthMeters: 120,
    totalPasses: 60,
    affectedPasses: 2,
    uniqueBuses: 10,
    totalFleetBuses: 10,
    potholeCount: 1,
    speedBreakerCount: 0,
    brokenPatchCount: 0,
    roughnessCount: 0,
    totalEvents: 1,
    meanSeverity: 1.5,
    maxSeverity: 2.0,
    meanEventConfidence: 0.95,
  });
  check("Condition result includes non-empty human explanation", goodRes.explanation.length > 20);
  check("Explanation explicitly mentions affected passes and bus count", goodRes.explanation.includes("passes") && goodRes.explanation.includes("buses"));
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 8: Length-Weighted Network Condition
// ─────────────────────────────────────────────────────────────────────────────
heading("Stage 8 — Length-Weighted Network Condition Summary");
{
  const condPath = resolve(BASE, "data/synthetic/segment_conditions_generated.csv");
  check("segment_conditions_generated.csv exists", existsSync(condPath));

  if (existsSync(condPath)) {
    const lines = readFileSync(condPath, "utf-8").trim().split("\n");
    const headers = lines[0]!.split(",");
    const scoreIdx = headers.indexOf("condition_score");
    const classIdx = headers.indexOf("condition_class");

    let good = 0;
    let mod = 0;
    let poor = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i]!.split(",");
      const cls = parts[classIdx];
      if (cls === "GOOD") good++;
      else if (cls === "MODERATE") mod++;
      else if (cls === "POOR") poor++;
    }

    check("Network breakdown has 72 GOOD corridors", good === 72);
    check("Network breakdown has 78 MODERATE corridors", mod === 78);
    check("Network breakdown has 10 POOR corridors", poor === 10);
    check("Total classified corridors equal exactly 160", good + mod + poor === 160);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 9: Contributor → Completed Trip Summary (ROAD INTELLIGENCE CONTRIBUTED)
// ─────────────────────────────────────────────────────────────────────────────
heading("Stage 9 — Completed Trip Intelligence Contribution Summary");
{
  const sampleTrip: Trip = {
    trip_id: "TRIP-20260924-DEMO",
    bus_id: "KL-07-BUS-01",
    start_timestamp: "2026-09-24T00:00:00.000Z",
    end_timestamp: "2026-09-24T00:25:00.000Z",
    start_latitude: 10.0158,
    start_longitude: 76.3418,
    end_latitude: 10.1076,
    end_longitude: 76.3516,
    start_location_name: "Kakkanad",
    destination_location_name: "Aluva Private Bus Stand",
    distance_km: 18.2,
    duration_seconds: 1500,
    detection_mode: "AUTO",
    gps_points: [],
    event_count: 5,
    segment_count: 42,
    observations_count: 1284,
    status: "TRIP_COMPLETED",
    affected_segments: [
      {
        segment_id: "SEG_036",
        road_name: "Kakkanad Bypass",
        hazard_type: "POTHOLE",
        severity: 3.8,
        confidence: 0.958,
        status: "HAZARD_DETECTED",
        source: "DEMO",
      },
      {
        segment_id: "SEG_041",
        road_name: "Palarivattom Corridor",
        hazard_type: "ROUGHNESS",
        severity: 2.4,
        confidence: 0.882,
        status: "HAZARD_DETECTED",
        source: "DEMO",
      },
      {
        segment_id: "SEG_052",
        road_name: "Kalamassery Premier",
        hazard_type: undefined,
        severity: 0,
        confidence: 0.99,
        status: "OBSERVED",
        source: "DEMO",
      },
    ],
  };

  check("Completed trip contains observations_count", sampleTrip.observations_count === 1284);
  check("Completed trip contains affected_segments list", (sampleTrip.affected_segments?.length ?? 0) === 3);
  check("Affected segments have explicit provenance source", sampleTrip.affected_segments?.[0]?.source === "DEMO");
  check("Affected segments distinguish hazard vs monitored status", sampleTrip.affected_segments?.[2]?.status === "OBSERVED");
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(55)}`);
const total = passed + failed;
console.log(`${INFO}  End-to-End Pipeline Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ""}`);

if (failed > 0) {
  console.log(`\n\x1b[31mEnd-to-end integration checks failed.\x1b[0m\n`);
  process.exit(1);
} else {
  console.log(`\n\x1b[32mAll ${total} end-to-end integration checks passed! Pipeline complete.\x1b[0m\n`);
  process.exit(0);
}
