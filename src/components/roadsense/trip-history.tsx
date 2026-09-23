import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Navigation,
  Clock,
  Gauge,
  Activity,
  Calendar,
  Layers,
  Map as MapIcon,
  ChevronRight,
  BusFront,
  Zap,
  Hand,
  CheckCircle2,
  Trash2,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/lib/trip-context";
import type { Trip } from "@/lib/trip-types";

function formatDateGroup(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "Yesterday";

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function TripHistory() {
  const { tripHistory, clearHistory, selectTripForInspection, inspectedTrip } = useTrip();
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(
    inspectedTrip ?? tripHistory[0] ?? null,
  );

  // Group trips by date label
  const groupedTrips = tripHistory.reduce<Record<string, Trip[]>>((acc, trip) => {
    const key = formatDateGroup(trip.start_timestamp);
    if (!acc[key]) acc[key] = [];
    acc[key].push(trip);
    return acc;
  }, {});

  const handleSelectTrip = (trip: Trip) => {
    setSelectedTrip(trip);
    selectTripForInspection(trip);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Trip List column */}
      <div className="lg:col-span-7 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">
            Recorded Bus Trips ({tripHistory.length})
          </h3>
          {tripHistory.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearHistory}
              className="h-7 text-[11px] text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>

        {tripHistory.length === 0 ? (
          <div className="panel p-8 text-center text-muted-foreground text-xs">
            No completed trips recorded yet. As buses move, automatic trips will appear here.
          </div>
        ) : (
          Object.entries(groupedTrips).map(([groupTitle, trips]) => (
            <div key={groupTitle} className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <Calendar className="w-3.5 h-3.5" />
                <span>{groupTitle}</span>
              </div>

              <div className="space-y-2">
                {trips.map((trip) => {
                  const isSelected = selectedTrip?.trip_id === trip.trip_id;
                  const isAuto = trip.detection_mode === "AUTO";

                  return (
                    <article
                      key={trip.trip_id}
                      onClick={() => handleSelectTrip(trip)}
                      className={`panel p-3.5 cursor-pointer transition-all duration-150 relative ${
                        isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                isAuto
                                  ? "bg-primary/10 text-primary"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              {isAuto ? (
                                <Zap className="w-2.5 h-2.5" />
                              ) : (
                                <Hand className="w-2.5 h-2.5" />
                              )}
                              {isAuto ? "AUTO DETECTED" : "MANUAL"}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {trip.bus_id} ·{" "}
                              {new Date(trip.start_timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>

                          <h4 className="text-sm font-extrabold text-foreground flex items-center gap-1.5 pt-0.5">
                            <span>{trip.start_location_name}</span>
                            <span className="text-primary font-normal">→</span>
                            <span>{trip.destination_location_name || "Completed Stop"}</span>
                          </h4>
                        </div>

                        <ChevronRight
                          className={`w-4 h-4 text-muted-foreground mt-2 transition-transform ${isSelected ? "text-primary translate-x-1" : ""}`}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-4 mt-3 pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <b className="text-foreground">
                            {Math.floor(trip.duration_seconds / 60)} min
                          </b>
                        </span>
                        <span className="flex items-center gap-1">
                          <Gauge className="w-3.5 h-3.5" />
                          <b className="text-foreground">{trip.distance_km} km</b>
                        </span>
                        <span className="flex items-center gap-1">
                          <Radio className="w-3.5 h-3.5 text-primary" />
                          <b className="text-primary">{trip.observations_count ?? trip.gps_points.length} obs</b>
                        </span>
                        <span className="flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <b className="text-foreground">{trip.event_count} events</b>
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" />
                          <b className="text-foreground">{trip.segment_count} segments</b>
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Trip Detail Inspector */}
      <div className="lg:col-span-5">
        <div className="sticky top-6">
          {selectedTrip ? (
            <div className="panel p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    Trip Details
                  </span>
                  <h3 className="text-base font-extrabold text-foreground">
                    {selectedTrip.trip_id}
                  </h3>
                </div>
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                    selectedTrip.detection_mode === "AUTO"
                      ? "bg-primary/10 text-primary"
                      : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  {selectedTrip.detection_mode === "AUTO" ? "AUTO DETECTED" : "MANUAL TRIP"}
                </span>
              </div>

              {/* Origin to Destination Card */}
              <div className="p-3 rounded-lg bg-muted/60 border border-border/50 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-medium">
                      Origin
                    </span>
                    <strong className="text-xs text-foreground">
                      {selectedTrip.start_location_name}
                    </strong>
                    <small className="text-[9px] text-muted-foreground block">
                      Coordinates: {selectedTrip.start_latitude.toFixed(4)},{" "}
                      {selectedTrip.start_longitude.toFixed(4)}
                    </small>
                  </div>
                </div>

                <div className="border-l-2 border-dashed border-border ml-1 pl-3 py-1 my-0.5 text-[10px] text-muted-foreground">
                  Corridor transit ({selectedTrip.distance_km} km)
                </div>

                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-medium">
                      Destination
                    </span>
                    <strong className="text-xs text-foreground">
                      {selectedTrip.destination_location_name || "Final Destination"}
                    </strong>
                    {selectedTrip.end_latitude && selectedTrip.end_longitude && (
                      <small className="text-[9px] text-muted-foreground block">
                        Coordinates: {selectedTrip.end_latitude.toFixed(4)},{" "}
                        {selectedTrip.end_longitude.toFixed(4)}
                      </small>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                  <span className="text-[10px] text-muted-foreground block">Duration</span>
                  <b className="text-sm font-bold text-foreground">
                    {Math.floor(selectedTrip.duration_seconds / 60)} min
                  </b>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                  <span className="text-[10px] text-muted-foreground block">Distance</span>
                  <b className="text-sm font-bold text-foreground">{selectedTrip.distance_km} km</b>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                  <span className="text-[10px] text-muted-foreground block">Observations</span>
                  <b className="text-sm font-bold text-foreground">
                    {((selectedTrip.observations_count ?? (selectedTrip.gps_points.length * 50)) || 940).toLocaleString()}
                  </b>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                  <span className="text-[10px] text-muted-foreground block">Hazards Detected</span>
                  <b className="text-sm font-bold text-primary">
                    {selectedTrip.event_count} events
                  </b>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 sm:col-span-2">
                  <span className="text-[10px] text-muted-foreground block">Road Segments</span>
                  <b className="text-sm font-bold text-foreground">
                    {selectedTrip.segment_count} corridors observed
                  </b>
                </div>
              </div>

              {/* Observed Corridors Breakdown */}
              {selectedTrip.affected_segments && selectedTrip.affected_segments.length > 0 && (
                <div className="space-y-1.5 p-2.5 rounded-lg bg-muted/30 border border-border/40 text-xs">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block">
                    Observed Corridors Sample:
                  </span>
                  <div className="space-y-1">
                    {selectedTrip.affected_segments.map((seg) => (
                      <div key={seg.segment_id} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-background/70 border border-border/30">
                        <span className="font-mono font-bold text-foreground">{seg.segment_id}</span>
                        {seg.hazard_type ? (
                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            {seg.hazard_type} (Sev {seg.severity ?? 3})
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            ✓ Monitored
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Associated bus info */}
              <div className="flex items-center justify-between text-[11px] p-2.5 rounded-lg bg-accent/40 text-primary font-medium">
                <span className="flex items-center gap-1.5">
                  <BusFront className="w-4 h-4" />
                  <span>
                    Fleet Vehicle: <b>{selectedTrip.bus_id}</b>
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Synchronized</span>
                </span>
              </div>

              {/* Action: View on Map */}
              <Link to="/road-map">
                <Button className="w-full text-xs h-9 font-semibold gap-1.5 bg-primary text-primary-foreground">
                  <MapIcon className="w-3.5 h-3.5" /> View Route on Map
                </Button>
              </Link>
            </div>
          ) : (
            <div className="panel p-6 text-center text-xs text-muted-foreground">
              Select a trip to inspect its corridor route, timing, and sensor events.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
