import { supabase, isSupabaseConfigured } from "./supabase";

export interface DbRoadSegment {
  id?: string;
  segment_id: string;
  road_name: string;
  road_type: string;
  length_m: number;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  geometry?: any;
  condition_score?: number;
  condition_class?: string;
  created_at?: string;
}

export interface DbBusPass {
  id?: string;
  pass_id: string;
  bus_id: string;
  route_id: string;
  start_time: string;
  end_time?: string;
  distance_km: number;
  event_count: number;
  segments_traversed: number;
  created_at?: string;
}

export interface DbRoadEvent {
  id?: string;
  event_id: string;
  pass_id: string;
  bus_id: string;
  segment_id: string;
  timestamp: string;
  timestamp_start?: string;
  timestamp_peak?: string;
  timestamp_end?: string;
  latitude: number;
  longitude: number;
  event_type: string;
  severity: number;
  confidence: number;
  ground_truth?: number;
  prediction_source?: string;
  model_version?: string;
  predicted_event_type?: string;
  prediction_confidence?: number;
  created_at?: string;
}

import {
  calculateNetworkCondition,
  type NetworkConditionSummary,
} from "./condition-engine";

export interface DbSegmentCondition {
  id?: string;
  segment_id: string;
  road_name: string;
  road_type: string;
  pass_count: number;
  event_count: number;
  pothole_count: number;
  speed_breaker_count: number;
  broken_patch_count: number;
  roughness_count: number;
  mean_severity: number;
  max_severity: number;
  confidence: number;
  condition_score: number;
  condition_class: string;
  affected_pass_count?: number;
  unique_bus_count?: number;
  mean_event_confidence?: number;
  suppressed_count?: number;
  explanation?: string;
  last_observed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbSensorRecord {
  id?: number;
  pass_id: string;
  bus_id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  speed: number;
  accel_x: number;
  accel_y: number;
  accel_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  segment_id: string;
  gps_accuracy?: number;
  motion_state?: string;
  ground_truth_event?: string;
  created_at?: string;
}

export interface DatabaseStats {
  connected: boolean;
  source: "Supabase PostgreSQL" | "Local Dataset (Synthetic)";
  segmentsCount: number;
  passesCount: number;
  eventsCount: number;
  conditionsCount: number;
  sensorCount: number;
  suppressedCount: number;
}

// ==============================================================================
// 1. DATA ACCESS LAYER: ROAD SEGMENTS
// ==============================================================================

async function fetchDatasetFile(filename: string): Promise<string | null> {
  const candidateUrls = [
    `/data/synthetic/${filename}`,
    `/data/${filename}`,
  ];
  for (const url of candidateUrls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.text();
      }
    } catch {
      // Try next
    }
  }
  return null;
}

/**
 * Fetch all road corridor segments
 */
export async function getRoadSegments(): Promise<DbRoadSegment[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from("road_segments")
      .select("*")
      .order("segment_id", { ascending: true });

    if (!error && data && data.length > 0) {
      return data;
    }
  }

  // Local fallback from public synthetic data
  try {
    const text = await fetchDatasetFile("road_segments.csv");
    if (text) {
      return parseCsvText<DbRoadSegment>(text);
    }
  } catch (err) {
    void err;
  }
  return [];
}

/**
 * Fetch a single segment by its segment_id (e.g. 'SEG_001')
 */
export async function getRoadSegment(segmentId: string): Promise<DbRoadSegment | null> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from("road_segments")
      .select("*")
      .eq("segment_id", segmentId)
      .single();

    if (!error && data) return data;
  }

  const all = await getRoadSegments();
  return all.find((s) => s.segment_id === segmentId) ?? null;
}

// ==============================================================================
// 2. DATA ACCESS LAYER: SEGMENT CONDITIONS (TRAVELLER QUERIES)
// ==============================================================================

/**
 * Fetch aggregated road condition for a specific segment
 */
export async function getSegmentCondition(segmentId: string): Promise<DbSegmentCondition | null> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from("segment_conditions")
      .select("*")
      .eq("segment_id", segmentId)
      .single();

    if (!error && data) return data;
  }

  const all = await getAllSegmentConditions();
  return all.find((c) => c.segment_id === segmentId) ?? null;
}

/**
 * Fetch all segment conditions for network-wide traveller map and rankings
 */
export async function getAllSegmentConditions(): Promise<DbSegmentCondition[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from("segment_conditions")
      .select("*")
      .order("condition_score", { ascending: true });

    if (!error && data && data.length > 0) return data;
  }

  try {
    // Prefer generated Beacon Condition Intelligence, fallback to reference summary
    const text =
      (await fetchDatasetFile("segment_conditions_generated.csv")) ||
      (await fetchDatasetFile("segment_summary.csv"));
    if (text) {
      return parseCsvText<DbSegmentCondition>(text);
    }
  } catch (err) {
    void err;
  }
  return [];
}

/**
 * Fetch network-wide aggregated road condition summary with length-weighting
 */
export async function getNetworkConditionSummary(): Promise<NetworkConditionSummary> {
  const conditions = await getAllSegmentConditions();
  const segments = await getRoadSegments();
  const segMap = new Map<string, DbRoadSegment>(segments.map((s: DbRoadSegment) => [s.segment_id, s]));

  return calculateNetworkCondition(
    conditions.map((c) => ({
      conditionScore: Number(c.condition_score) || 0,
      segmentLengthMeters: Number(segMap.get(c.segment_id)?.length_m) || 100,
      conditionClass: c.condition_class,
      totalPasses: Number(c.pass_count) || 60,
      totalEvents: Number(c.event_count) || 0,
      uniqueBuses: Number(c.unique_bus_count) || 10,
    }))
  );
}

