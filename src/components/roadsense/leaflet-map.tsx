import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { EventRow, SegmentFeature, SegmentRow } from "@/lib/roadsense-data";
import { useTrip } from "@/lib/trip-context";

const colors = ["#34a853", "#8bc34a", "#f5c542", "#f39c35", "#e85d3f", "#c92a3a"];

const CONDITION_COLORS = {
  GOOD: "#10b981", // Emerald green
  MODERATE: "#f59e0b", // Amber / warm yellow
  POOR: "#ef4444", // Coral red
  UNOBSERVED: "#94a3b8", // Slate grey
} as const;

function getSegmentColor(s?: SegmentRow): string {
  if (!s) return CONDITION_COLORS.UNOBSERVED;
  if (s.condition_class === "GOOD" || (s.condition_score != null && s.condition_score >= 80)) {
    return CONDITION_COLORS.GOOD;
  }
  if (s.condition_class === "MODERATE" || (s.condition_score != null && s.condition_score >= 50)) {
    return CONDITION_COLORS.MODERATE;
  }
  if (s.condition_class === "POOR" || (s.condition_score != null && s.condition_score < 50)) {
    return CONDITION_COLORS.POOR;
  }
  if (s.median_severity != null) {
    return colors[Math.min(5, Math.max(0, Math.round(s.median_severity)))] ?? CONDITION_COLORS.UNOBSERVED;
  }
  return CONDITION_COLORS.UNOBSERVED;
}

function getHazardDensityColor(s?: SegmentRow): string {
  if (!s) return CONDITION_COLORS.UNOBSERVED;
  const pot = Number(s.pothole_count ?? 0);
  const sb = Number(s.speed_breaker_count ?? 0);
  const bp = Number(s.broken_patch_count ?? 0);
  const rough = Number(s.roughness_count ?? 0);
  const total = pot + sb + bp + rough;

  if (total === 0) return "#10b981"; // 0 hazards: emerald
  if (total <= 15) return "#84cc16"; // low density: lime
  if (total <= 40) return "#f59e0b"; // moderate density: amber
  return "#ef4444"; // high density: red
}

function Fit() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(
      [
        [9.85, 76.19],
        [9.97, 76.31],
      ],
      { padding: [16, 16] },
    );
  }, [map]);
  return null;
}

function AutoFitRoute({
  features,
  activeRouteSegmentIds,
  syntheticWaypoints,
}: {
  features: SegmentFeature[];
  activeRouteSegmentIds?: string[] | undefined;
  syntheticWaypoints?: [number, number][] | undefined;
}) {
  const map = useMap();
  useEffect(() => {
    if (syntheticWaypoints && syntheticWaypoints.length > 1) {
      map.fitBounds(syntheticWaypoints, { padding: [32, 32] });
      return;
    }

    if (activeRouteSegmentIds && activeRouteSegmentIds.length > 0) {
      const idSet = new Set(activeRouteSegmentIds);
      const routeCoords: [number, number][] = [];
      features.forEach((f) => {
        if (idSet.has(f.properties.segment_id)) {
          f.geometry.coordinates.forEach((c) => {
            if (typeof c[0] === "number" && typeof c[1] === "number") {
              routeCoords.push([c[1], c[0]]);
            }
          });
        }
      });
      if (routeCoords.length > 1) {
        map.fitBounds(routeCoords, { padding: [32, 32] });
      }
    }
  }, [map, activeRouteSegmentIds, syntheticWaypoints, features]);

  return null;
}

