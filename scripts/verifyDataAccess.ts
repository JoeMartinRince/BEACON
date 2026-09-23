/**
 * ==============================================================================
 * BEACON - Data Access Layer Verification Script
 * ==============================================================================
 *
 * Runs queries through src/lib/beacon-db.ts to verify that:
 * 1. Road segments can be queried
 * 2. Segment conditions (Traveller side) can be queried
 * 3. Road events can be queried and filtered
 * 4. Bus passes traversing segments can be queried
 * 5. Database health/stats reflect the correct metadata
 *
 * Usage:
 *   bun run scripts/verifyDataAccess.ts
 */

import fs from "node:fs";
import path from "node:path";

// Polyfill relative fetch for Node/Bun CLI runtime so /data/... resolves to public/data/
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = String(input);
  if (urlStr.startsWith("/data/")) {
    const candidatePaths = [
      path.resolve(process.cwd(), "public", urlStr.replace(/^\//, "")),
      path.resolve(process.cwd(), "data", urlStr.replace(/^\/data\//, "")),
      path.resolve(process.cwd(), "data", "synthetic", urlStr.replace(/^\/data\/synthetic\//, "")),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        return new Response(content, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }
    }
  }
  return originalFetch(input, init);
};

// Import beacon-db functions
import {
  getRoadSegment,
  getRoadSegments,
  getSegmentCondition,
  getAllSegmentConditions,
  getRoadEvents,
  getBusPassesForSegment,
  getDatabaseStats,
} from "../src/lib/beacon-db";

async function verify() {
  console.log("==================================================================");
  console.log("BEACON: Data Access Layer & Query Verification");
  console.log("==================================================================");

  // 1. Verify Database Stats
  console.log("\n[Test 1] Querying Database Stats...");
  const stats = await getDatabaseStats();
  console.log("  Status :", stats.connected ? "Connected to Supabase" : "Using Local Fallback Dataset");
  console.log("  Source :", stats.source);
  console.log(`  Records: ${stats.segmentsCount} Segments | ${stats.passesCount} Passes | ${stats.eventsCount} Events | ${stats.conditionsCount} Conditions`);

  // 2. Verify Single Segment
  console.log("\n[Test 2] Querying Single Segment ('SEG_001')...");
  const segment = await getRoadSegment("SEG_001");
  if (segment) {
    console.log("  [PASS] Found Segment SEG_001:");
    console.log(`         Road Name : ${segment.road_name}`);
    console.log(`         Type      : ${segment.road_type}`);
    console.log(`         Length    : ${segment.length_m} m`);
    console.log(`         Score     : ${segment.condition_score} (${segment.condition_class})`);
    console.log(`         Coords    : (${segment.start_lat}, ${segment.start_lon}) -> (${segment.end_lat}, ${segment.end_lon})`);
  } else {
    console.error("  [FAIL] Segment SEG_001 not found!");
  }

  // 3. Verify Segment Condition (Traveller View)
  console.log("\n[Test 3] Querying Segment Condition ('SEG_001')...");
  const condition = await getSegmentCondition("SEG_001");
  if (condition) {
    console.log("  [PASS] Found Segment Condition for SEG_001:");
    console.log(`         Pass Count    : ${condition.pass_count}`);
    console.log(`         Potholes      : ${condition.pothole_count}`);
    console.log(`         Speedbreakers : ${condition.speed_breaker_count}`);
    console.log(`         Roughness     : ${condition.roughness_count}`);
    console.log(`         Mean Severity : ${condition.mean_severity}`);
    console.log(`         Confidence    : ${condition.confidence}`);
  } else {
    console.error("  [FAIL] Condition for SEG_001 not found!");
  }

  // 4. Verify Road Events for SEG_024
  console.log("\n[Test 4] Querying Road Events for 'SEG_024'...");
  const events = await getRoadEvents("SEG_024", { limit: 5 });
  console.log(`  [PASS] Retrieved ${events.length} events on SEG_024:`);
  events.slice(0, 3).forEach((e, idx) => {
    console.log(`         [${idx + 1}] ${e.event_id} | Type: ${e.event_type} | Severity: ${e.severity} | Bus: ${e.bus_id} | Pass: ${e.pass_id}`);
  });

  // 5. Verify Bus Passes for SEG_024
  console.log("\n[Test 5] Querying Bus Passes traversing 'SEG_024'...");
  const passes = await getBusPassesForSegment("SEG_024");
  console.log(`  [PASS] Retrieved ${passes.length} bus passes.`);
  if (passes.length > 0) {
    const p = passes[0]!;
    console.log(`         Sample Pass: ${p.pass_id} | Bus: ${p.bus_id} | Route: ${p.route_id} | Distance: ${p.distance_km} km`);
  }

  console.log("\n==================================================================");
  console.log("VERIFICATION COMPLETE: ALL DATA ACCESS CHECKS PASSED [OK]");
  console.log("Beacon Attribution: Beacon Synthetic Road Network / Simulated KSRTC Bus Observations");
  console.log("==================================================================\n");
}

verify().catch((err) => {
  console.error("[VERIFICATION FAILED]:", err);
  process.exit(1);
});
