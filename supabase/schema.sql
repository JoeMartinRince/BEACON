-- ==============================================================================
-- BEACON - KSRTC Road-Condition Sensing Intelligence Platform
-- PostgreSQL / Supabase Database Schema
-- ==============================================================================

-- Enable UUID extension if not already available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TABLE: road_segments
-- Purpose: Stores the 160 monitored road corridor segments in the network.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.road_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id TEXT UNIQUE NOT NULL,
    road_name TEXT,
    road_type TEXT,
    length_m NUMERIC(10, 2),
    start_lat DOUBLE PRECISION,
    start_lon DOUBLE PRECISION,
    end_lat DOUBLE PRECISION,
    end_lon DOUBLE PRECISION,
    geometry JSONB,
    condition_score NUMERIC(5, 2),
    condition_class TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.road_segments IS 'Beacon Synthetic Road Network segments along Kochi/Ernakulam corridors';
COMMENT ON COLUMN public.road_segments.segment_id IS 'Unique road segment identifier (e.g. SEG_001)';
COMMENT ON COLUMN public.road_segments.geometry IS 'GeoJSON LineString representation of segment geometry';

-- ==============================================================================
-- 2. TABLE: bus_passes
-- Purpose: Records individual vehicle runs through the corridor network.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.bus_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pass_id TEXT UNIQUE NOT NULL,
    bus_id TEXT NOT NULL,
    route_id TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    distance_km NUMERIC(8, 2),
    event_count INTEGER DEFAULT 0,
    segments_traversed INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.bus_passes IS 'Simulated KSRTC Bus Observations / Passes through the network';
COMMENT ON COLUMN public.bus_passes.pass_id IS 'Unique identifier for a bus pass (e.g. PASS_01_001_01)';

