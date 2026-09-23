-- Migration: 20260923000000_beacon_schema.sql
-- Description: Core Beacon tables for KSRTC Road-Condition Intelligence Platform

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
    prediction_source TEXT DEFAULT 'GROUND_TRUTH',
    model_version TEXT,
    predicted_event_type TEXT,
    prediction_confidence DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now()
);

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

ALTER TABLE public.road_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensor_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on road_segments" ON public.road_segments FOR SELECT USING (true);
CREATE POLICY "Allow public read access on segment_conditions" ON public.segment_conditions FOR SELECT USING (true);
CREATE POLICY "Allow public read access on road_events" ON public.road_events FOR SELECT USING (true);
CREATE POLICY "Allow public read access on bus_passes" ON public.bus_passes FOR SELECT USING (true);
CREATE POLICY "Allow public read on sensor_data" ON public.sensor_data FOR SELECT USING (true);
CREATE POLICY "Allow public read on suppressed_events" ON public.suppressed_events FOR SELECT USING (true);

CREATE POLICY "Service role full access on road_segments" ON public.road_segments FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access on bus_passes" ON public.bus_passes FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access on road_events" ON public.road_events FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access on segment_conditions" ON public.segment_conditions FOR ALL TO service_role USING (true);
CREATE POLICY "Service role on sensor_data" ON public.sensor_data FOR ALL TO service_role USING (true);
CREATE POLICY "Service role on suppressed_events" ON public.suppressed_events FOR ALL TO service_role USING (true);
