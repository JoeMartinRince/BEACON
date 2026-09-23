/**
 * BEACON ROAD CONDITION INTELLIGENCE AGGREGATION CLI
 * ==============================================================================
 * Usage:
 *   bun run scripts/aggregateConditions.ts [--dry-run]
 *   bun run conditions:aggregate
 *   bun run conditions:aggregate:dry
 * ==============================================================================
 */

import * as fs from "fs";
import * as path from "path";
import Papa from "papaparse";
import {
  calculateSegmentCondition,
  calculateNetworkCondition,
  SegmentInputMetrics,
  SegmentConditionResult,
} from "../src/lib/condition-engine";
import { createClient } from "@supabase/supabase-js";

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data", "synthetic");
const PUBLIC_DATA_DIR = path.join(ROOT_DIR, "public", "data");
const PUBLIC_SYNTHETIC_DIR = path.join(PUBLIC_DATA_DIR, "synthetic");
const ML_OUTPUT_DIR = path.join(ROOT_DIR, "ml", "output");

interface CsvSegment {
  segment_id: string;
  road_name: string;
  road_type: string;
  length_m: string;
  start_lat?: string;
  start_lon?: string;
  end_lat?: string;
  end_lon?: string;
}

interface CsvPass {
  pass_id: string;
  bus_id: string;
  route_id?: string;
  start_time?: string;
  end_time?: string;
}

interface CsvEvent {
  event_id: string;
  bus_id: string;
  pass_id: string;
  segment_id: string;
  event_type: string;
  severity: string;
  detection_probability?: string;
  timestamp_start?: string;
  timestamp_peak?: string;
}

interface CsvSuppressed {
  event_id: string;
  bus_id: string;
  pass_id: string;
  segment_id: string;
  timestamp?: string;
  candidate_type?: string;
  suppression_reason?: string;
}