// ==============================================================================
// 3. DATA ACCESS LAYER: ROAD EVENTS
// ==============================================================================

/**
 * Fetch detected road events (optionally filtered by segmentId, eventType, minSeverity)
 */
export async function getRoadEvents(
  segmentId?: string,
  options?: { eventType?: string; minSeverity?: number; limit?: number },
): Promise<DbRoadEvent[]> {
  if (isSupabaseConfigured) {
    let query = supabase.from("road_events").select("*");

    if (segmentId) query = query.eq("segment_id", segmentId);
    if (options?.eventType && options.eventType !== "all") {
      query = query.eq("event_type", options.eventType);
    }
    if (options?.minSeverity !== undefined && options.minSeverity > 0) {
      query = query.gte("severity", options.minSeverity);
    }

    query = query.order("timestamp", { ascending: false }).limit(options?.limit ?? 500);

    const { data, error } = await query;
    if (!error && data) return data;
  }

  try {
    const text =
      (await fetchDatasetFile("events_ground_truth.csv")) ||
      (await fetchDatasetFile("events.csv"));
    if (text) {
      let events = parseCsvText<DbRoadEvent>(text);
      if (segmentId) events = events.filter((e) => e.segment_id === segmentId);
      if (options?.eventType && options.eventType !== "all") {
        events = events.filter((e) => e.event_type === options.eventType);
      }
      if (options?.minSeverity) {
        events = events.filter((e) => Number(e.severity) >= options.minSeverity!);
      }
      return events.slice(0, options?.limit ?? 500);
    }
  } catch (err) {
    void err;
  }
  return [];
}

// ==============================================================================
// 4. DATA ACCESS LAYER: BUS PASSES
// ==============================================================================

/**
 * Fetch bus passes associated with or traversing a road segment
 */
export async function getBusPassesForSegment(segmentId: string): Promise<DbBusPass[]> {
  if (isSupabaseConfigured) {
    // Look up passes associated with events or records on this segment
    const { data, error } = await supabase
      .from("road_events")
      .select("pass_id")
      .eq("segment_id", segmentId);

    if (!error && data && data.length > 0) {
      const passIds = Array.from(new Set(data.map((d) => d.pass_id)));
      const { data: passes } = await supabase
        .from("bus_passes")
        .select("*")
        .in("pass_id", passIds);
      if (passes) return passes;
    }
  }

  try {
    const text =
      (await fetchDatasetFile("bus_passes.csv")) ||
      (await fetchDatasetFile("passes.csv"));
    if (text) {
      return parseCsvText<DbBusPass>(text);
    }
  } catch (err) {
    void err;
  }
  return [];
}

/**
 * Fetch segments assigned to a specific bus route
 */
export async function getRouteSegments(routeId: string): Promise<DbRoadSegment[]> {
  const segments = await getRoadSegments();
  return segments.filter((s) => s.road_name?.includes(routeId) || s.road_type === routeId);
}

/**
 * Fetch recent bus observations and events on a segment
 */
export async function getRecentObservations(segmentId: string): Promise<{
  condition: DbSegmentCondition | null;
  events: DbRoadEvent[];
  passCount: number;
}> {
  const [condition, events] = await Promise.all([
    getSegmentCondition(segmentId),
    getRoadEvents(segmentId, { limit: 10 }),
  ]);

  return {
    condition,
    events,
    passCount: condition?.pass_count ?? 0,
  };
}

// ==============================================================================
// 5. DATABASE HEALTH & STATUS
// ==============================================================================

export async function checkDatabaseConnection(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from("road_segments").select("segment_id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function getDatabaseStats(): Promise<DatabaseStats> {
  if (isSupabaseConfigured) {
    try {
      const [segs, passes, events, conds] = await Promise.all([
        supabase.from("road_segments").select("*", { count: "exact", head: true }),
        supabase.from("bus_passes").select("*", { count: "exact", head: true }),
        supabase.from("road_events").select("*", { count: "exact", head: true }),
        supabase.from("segment_conditions").select("*", { count: "exact", head: true }),
      ]);

      if (!segs.error) {
        return {
          connected: true,
          source: "Supabase PostgreSQL",
          segmentsCount: segs.count ?? 160,
          passesCount: passes.count ?? 60,
          eventsCount: events.count ?? 4323,
          conditionsCount: conds.count ?? 160,
          sensorCount: 1426279,
          suppressedCount: 74,
        };
      }
    } catch (err) {
      void err;
    }
  }

  // Local dataset counts fallback from dataset metadata
  return {
    connected: false,
    source: "Local Dataset (Synthetic)",
    segmentsCount: 160,
    passesCount: 60,
    eventsCount: 4323,
    conditionsCount: 160,
    sensorCount: 1426279,
    suppressedCount: 74,
  };
}

// Simple lightweight CSV parser helper for local fallback without extra bundle weight
function parseCsvText<T>(csv: string): T[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: any = {};
    headers.forEach((h, i) => {
      const val = values[i] ?? "";
      row[h] = !isNaN(Number(val)) && val !== "" ? Number(val) : val;
    });
    return row as T;
  });
}