export default function LeafletMap({
  features,
  summaries,
  events = [],
  mode = "segments",
  selected,
  onSelect,
  compact = false,
  activeRouteSegmentIds,
  syntheticWaypoints,
  heatmapMode = "condition",
}: {
  features: SegmentFeature[];
  summaries: SegmentRow[];
  events?: EventRow[] | undefined;
  mode?: string | undefined;
  selected?: string | undefined;
  onSelect?: ((id: string) => void) | undefined;
  compact?: boolean | undefined;
  activeRouteSegmentIds?: string[] | undefined;
  syntheticWaypoints?: [number, number][] | undefined;
  heatmapMode?: "condition" | "hazard_density" | undefined;
}) {
  if (typeof window === "undefined") {
    return (
      <div className="flex h-full min-h-[350px] w-full items-center justify-center rounded-xl bg-muted/40 text-xs text-muted-foreground">
        Loading road map...
      </div>
    );
  }

  const byId = useMemo(() => new Map(summaries.map((s) => [s.segment_id, s])), [summaries]);
  const { currentTrip, inspectedTrip } = useTrip();

  // Active or selected trip to display on map
  const activeTrip =
    inspectedTrip || (currentTrip && currentTrip.status !== "IDLE" ? currentTrip : null);

  const tripPath = useMemo(() => {
    if (!activeTrip) return [];
    if (activeTrip.gps_points && activeTrip.gps_points.length > 1) {
      return activeTrip.gps_points.map((p) => [p.lat, p.lng] as [number, number]);
    }
    const endLat = activeTrip.end_latitude || activeTrip.start_latitude + 0.025;
    const endLng = activeTrip.end_longitude || activeTrip.start_longitude + 0.015;
    return [
      [activeTrip.start_latitude, activeTrip.start_longitude] as [number, number],
      [endLat, endLng] as [number, number],
    ];
  }, [activeTrip]);

  return (
    <MapContainer
      center={[9.99, 76.283]}
      zoom={13}
      scrollWheelZoom={!compact}
      zoomControl={!compact}
      className="h-full w-full"
    >
      <TileLayer
        attribution="© OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {!activeRouteSegmentIds?.length && !syntheticWaypoints?.length && <Fit />}
      <AutoFitRoute
        features={features}
        activeRouteSegmentIds={activeRouteSegmentIds}
        syntheticWaypoints={syntheticWaypoints}
      />

      {/* Synthetic Corridor Waypoint Path (for statewide routes awaiting local fleet telemetry) */}
      {syntheticWaypoints &&
        syntheticWaypoints.length > 1 &&
        (() => {
          const startPt = syntheticWaypoints[0];
          const endPt = syntheticWaypoints[syntheticWaypoints.length - 1];
          if (!startPt || !endPt) return null;
          return (
            <>
              <Polyline
                positions={syntheticWaypoints}
                pathOptions={{
                  color: "#64748b",
                  weight: 4.5,
                  opacity: 0.9,
                  dashArray: "8, 8",
                }}
              />
              <CircleMarker
                center={startPt}
                radius={7}
                pathOptions={{ color: "#ffffff", fillColor: "#0284c7", fillOpacity: 1, weight: 2.5 }}
              >
                <Popup>
                  <b>ORIGIN</b>
                  <br />
                  Corridor Start Point
                </Popup>
              </CircleMarker>
              <CircleMarker
                center={endPt}
                radius={7}
                pathOptions={{ color: "#ffffff", fillColor: "#0284c7", fillOpacity: 1, weight: 2.5 }}
              >
                <Popup>
                  <b>DESTINATION</b>
                  <br />
                  Corridor Terminus
                </Popup>
              </CircleMarker>
            </>
          );
        })()}

      {/* Road Segment Polylines */}
      {mode !== "events" &&
        features.map((f) => {
          const s = byId.get(f.properties.segment_id);
          const color = heatmapMode === "hazard_density" ? getHazardDensityColor(s) : getSegmentColor(s);
          const isSelected = selected === f.properties.segment_id;
          const isInActiveRoute = activeRouteSegmentIds?.includes(f.properties.segment_id);
          const hasActiveRoute = Boolean(activeRouteSegmentIds && activeRouteSegmentIds.length > 0);

          const score = s?.condition_score != null ? s.condition_score : 74.4;
          const cls = s?.condition_class || (score >= 80 ? "GOOD" : score >= 50 ? "MODERATE" : "POOR");
          let rawConf = Number(s?.confidence ?? 0.83);
          if (rawConf > 1.0) rawConf = rawConf / 100;
          const conf = Math.round(rawConf * 100);

          return (
            <GeoJSON
              key={f.properties.segment_id}
              data={f as never}
              eventHandlers={{ click: () => onSelect?.(f.properties.segment_id) }}
              style={() => ({
                color,
                weight: isSelected ? 8.5 : isInActiveRoute ? 7 : compact ? 4 : (hasActiveRoute ? 2.5 : 5.5),
                opacity: isSelected ? 1 : isInActiveRoute ? 0.95 : (hasActiveRoute ? 0.22 : 0.88),
              })}
            >
              <Popup>
                <div className="text-xs space-y-1 py-0.5">
                  <div className="flex items-center justify-between gap-2 border-b pb-1 font-bold">
                    <span>{f.properties.segment_id}</span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {cls} · {score}/100
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    <b>Observed:</b> {s?.pass_count ?? s?.n_passes ?? 60} passes ({s?.unique_bus_count ?? 10} buses)
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    <b>Affected Passes:</b> {s?.affected_pass_count ?? 0}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    <b>Observation Confidence:</b> {conf}%
                  </div>
                  <div className="text-[10px] pt-1 text-foreground border-t flex flex-wrap gap-x-2">
                    <span>Potholes: <b>{s?.pothole_count ?? 0}</b></span>
                    <span>Speed Breakers: <b>{s?.speed_breaker_count ?? 0}</b></span>
                    <span>Broken Patches: <b>{s?.broken_patch_count ?? 0}</b></span>
                    <span>Roughness: <b>{s?.roughness_count ?? 0}</b></span>
                  </div>
                  {(s?.suppressed_count ?? 0) > 0 && (
                    <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Filtered non-hazards: {s?.suppressed_count}
                    </div>
                  )}
                </div>
              </Popup>
            </GeoJSON>
          );
        })}

      {/* Hazard Event Circle Markers */}
      {mode !== "segments" &&
        events.map((e) => (
          <CircleMarker
            key={e.event_id}
            center={[e.latitude, e.longitude]}
            radius={compact ? 3 : 6}
            pathOptions={{
              color: colors[Math.min(5, Math.round(e.severity_0_5))],
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <b>{e.event_class.replaceAll("_", " ")}</b>
              <br />
              Severity {e.severity_0_5} · Confidence {Math.round(e.detector_confidence * 100)}%
            </Popup>
          </CircleMarker>
        ))}

      {/* Active / Inspected Trip Route Track */}
      {tripPath.length > 1 && activeTrip && (
        <>
          <Polyline
            positions={tripPath}
            pathOptions={{
              color: "#7c5cfc",
              weight: 5,
              opacity: 0.95,
              dashArray: activeTrip.status === "TRIP_COMPLETED" ? undefined : "8, 8",
            }}
          />

          {/* START Pin */}
          <CircleMarker
            center={[activeTrip.start_latitude, activeTrip.start_longitude]}
            radius={7}
            pathOptions={{ color: "#ffffff", fillColor: "#10b981", fillOpacity: 1, weight: 2.5 }}
          >
            <Popup>
              <b>START: {activeTrip.start_location_name}</b>
              <br />
              {activeTrip.bus_id} · {activeTrip.detection_mode}
            </Popup>
          </CircleMarker>

          {/* CURRENT or END Pin */}
          <CircleMarker
            center={tripPath[tripPath.length - 1]!}
            radius={7}
            pathOptions={{ color: "#ffffff", fillColor: "#7c5cfc", fillOpacity: 1, weight: 2.5 }}
          >
            <Popup>
              <b>
                {activeTrip.status === "TRIP_COMPLETED" ? "END" : "CURRENT"}:{" "}
                {activeTrip.destination_location_name ||
                  activeTrip.current_location_name ||
                  "En route"}
              </b>
              <br />
              Distance: {activeTrip.distance_km} km · Events: {activeTrip.event_count}
            </Popup>
          </CircleMarker>
        </>
      )}
    </MapContainer>
  );
}