function parseCsvFile<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = Papa.parse<T>(content, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  });
  return parsed.data;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log("============================================================");
  console.log("  BEACON: ROAD CONDITION INTELLIGENCE AGGREGATION");
  console.log("  Repeated Observations → Segment Conditions → Traveller Map");
  console.log("============================================================");
  if (isDryRun) {
    console.log("  MODE: DRY-RUN (Calculations only — no filesystem or DB writes)\n");
  } else {
    console.log("  MODE: ACTIVE AGGREGATION (Building condition intelligence)\n");
  }

  // 1. Load data files
  console.log("[1/5] Loading synthetic corridor telemetry and events...");
  const segments = parseCsvFile<CsvSegment>(path.join(DATA_DIR, "road_segments.csv"));
  const passes = parseCsvFile<CsvPass>(path.join(DATA_DIR, "bus_passes.csv"));
  const groundTruthEvents = parseCsvFile<CsvEvent>(path.join(DATA_DIR, "events_ground_truth.csv"));
  const suppressedEvents = parseCsvFile<CsvSuppressed>(path.join(DATA_DIR, "suppressed_events.csv"));

  console.log(`  - Road Segments:     ${segments.length.toLocaleString()}`);
  console.log(`  - Bus Passes:        ${passes.length.toLocaleString()}`);
  console.log(`  - Candidate Events:  ${groundTruthEvents.length.toLocaleString()}`);
  console.log(`  - Suppressed Events: ${suppressedEvents.length.toLocaleString()} (Filtered non-hazards)`);

  // Compute fleet size dynamically from passes
  const uniqueBusesInFleet = new Set(passes.map((p) => p.bus_id.trim()).filter(Boolean));
  const totalFleetBuses = uniqueBusesInFleet.size || 10;
  const totalPassCount = passes.length || 60;
  console.log(`  - Fleet buses:       ${totalFleetBuses} (${Array.from(uniqueBusesInFleet).join(", ")})`);

  // Build suppressed event ID set to guarantee 100% exclusion
  const suppressedEventIds = new Set(suppressedEvents.map((s) => s.event_id.trim()));

  // Filter accepted events only
  const acceptedEvents = groundTruthEvents.filter((e) => !suppressedEventIds.has(e.event_id.trim()));
  console.log(`  - Accepted Events:   ${acceptedEvents.length.toLocaleString()} (Used for condition scoring)`);

  // 2. Group events and suppressed diagnostics by segment
  console.log("\n[2/5] Aggregating repeated bus observations by corridor...");
  const eventsBySegment = new Map<string, CsvEvent[]>();
  for (const e of acceptedEvents) {
    const sid = e.segment_id.trim();
    if (!eventsBySegment.has(sid)) eventsBySegment.set(sid, []);
    eventsBySegment.get(sid)!.push(e);
  }

  const suppressedBySegment = new Map<string, CsvSuppressed[]>();
  for (const s of suppressedEvents) {
    const sid = s.segment_id.trim();
    if (!suppressedBySegment.has(sid)) suppressedBySegment.set(sid, []);
    suppressedBySegment.get(sid)!.push(s);
  }

  // 3. Process each segment
  const conditionResults: SegmentConditionResult[] = [];
  const exportRows: any[] = [];

  for (const seg of segments) {
    const sid = seg.segment_id.trim();
    const lengthMeters = parseFloat(seg.length_m) || 100.0;
    const segEvents = eventsBySegment.get(sid) || [];
    const segSupp = suppressedBySegment.get(sid) || [];

    // Distinct pass observations and bus coverage
    const affectedPassesSet = new Set(segEvents.map((e) => e.pass_id.trim()).filter(Boolean));
    const uniqueBusesSet = new Set(segEvents.map((e) => e.bus_id.trim()).filter(Boolean));

    const potholeCount = segEvents.filter((e) => e.event_type.trim() === "POTHOLE").length;
    const speedBreakerCount = segEvents.filter((e) => e.event_type.trim() === "SPEED_BREAKER").length;
    const brokenPatchCount = segEvents.filter((e) => e.event_type.trim() === "BROKEN_PATCH").length;
    const roughnessCount = segEvents.filter((e) => e.event_type.trim() === "ROUGHNESS").length;

    let meanSeverity = 0.0;
    let maxSeverity = 0;
    let meanConfidence = 1.0;
    let lastObservedAt = "2026-09-18T06:30:17";

    if (segEvents.length > 0) {
      const severities = segEvents.map((e) => parseFloat(e.severity) || 1.0);
      meanSeverity = severities.reduce((a, b) => a + b, 0) / severities.length;
      maxSeverity = Math.max(...segEvents.map((e) => parseInt(e.severity, 10) || 1));

      const confs = segEvents.map((e) => parseFloat(e.detection_probability || "0.95"));
      meanConfidence = confs.reduce((a, b) => a + b, 0) / confs.length;

      const timestamps = segEvents
        .map((e) => e.timestamp_peak || e.timestamp_start || "")
        .filter(Boolean)
        .sort();
      if (timestamps.length > 0) {
        lastObservedAt = timestamps[timestamps.length - 1];
      }
    }

    const metrics: SegmentInputMetrics = {
      segmentId: sid,
      segmentLengthMeters: lengthMeters,
      totalPasses: totalPassCount,
      affectedPasses: affectedPassesSet.size,
      uniqueBuses: segEvents.length === 0 ? totalFleetBuses : uniqueBusesSet.size,
      totalFleetBuses,
      potholeCount,
      speedBreakerCount,
      brokenPatchCount,
      roughnessCount,
      totalEvents: segEvents.length,
      meanSeverity,
      maxSeverity,
      meanEventConfidence: meanConfidence,
      lastObservedAt,
      suppressedCount: segSupp.length,
    };

    const condition = calculateSegmentCondition(metrics);
    conditionResults.push(condition);

    exportRows.push({
      segment_id: sid,
      road_name: seg.road_name,
      road_type: seg.road_type,
      length_m: lengthMeters,
      pass_count: totalPassCount,
      affected_pass_count: condition.affectedPasses,
      unique_bus_count: condition.uniqueBuses,
      event_count: condition.totalEvents,
      pothole_count: condition.potholeCount,
      speed_breaker_count: condition.speedBreakerCount,
      broken_patch_count: condition.brokenPatchCount,
      roughness_count: condition.roughnessCount,
      mean_severity: condition.meanSeverity,
      max_severity: condition.maxSeverity,
      confidence: condition.confidence / 100.0,
      condition_score: condition.conditionScore,
      condition_class: condition.conditionClass,
      suppressed_count: condition.suppressedCount,
      explanation: condition.explanation,
      last_observed_at: condition.lastObservedAt,
    });
  }

  // 4. Calculate Network Summary
  console.log("\n[3/5] Calculating network-wide condition summary...");
  const networkSummary = calculateNetworkCondition(
    conditionResults.map((r) => ({
      conditionScore: r.conditionScore,
      segmentLengthMeters: r.segmentLengthMeters,
      conditionClass: r.conditionClass,
      totalPasses: r.totalPasses,
      totalEvents: r.totalEvents,
      uniqueBuses: r.uniqueBuses,
    }))
  );

  console.log(`  - Network Score:     ${networkSummary.networkScore} / 100 (Length-weighted)`);
  console.log(`  - Monitored Corridors: ${networkSummary.totalCorridors}`);
  console.log(`  - Condition Breakdown: ${networkSummary.goodCount} GOOD | ${networkSummary.moderateCount} MODERATE | ${networkSummary.poorCount} POOR`);
  console.log(`  - Total Observations: ${networkSummary.totalPasses} passes across ${networkSummary.uniqueBuses} buses`);
  console.log(`  - Catalogued Hazards: ${networkSummary.totalHazards.toLocaleString()} accepted events`);

  // Sample corridor lineage breakdown
  const sampleSeg = conditionResults.find((r) => r.segmentId === "SEG_024") || conditionResults[0];
  console.log(`\n  Example Lineage (${sampleSeg.segmentId}):`);
  console.log(`  ${sampleSeg.explanation}`);
  console.log(`  Score: ${sampleSeg.conditionScore}/100 [${sampleSeg.conditionClass}] | Observation Confidence: ${sampleSeg.confidence}%`);

  // 5. Output / Persistence
  if (isDryRun) {
    console.log("\n[4/5] DRY-RUN COMPLETE: Calculations verified. No writes performed.");
    console.log("============================================================\n");
    return;
  }

  console.log("\n[4/5] Persisting condition intelligence artifacts...");

  // Write derived CSV (keeping original segment_summary.csv as reference)
  const derivedCsvContent = Papa.unparse(exportRows);
  const derivedCsvPath = path.join(DATA_DIR, "segment_conditions_generated.csv");
  fs.writeFileSync(derivedCsvPath, derivedCsvContent, "utf-8");
  console.log(`  - Written: ${path.relative(ROOT_DIR, derivedCsvPath)}`);

  // Also write to public/data/synthetic for client-side fallback
  if (!fs.existsSync(PUBLIC_SYNTHETIC_DIR)) {
    fs.mkdirSync(PUBLIC_SYNTHETIC_DIR, { recursive: true });
  }
  const publicDerivedCsvPath = path.join(PUBLIC_SYNTHETIC_DIR, "segment_conditions_generated.csv");
  fs.writeFileSync(publicDerivedCsvPath, derivedCsvContent, "utf-8");
  console.log(`  - Written: ${path.relative(ROOT_DIR, publicDerivedCsvPath)}`);

  // Also sync to public/data/segment_conditions_demo.json
  const jsonReportPath = path.join(PUBLIC_DATA_DIR, "segment_conditions_demo.json");
  const fullReport = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "Synthetic KSRTC-style observations",
      disclaimer: "Demo data • Synthetic KSRTC-style observations. Prototype road-condition estimate.",
      modelLineage: "beacon-event-rf-v1 -> false_positive_suppression -> segment_aggregation_v1",
      networkSummary,
    },
    segments: conditionResults,
  };
  fs.writeFileSync(jsonReportPath, JSON.stringify(fullReport, null, 2), "utf-8");
  console.log(`  - Written: ${path.relative(ROOT_DIR, jsonReportPath)}`);

  // Ensure ml/output/segment_conditions_report.json exists
  if (!fs.existsSync(ML_OUTPUT_DIR)) {
    fs.mkdirSync(ML_OUTPUT_DIR, { recursive: true });
  }
  const mlReportPath = path.join(ML_OUTPUT_DIR, "segment_conditions_report.json");
  fs.writeFileSync(mlReportPath, JSON.stringify(fullReport, null, 2), "utf-8");
  console.log(`  - Written: ${path.relative(ROOT_DIR, mlReportPath)}`);

  // 6. Supabase Upsert (if configured)
  console.log("\n[5/5] Checking Supabase synchronization...");
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY;

  if (supabaseUrl && supabaseServiceKey) {
    try {
      console.log("  - Connecting to Supabase PostgreSQL via server role...");
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const dbPayload = exportRows.map((r) => ({
        segment_id: r.segment_id,
        road_name: r.road_name,
        road_type: r.road_type,
        pass_count: r.pass_count,
        event_count: r.event_count,
        pothole_count: r.pothole_count,
        speed_breaker_count: r.speed_breaker_count,
        broken_patch_count: r.broken_patch_count,
        roughness_count: r.roughness_count,
        mean_severity: r.mean_severity,
        max_severity: r.max_severity,
        confidence: r.confidence,
        condition_score: r.condition_score,
        condition_class: r.condition_class,
        last_observed_at: r.last_observed_at,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("segment_conditions")
        .upsert(dbPayload, { onConflict: "segment_id" });

      if (error) {
        console.warn(`  - Supabase upsert note: ${error.message} (Continuing with local verified files)`);
      } else {
        console.log(`  - Successfully upserted ${dbPayload.length} rows to segment_conditions!`);
      }
    } catch (err: any) {
      console.warn(`  - Supabase connection note: ${err?.message || err} (Local offline storage is primary)`);
    }
  } else {
    console.log("  - Supabase credentials not provided in environment. Offline local file mode active.");
  }

  console.log("\n============================================================");
  console.log("  AGGREGATION FINISHED SUCCESSFULLY");
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("FATAL: Aggregation failed:", err);
  process.exit(1);
});