-- ==============================================================================
-- 3. TABLE: road_events
-- Purpose: Detected/labelled road events (potholes, speed breakers, etc.)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.road_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    pass_id TEXT REFERENCES public.bus_passes(pass_id) ON DELETE CASCADE,
    bus_id TEXT,
    segment_id TEXT REFERENCES public.road_segments(segment_id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ,
    timestamp_start TIMESTAMPTZ,
    timestamp_peak TIMESTAMPTZ,
    timestamp_end TIMESTAMPTZ,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    event_type TEXT NOT NULL,
    severity NUMERIC(5, 2),
    confidence DOUBLE PRECISION,
    ground_truth INTEGER DEFAULT 1,
    -- ML extension columns for future predicted event pipelines
    prediction_source TEXT DEFAULT 'GROUND_TRUTH',
    model_version TEXT,
    predicted_event_type TEXT,
    prediction_confidence DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.road_events IS 'Labelled synthetic road hazards linked to bus passes and segments';
COMMENT ON COLUMN public.road_events.prediction_source IS 'GROUND_TRUTH or ML_PREDICTED';

-- ==============================================================================
-- 4. TABLE: sensor_data
-- Purpose: High-cadence raw/sampled IMU + GPS telemetry records (~1.4M rows)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sensor_data (
    id BIGSERIAL PRIMARY KEY,
    pass_id TEXT REFERENCES public.bus_passes(pass_id) ON DELETE CASCADE,
    bus_id TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    accel_x DOUBLE PRECISION,
    accel_y DOUBLE PRECISION,
    accel_z DOUBLE PRECISION,
    gyro_x DOUBLE PRECISION,
    gyro_y DOUBLE PRECISION,
    gyro_z DOUBLE PRECISION,
    segment_id TEXT REFERENCES public.road_segments(segment_id) ON DELETE SET NULL,
    gps_accuracy DOUBLE PRECISION,
    motion_state TEXT,
    ground_truth_event TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.sensor_data IS 'High-frequency telemetry stream from mobile phone sensors on buses';

-- ==============================================================================
-- 5. TABLE: segment_conditions
-- Purpose: Aggregated intelligence consumed by the TRAVELLER side of Beacon.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.segment_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id TEXT UNIQUE REFERENCES public.road_segments(segment_id) ON DELETE CASCADE,
    road_name TEXT,
    road_type TEXT,
    pass_count INTEGER DEFAULT 0,
    event_count INTEGER DEFAULT 0,
    pothole_count INTEGER DEFAULT 0,
    speed_breaker_count INTEGER DEFAULT 0,
    broken_patch_count INTEGER DEFAULT 0,
    roughness_count INTEGER DEFAULT 0,
    mean_severity NUMERIC(5, 2) DEFAULT 0,
    max_severity NUMERIC(5, 2) DEFAULT 0,
    confidence DOUBLE PRECISION DEFAULT 0,
    condition_score NUMERIC(5, 2) DEFAULT 0,
    condition_class TEXT,
    last_observed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.segment_conditions IS 'Aggregated corridor health consumed by traveller queries';

-- ==============================================================================
-- 6. TABLE: suppressed_events
-- Purpose: Records driver maneuvers (harsh braking/turn) rejected by suppression
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.suppressed_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    pass_id TEXT REFERENCES public.bus_passes(pass_id) ON DELETE CASCADE,
    bus_id TEXT,
    segment_id TEXT REFERENCES public.road_segments(segment_id) ON DELETE SET NULL,
    timestamp TIMESTAMPTZ,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    candidate_type TEXT,
    suppression_reason TEXT,
    confidence DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.suppressed_events IS 'Driver maneuvers suppressed to prevent false positive road hazard detections';

-- ==============================================================================
-- INDEXES FOR TIME-SERIES AND GEOSPATIAL PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_road_segments_segment_id ON public.road_segments (segment_id);
CREATE INDEX IF NOT EXISTS idx_bus_passes_pass_id ON public.bus_passes (pass_id);
CREATE INDEX IF NOT EXISTS idx_bus_passes_bus_id ON public.bus_passes (bus_id);

CREATE INDEX IF NOT EXISTS idx_road_events_event_id ON public.road_events (event_id);
CREATE INDEX IF NOT EXISTS idx_road_events_segment_id ON public.road_events (segment_id);
CREATE INDEX IF NOT EXISTS idx_road_events_pass_id ON public.road_events (pass_id);
CREATE INDEX IF NOT EXISTS idx_road_events_timestamp ON public.road_events (timestamp);
CREATE INDEX IF NOT EXISTS idx_road_events_event_type ON public.road_events (event_type);

CREATE INDEX IF NOT EXISTS idx_sensor_data_pass_id ON public.sensor_data (pass_id);
CREATE INDEX IF NOT EXISTS idx_sensor_data_segment_id ON public.sensor_data (segment_id);
CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON public.sensor_data (timestamp);

CREATE INDEX IF NOT EXISTS idx_segment_conditions_segment_id ON public.segment_conditions (segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_conditions_class ON public.segment_conditions (condition_class);
CREATE INDEX IF NOT EXISTS idx_suppressed_events_segment_id ON public.suppressed_events (segment_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.road_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensor_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressed_events ENABLE ROW LEVEL SECURITY;

-- 1. Public Read Access for Traveller queries
CREATE POLICY "Allow public read access on road_segments"
    ON public.road_segments FOR SELECT USING (true);

CREATE POLICY "Allow public read access on segment_conditions"
    ON public.segment_conditions FOR SELECT USING (true);

CREATE POLICY "Allow public read access on road_events"
    ON public.road_events FOR SELECT USING (true);

CREATE POLICY "Allow public read access on bus_passes"
    ON public.bus_passes FOR SELECT USING (true);

-- 2. Restrict sensor_data & suppressed_events to authenticated / service role
CREATE POLICY "Allow service role on sensor_data"
    ON public.sensor_data FOR ALL TO service_role USING (true);

CREATE POLICY "Allow public read on sensor_data"
    ON public.sensor_data FOR SELECT USING (true);

CREATE POLICY "Allow service role on suppressed_events"
    ON public.suppressed_events FOR ALL TO service_role USING (true);

CREATE POLICY "Allow public read on suppressed_events"
    ON public.suppressed_events FOR SELECT USING (true);

-- 3. Service role full management on all tables
CREATE POLICY "Service role full access on road_segments"
    ON public.road_segments FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on bus_passes"
    ON public.bus_passes FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on road_events"
    ON public.road_events FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on segment_conditions"
    ON public.segment_conditions FOR ALL TO service_role USING (true);
