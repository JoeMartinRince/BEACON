import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Navigation,
  Sparkles,
  Clock,
  Gauge,
  Activity,
  CheckCircle2,
  PauseCircle,
  Play,
  RotateCcw,
  History,
  Radio,
  Square,
  ChevronRight,
  Wifi,
  WifiOff,
  Satellite,
  Vibrate,
  AlertTriangle,
  Layers,
  ShieldCheck,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/lib/trip-context";
import { ManualTripDialog } from "./manual-trip-dialog";
import { EndTripDialog } from "./end-trip-dialog";

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Small pill showing location / motion / network status */
function SensorPill({
  icon,
  label,
  variant,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  variant: "ok" | "warn" | "error" | "muted";
  onClick?: (() => void) | undefined;
  title?: string | undefined;
}) {
  const colors = {
    ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    error: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    muted: "bg-muted text-muted-foreground border-border/40",
  };
  const baseClasses = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colors[variant]}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`${baseClasses} cursor-pointer hover:opacity-80 transition-opacity`}
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <span className={baseClasses} title={title}>
      {icon}
      {label}
    </span>
  );
}

export function LiveTripStatus() {
  const {
    state,
    currentTrip,
    isWeakGps,
    gpsSpeedKmh,
    gpsDiagnostics,
    simulateTrip,
    isSimulating,
    isPaused,
    pauseSimulation,
    resumeSimulation,
    stopSimulation,
    resetSimulation,
    endManualTrip,
    dismissCompletedTrip,
    sensorStatus,
    queuedBufferCount,
    requestMotionPermission,
  } = useTrip();

  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [endDialogOpen, setEndDialogOpen] = useState(false);

  // Derive pill variants from sensor status
  const locationVariant =
    sensorStatus.location === "CONNECTED"
      ? "ok"
      : sensorStatus.location === "CONNECTING"
        ? "muted"
        : sensorStatus.location === "PERMISSION_DENIED"
          ? "error"
          : "warn";

  const locationLabel =
    sensorStatus.location === "CONNECTED"
      ? "GPS ready"
      : sensorStatus.location === "CONNECTING"
        ? "GPS connecting…"
        : sensorStatus.location === "PERMISSION_DENIED"
          ? "GPS denied"
          : "GPS unavailable";

  const motionVariant =
    sensorStatus.motion === "AVAILABLE"
      ? "ok"
      : sensorStatus.motion === "PERMISSION_REQUIRED"
        ? "warn"
        : "muted";

  const motionLabel =
    sensorStatus.motion === "AVAILABLE"
      ? "Motion ready"
      : sensorStatus.motion === "PERMISSION_REQUIRED"
        ? "Motion: tap to allow"
        : "No motion sensor";

  return (
    <>
      <section className="mb-4 sm:mb-5 rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-[0_4px_24px_oklch(0.3_0.04_285/0.05)] dark:shadow-[0_6px_24px_oklch(0_0_0/0.25)] transition-all">
        {/* Top Header / Mode & Status Row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-xs font-bold text-primary border border-primary/20 tracking-wide uppercase">
              🚌 Contributor Sensing
            </span>

            {isSimulating ? (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-[10px] font-extrabold text-amber-700 dark:text-amber-300 border border-amber-500/30 tracking-wide uppercase flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                DEMO MODE · SYNTHETIC DATA
              </span>
            ) : currentTrip ? (
              <span className="px-2 py-0.5 rounded-full bg-accent text-[10px] font-bold text-primary tracking-wide uppercase">
                {currentTrip.detection_mode === "AUTO" ? "Auto Detected" : "Manual Start"}
              </span>
            ) : null}
          </div>

          {/* Sensing Activity indicator */}
          <div className="flex items-center gap-2">
            {state === "IDLE" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-pulse" />
                {gpsSpeedKmh !== null && gpsSpeedKmh > 0
                  ? `Waiting for movement (${gpsSpeedKmh} km/h)`
                  : "Waiting for movement"}
              </span>
            )}

            {state === "MOVEMENT_DETECTED" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-500">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                Detecting trip... {gpsSpeedKmh !== null ? `(${gpsSpeedKmh} km/h)` : ""}
              </span>
            )}

            {state === "TRIP_ACTIVE" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                {isPaused ? "Simulation Paused" : "Trip Active · Beacon Collecting"}
              </span>
            )}

            {state === "TEMPORARY_STOP" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-500">
                <PauseCircle className="w-3.5 h-3.5" />
                Temporary Stop (Signal / Bus Stop)
              </span>
            )}

            {state === "TRIP_COMPLETED" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Trip Completed
              </span>
            )}
          </div>
        </div>

        {/* Sensor Status Row — Location · Motion · Network */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2.5 pb-2 border-b border-border/40">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Location pill */}
            <SensorPill
              icon={
                <Satellite
                  className={`w-3 h-3 ${locationVariant === "ok" ? "" : locationVariant === "error" ? "text-red-500" : ""}`}
                />
              }
              label={locationLabel}
              variant={isWeakGps && sensorStatus.location === "CONNECTED" ? "warn" : locationVariant}
              title={
                sensorStatus.location === "PERMISSION_DENIED"
                  ? "Location permission denied"
                  : sensorStatus.location === "CONNECTED"
                    ? "High accuracy GPS active"
                    : "Connecting to GPS..."
              }
            />

            {/* Motion sensors pill (interactive on iOS if permission needed) */}
            <SensorPill
              icon={<Vibrate className="w-3 h-3" />}
              label={motionLabel}
              variant={motionVariant}
              onClick={
                sensorStatus.motion === "PERMISSION_REQUIRED"
                  ? () => {
                      void requestMotionPermission();
                    }
                  : undefined
              }
              title={
                sensorStatus.motion === "PERMISSION_REQUIRED"
                  ? "Tap to enable motion sensors (iOS)"
                  : sensorStatus.motion === "AVAILABLE"
                    ? "Accelerometer and gyro active"
                    : "Motion sensors unavailable"
              }
            />

            {/* Network pill */}
            <SensorPill
              icon={
                sensorStatus.isOnline ? (
                  <Wifi className="w-3 h-3" />
                ) : (
                  <WifiOff className="w-3 h-3" />
                )
              }
              label={sensorStatus.isOnline ? "Online" : "Offline"}
              variant={sensorStatus.isOnline ? "ok" : "warn"}
            />

            {/* Queued buffer badge — only show when offline with items */}
            {!sensorStatus.isOnline && queuedBufferCount > 0 && (
              <SensorPill
                icon={<AlertTriangle className="w-3 h-3" />}
                label={`${queuedBufferCount} queued`}
                variant="warn"
              />
            )}
          </div>
        </div>

        {/* Informational Guidance Banners for Sensors */}
        {!isSimulating && (
          <div className="pt-2 space-y-2">
            {/* GPS Permission Denied Banner */}
            {sensorStatus.location === "PERMISSION_DENIED" && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Location permission is required for live road observations.</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={simulateTrip}
                  className="h-8 text-xs font-bold border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 mr-1 text-amber-500" />
                  Continue in Demo Mode
                </Button>
              </div>
            )}

            {/* Motion Sensor Unavailable Banner (Prompt 5 requirement) */}
            {sensorStatus.motion === "UNSUPPORTED" && sensorStatus.location === "CONNECTED" && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border/40 text-[11px] text-muted-foreground">
                <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span>Motion sensors unavailable — GPS collection continues.</span>
              </div>
            )}

            {/* iOS Motion Permission Prompt (Prompt 6 requirement) */}
            {sensorStatus.motion === "PERMISSION_REQUIRED" && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-primary/5 border border-primary/20 text-xs text-foreground">
                <div className="flex items-center gap-2">
                  <Vibrate className="w-4 h-4 text-primary shrink-0 animate-pulse" />
                  <span>Device motion access needed to record road bump & vibration telemetry (iOS).</span>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => {
                    void requestMotionPermission();
                  }}
                  className="h-8 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  Allow Motion Sensors
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Dynamic State Body */}
        <div className="pt-3.5 space-y-3.5">
          {state === "IDLE" && (
            <>
              {/* Action Buttons: min 44px height, comfortably tappable */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setManualDialogOpen(true)}
                  className="min-h-[44px] h-11 w-full text-sm font-semibold rounded-xl border-border hover:bg-muted/70 flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <Navigation className="w-4 h-4 text-primary" />
                  <span>Start Trip Manually</span>
                </Button>

                <Button
                  type="button"
                  variant="default"
                  onClick={simulateTrip}
                  className="min-h-[44px] h-11 w-full text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Start Demo Trip (Kochi Corridor)</span>
                </Button>
              </div>

              {/* Explanatory description & trip history link */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 text-xs text-muted-foreground">
                <div className="flex items-start gap-2 leading-relaxed">
                  <Radio className="w-4 h-4 text-primary shrink-0 mt-0.5 animate-pulse" />
                  <p className="text-xs">
                    Zero-touch trip sensing is active. The trip automatically starts when the bus
                    begins moving (&gt; 5 km/h).
                  </p>
                </div>
                <Link
                  to="/trips"
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline shrink-0 self-start sm:self-auto py-1"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>View Trip History</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </>
          )}

          {state === "MOVEMENT_DETECTED" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                <div className="flex items-center gap-2 text-foreground font-medium">
                  <Radio className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                  <p>
                    Sustained vehicle movement detected. Verifying genuine vehicle movement to
                    prevent false trips from GPS drift...
                  </p>
                </div>
                <span className="font-extrabold text-foreground text-sm shrink-0 ml-2">
                  {gpsSpeedKmh !== null ? `${gpsSpeedKmh} km/h` : "-- km/h"}
                </span>
              </div>
              {isSimulating && (
                <Button
                  variant="ghost"
                  onClick={stopSimulation}
                  className="min-h-[44px] h-11 w-full text-xs font-semibold text-muted-foreground"
                >
                  Stop Simulation
                </Button>
              )}
            </div>
          )}

          {(state === "TRIP_ACTIVE" || state === "TEMPORARY_STOP") && currentTrip && (
            <div className="space-y-3.5">
              {/* Beacon Is Collecting Header Banner */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary/5 border border-primary/15 text-xs">
                <span className="font-bold text-primary flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                  <Activity className="w-3.5 h-3.5 animate-pulse" />
                  BEACON IS COLLECTING
                </span>
                <span className="text-muted-foreground text-[11px]">
                  Speed:{" "}
                  <b className="text-foreground font-extrabold">
                    {gpsSpeedKmh !== null ? `${gpsSpeedKmh} km/h` : "-- km/h"}
                  </b>
                </span>
              </div>

              {/* Trip stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-muted/60 border border-border/40">
                  <span className="text-[10px] text-muted-foreground block font-medium">Start</span>
                  <b
                    className="text-foreground truncate block font-bold text-xs mt-0.5"
                    title={currentTrip.start_location_name}
                  >
                    {currentTrip.start_location_name || "Kakkanad"}
                  </b>
                </div>

                <div className="p-2.5 rounded-xl bg-muted/60 border border-border/40">
                  <span className="text-[10px] text-muted-foreground block font-medium">
                    Current Location
                  </span>
                  <b
                    className="text-primary truncate block font-bold text-xs mt-0.5"
                    title={currentTrip.current_location_name}
                  >
                    {currentTrip.current_location_name || "En route"}
                  </b>
                </div>

                <div className="p-2.5 rounded-xl bg-muted/60 border border-border/40 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-medium">Duration</span>
                    <b className="text-foreground font-bold text-xs mt-0.5">
                      {formatDuration(currentTrip.duration_seconds)}
                    </b>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-muted/60 border border-border/40 flex items-center gap-2">
                  <Gauge className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-medium">Distance</span>
                    <b className="text-foreground font-bold text-xs mt-0.5">
                      {currentTrip.distance_km} km
                    </b>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-muted/60 border border-border/40 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-medium">Observations</span>
                    <b className="text-foreground font-bold text-xs mt-0.5">
                      {(currentTrip.observations_count ?? currentTrip.gps_points.length).toLocaleString()}
                    </b>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-primary shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-medium">Events</span>
                    <b className="text-primary font-bold text-xs mt-0.5">
                      {currentTrip.event_count} detected
                    </b>
                  </div>
                </div>
              </div>

              {/* Demo Controls Area (visible only when demo mode is running) */}
              {isSimulating && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Demo Controls</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isPaused ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={resumeSimulation}
                        className="h-8 text-xs font-semibold px-2.5 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15"
                      >
                        <Play className="w-3 h-3 mr-1" /> Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={pauseSimulation}
                        className="h-8 text-xs font-semibold px-2.5 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15"
                      >
                        <PauseCircle className="w-3 h-3 mr-1" /> Pause
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => endManualTrip()}
                      className="h-8 text-xs font-semibold px-2.5"
                    >
                      <Square className="w-3 h-3 mr-1" /> End Demo Trip
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={resetSimulation}
                      className="h-8 text-xs font-semibold px-2 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" /> Reset
                    </Button>
                  </div>
                </div>
              )}

              {/* Standard Trip Controls */}
              {!isSimulating && (
                <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
                  <Button
                    variant="destructive"
                    onClick={() => setEndDialogOpen(true)}
                    className="min-h-[44px] h-11 w-full sm:w-auto px-5 font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>End Trip</span>
                  </Button>

                  <Link
                    to="/trips"
                    className="text-xs font-semibold text-primary hover:underline sm:ml-auto flex items-center gap-1 py-2"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>View Trip Log</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {state === "TRIP_COMPLETED" && currentTrip && (
            <div className="space-y-3.5">
              {/* 13 & 14: ROAD INTELLIGENCE CONTRIBUTED PANEL */}
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                      ROAD INTELLIGENCE CONTRIBUTED
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full border border-border/50">
                    {currentTrip.trip_id}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                    <span>{currentTrip.start_location_name}</span>
                    <span className="text-primary">→</span>
                    <span>{currentTrip.destination_location_name || "Completed Stop"}</span>
                  </h4>
                </div>

                {/* 4 Primary Contribution KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-background/70 border border-border/50">
                    <small className="text-[10px] text-muted-foreground block font-medium">Distance</small>
                    <b className="text-sm font-extrabold text-foreground">{currentTrip.distance_km} km</b>
                  </div>
                  <div className="p-2 rounded-lg bg-background/70 border border-border/50">
                    <small className="text-[10px] text-muted-foreground block font-medium">Observations Recorded</small>
                    <b className="text-sm font-extrabold text-primary">
                      {(currentTrip.observations_count ?? 1284).toLocaleString()}
                    </b>
                  </div>
                  <div className="p-2 rounded-lg bg-background/70 border border-border/50">
                    <small className="text-[10px] text-muted-foreground block font-medium">Accepted Events</small>
                    <b className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                      {currentTrip.event_count} hazards
                    </b>
                  </div>
                  <div className="p-2 rounded-lg bg-background/70 border border-border/50">
                    <small className="text-[10px] text-muted-foreground block font-medium">Corridors Observed</small>
                    <b className="text-sm font-extrabold text-foreground">{currentTrip.segment_count} segments</b>
                  </div>
                </div>

                {/* Informational list of observed road segments */}
                {currentTrip.affected_segments && currentTrip.affected_segments.length > 0 && (
                  <div className="pt-1 space-y-1.5">
                    <span className="text-[11px] font-bold text-foreground block">
                      Observed Corridors Sample:
                    </span>
                    <div className="space-y-1">
                      {currentTrip.affected_segments.map((seg) => (
                        <div
                          key={seg.segment_id}
                          className="flex items-center justify-between text-xs p-2 rounded-lg bg-background/60 border border-border/40"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-foreground text-[11px]">
                              {seg.segment_id}
                            </span>
                            <span className="text-muted-foreground text-[11px]">
                              {seg.road_name || "Transit Corridor"}
                            </span>
                          </div>
                          <div>
                            {seg.hazard_type ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {seg.hazard_type} (Sev {seg.severity ?? 3.5})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                <ShieldCheck className="w-2.5 h-2.5" />
                                Monitored · 0 hazards
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-muted-foreground italic pt-1">
                  Contributed observations queued for condition aggregation • Synthetic KSRTC-style demonstration.
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <Link to="/trips" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="min-h-[44px] h-11 w-full sm:w-auto px-4 font-semibold rounded-xl flex items-center justify-center gap-2"
                  >
                    <History className="w-4 h-4 mr-1" /> View In Trip History
                  </Button>
                </Link>
                <Link to="/road-map" className="w-full sm:w-auto">
                  <Button
                    variant="default"
                    className="min-h-[44px] h-11 w-full sm:w-auto px-4 font-semibold rounded-xl flex items-center justify-center gap-2 bg-primary text-primary-foreground"
                  >
                    <span>View Road Map</span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  onClick={dismissCompletedTrip}
                  className="min-h-[44px] h-11 w-full sm:w-auto text-xs font-semibold text-muted-foreground"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          {/* Dev-Mode Diagnostics Panel (Requirement 9: dev mode only, hidden in production build) */}
          {import.meta.env.DEV && gpsDiagnostics && (
            <div className="mt-3 p-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 text-[11px] font-mono space-y-1.5">
              <div className="flex items-center justify-between font-sans text-xs font-bold text-primary">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  GPS & Speed Diagnostics (Dev Only)
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/15 text-primary">
                  {gpsDiagnostics.speedSource}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 pt-1 text-muted-foreground">
                <div>
                  GPS Available:{" "}
                  <b className="text-foreground">{gpsDiagnostics.gpsAvailable ? "YES" : "NO"}</b>
                </div>
                <div>
                  coords.speed:{" "}
                  <b className="text-foreground">
                    {gpsDiagnostics.coordsSpeedRaw !== null
                      ? `${gpsDiagnostics.coordsSpeedRaw} m/s (${gpsDiagnostics.coordsSpeedKmh} km/h)`
                      : "null"}
                  </b>
                </div>
                <div>
                  Calculated Fallback:{" "}
                  <b className="text-foreground">
                    {gpsDiagnostics.calculatedFallbackSpeedKmh !== null
                      ? `${gpsDiagnostics.calculatedFallbackSpeedKmh} km/h`
                      : "N/A"}
                  </b>
                </div>
                <div>
                  Reported Speed:{" "}
                  <b className="text-foreground">
                    {gpsDiagnostics.currentSpeedKmh !== null
                      ? `${gpsDiagnostics.currentSpeedKmh} km/h`
                      : "unavailable"}
                  </b>
                </div>
                <div>
                  GPS Accuracy:{" "}
                  <b className="text-foreground">±{gpsDiagnostics.gpsAccuracyMeters} m</b>
                </div>
                <div>
                  GPS Samples:{" "}
                  <b className="text-foreground">{gpsDiagnostics.samplesReceivedCount}</b>
                </div>
                <div className="col-span-2 sm:col-span-3 text-[10px] text-muted-foreground/80">
                  Fix Time: {new Date(gpsDiagnostics.timestamp).toLocaleTimeString()} ({gpsDiagnostics.lastCalculationStatus})
                </div>
              </div>
            </div>
          )}

          {/* Bottom attribution footer */}
          <div className="mt-2.5 pt-2.5 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span>Your bus journey contributes road-condition intelligence during daily transit.</span>
            <span className="font-medium text-muted-foreground/80">
              Demo data · Synthetic KSRTC-style observations
            </span>
          </div>
        </div>
      </section>

      {/* Manual Start and End Modals */}
      <ManualTripDialog open={manualDialogOpen} onOpenChange={setManualDialogOpen} />
      <EndTripDialog open={endDialogOpen} onOpenChange={setEndDialogOpen} />
    </>
  );
}
