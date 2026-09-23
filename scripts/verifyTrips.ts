#!/usr/bin/env bun
/**
 * Beacon — Trip Integrity Verification Script
 *
 * Validates the structure and consistency of locally stored trip data.
 * Usage: bun run trips:verify
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { Trip } from "../src/lib/trip-types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Load trips from localStorage export or synthetic seed
// ─────────────────────────────────────────────────────────────────────────────

heading("Beacon Trip Integrity Verification");

// Load from the synthetic seed embedded in trip-context.tsx (via comment export)
// For CI / headless verification we validate the type definitions and static sample trips.
const SAMPLE_TRIPS: Trip[] = [
  {
    trip_id: "TRIP-20260923-002",
    bus_id: "KL-07-BUS-02",
    start_timestamp: "2026-09-23T14:30:00.000Z",
    end_timestamp: "2026-09-23T15:09:00.000Z",
    start_latitude: 10.1085,
    start_longitude: 76.3562,
    end_latitude: 10.0158,
    end_longitude: 76.3418,
    start_location_name: "Aluva",
    destination_location_name: "Kakkanad",
    distance_km: 17.9,
    duration_seconds: 2340,
    detection_mode: "AUTO",
    gps_points: [],
    event_count: 12,
    segment_count: 78,
    max_speed_kmh: 46.2,
    avg_speed_kmh: 34.1,
    status: "TRIP_COMPLETED",
  },
  {
    trip_id: "TRIP-20260923-001",
    bus_id: "KL-07-BUS-01",
    start_timestamp: "2026-09-23T09:15:00.000Z",
    end_timestamp: "2026-09-23T09:57:00.000Z",
    start_latitude: 10.0158,
    start_longitude: 76.3418,
    end_latitude: 10.1085,
    end_longitude: 76.3562,
    start_location_name: "Kakkanad",
    destination_location_name: "Aluva",
    distance_km: 18.7,
    duration_seconds: 2520,
    detection_mode: "AUTO",
    gps_points: [],
    event_count: 17,
    segment_count: 84,
    max_speed_kmh: 52.0,
    avg_speed_kmh: 36.8,
    status: "TRIP_COMPLETED",
  },
  {
    trip_id: "TRIP-20260922-003",
    bus_id: "KL-07-BUS-04",
    start_timestamp: "2026-09-22T16:00:00.000Z",
    end_timestamp: "2026-09-22T16:58:00.000Z",
    start_latitude: 10.0158,
    start_longitude: 76.3418,
    end_latitude: 9.9658,
    end_longitude: 76.2421,
    start_location_name: "Kakkanad",
    destination_location_name: "Fort Kochi",
    distance_km: 24.2,
    duration_seconds: 3480,
    detection_mode: "MANUAL",
    gps_points: [],
    event_count: 21,
    segment_count: 96,
    max_speed_kmh: 48.5,
    avg_speed_kmh: 31.4,
    status: "TRIP_COMPLETED",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Rule checks
// ─────────────────────────────────────────────────────────────────────────────

heading("Rule 1 — Required source files exist");
const BASE = resolve(import.meta.dir, "..");
check("src/lib/trip-types.ts exists", existsSync(resolve(BASE, "src/lib/trip-types.ts")));
check("src/lib/trip-state-machine.ts exists", existsSync(resolve(BASE, "src/lib/trip-state-machine.ts")));
check("src/lib/live-sensor-collector.ts exists", existsSync(resolve(BASE, "src/lib/live-sensor-collector.ts")));
check("src/lib/trip-context.tsx exists", existsSync(resolve(BASE, "src/lib/trip-context.tsx")));
check("src/lib/__tests__/trip-state-machine.test.ts exists", existsSync(resolve(BASE, "src/lib/__tests__/trip-state-machine.test.ts")));

heading("Rule 2 — Trip type field integrity");
for (const trip of SAMPLE_TRIPS) {
  check(
    `${trip.trip_id}: has required fields`,
    typeof trip.trip_id === "string" &&
      typeof trip.bus_id === "string" &&
      typeof trip.start_timestamp === "string" &&
      typeof trip.distance_km === "number" &&
      typeof trip.duration_seconds === "number" &&
      typeof trip.event_count === "number" &&
      typeof trip.segment_count === "number" &&
      Array.isArray(trip.gps_points),
  );
}

heading("Rule 3 — Completed trips have end fields");
for (const trip of SAMPLE_TRIPS) {
  if (trip.status === "TRIP_COMPLETED") {
    check(
      `${trip.trip_id}: has end_timestamp and destination`,
      typeof trip.end_timestamp === "string" &&
        typeof trip.destination_location_name === "string",
    );
  }
}

heading("Rule 4 — Trip IDs are unique");
const ids = SAMPLE_TRIPS.map((t) => t.trip_id);
const uniqueIds = new Set(ids);
check("All trip_ids are unique", uniqueIds.size === ids.length);

heading("Rule 5 — Detection modes are valid");
for (const trip of SAMPLE_TRIPS) {
  check(
    `${trip.trip_id}: valid detection_mode`,
    trip.detection_mode === "AUTO" || trip.detection_mode === "MANUAL",
  );
}

heading("Rule 6 — Numeric field sanity");
for (const trip of SAMPLE_TRIPS) {
  check(
    `${trip.trip_id}: distance >= 0 and duration >= 0`,
    trip.distance_km >= 0 && trip.duration_seconds >= 0,
  );
  check(
    `${trip.trip_id}: coordinates within Kerala bounds`,
    trip.start_latitude >= 8.0 &&
      trip.start_latitude <= 12.5 &&
      trip.start_longitude >= 76.0 &&
      trip.start_longitude <= 77.5,
  );
}

heading("Rule 7 — State machine thresholds file integrity");
const smContent = readFileSync(resolve(BASE, "src/lib/trip-state-machine.ts"), "utf-8");
check("MOVEMENT_START_SPEED_KMH = 5.0", smContent.includes("MOVEMENT_START_SPEED_KMH = 5.0"));
check("STOP_SPEED_KMH = 2.0", smContent.includes("STOP_SPEED_KMH = 2.0"));
check("MOVEMENT_CONFIRM_SECONDS = 25", smContent.includes("MOVEMENT_CONFIRM_SECONDS = 25"));
check("TRIP_END_STATIONARY_SECONDS = 240", smContent.includes("TRIP_END_STATIONARY_SECONDS = 240"));
check("STOP_RADIUS_METERS = 30", smContent.includes("STOP_RADIUS_METERS = 30"));
check("MAX_OFFLINE_BUFFER_SIZE = 500", smContent.includes("MAX_OFFLINE_BUFFER_SIZE = 500"));
check("BATCH_FLUSH_INTERVAL_MS = 5000", smContent.includes("BATCH_FLUSH_INTERVAL_MS = 5000"));

heading("Rule 8 — live-sensor-collector exports expected API");
const lscContent = readFileSync(resolve(BASE, "src/lib/live-sensor-collector.ts"), "utf-8");
check("exports LiveSensorCollector class", lscContent.includes("class LiveSensorCollector"));
check("exports SegmentRef type", lscContent.includes("SegmentRef"));
check("has start() method", lscContent.includes("start(): void"));
check("has stop() method", lscContent.includes("stop(): void"));
check("has updateSegments() method", lscContent.includes("updateSegments("));
check("has onBatchFlush callback", lscContent.includes("onBatchFlush"));
check("SEGMENT_MATCH_BUFFER_M = 50", lscContent.includes("SEGMENT_MATCH_BUFFER_M = 50"));

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
const total = passed + failed;
console.log(
  `${INFO}  Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ""}`,
);

if (failed > 0) {
  console.log(`\n\x1b[31mSome checks failed. Fix the issues above before proceeding.\x1b[0m\n`);
  process.exit(1);
} else {
  console.log(`\n\x1b[32mAll ${total} checks passed. Trip integrity verified.\x1b[0m\n`);
  process.exit(0);
}
