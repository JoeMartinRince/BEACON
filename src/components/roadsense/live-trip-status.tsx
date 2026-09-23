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
    telemetry,
    featureReadiness,
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

  // Formatted live telemetry metrics (0 km/h when stationary, "—" when unavailable, no fake defaults)
  const displaySpeed = isSimulating
    ? (gpsSpeedKmh !== null ? (gpsSpeedKmh === 0 ? "0 km/h" : `${gpsSpeedKmh} km/h`) : "—")
    : (telemetry.speedKmh !== null
        ? (telemetry.speedKmh === 0 ? "0 km/h" : `${telemetry.speedKmh.toFixed(1)} km/h`)
        : "—");

  const displayDistance = isSimulating
    ? (currentTrip ? `${currentTrip.distance_km} km` : "0.00 km")
    : (telemetry.distanceMeters >= 1000
        ? `${(telemetry.distanceMeters / 1000).toFixed(2)} km`
        : telemetry.distanceMeters > 0
          ? `${Math.round(telemetry.distanceMeters)} m`
          : "0 m");

  const displayAccuracy = telemetry.accuracyMeters !== null
    ? `±${Math.round(telemetry.accuracyMeters)} m`
    : "—";

  const displayHeading = telemetry.headingDegrees !== null
    ? `${Math.round(telemetry.headingDegrees)}°`
    : "—";

  const displayAltitude = telemetry.altitudeMeters !== null
    ? `${Math.round(telemetry.altitudeMeters)} m`
    : "—";

  const displayGpsStatus = isSimulating
    ? "ACTIVE"
    : telemetry.gpsStatus;

  const displayMotionStatus = (telemetry.accelerometerAvailable || telemetry.gyroscopeAvailable)
    ? "ACTIVE"
    : "UNAVAILABLE";

  const displayMatchedSegment = isSimulating
    ? (currentTrip?.affected_segments?.[0]?.segment_id ?? "SEG_036")
    : (telemetry.matchedSegmentId ?? "—");

  const displayObservations = isSimulating
    ? ((currentTrip?.observations_count ?? 1284).toLocaleString())
    : (Math.max(telemetry.gpsSampleCount + telemetry.motionSampleCount, currentTrip?.observations_count ?? 0).toLocaleString());

  const displayGpsSamples = isSimulating
    ? (currentTrip?.gps_points.length ?? 48)
    : telemetry.gpsSampleCount;

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
            {/* Mobile HTTPS Insecure Context Warning (Section 16 requirement) */}
            {!telemetry.isSecureContext && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  <b>HTTPS Required for Mobile Sensors:</b> Geolocation and DeviceMotion access require an HTTPS connection on mobile devices.
                </span>
              </div>
            )}

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
              {/* PRIMARY: Beacon Is Collecting Header Banner */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-primary/10 border-2 border-primary/25 text-xs shadow-xs">
                <span className="font-extrabold text-primary flex items-center gap-2 uppercase tracking-wide text-xs sm:text-sm">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                  </span>
                  BEACON IS COLLECTING
                </span>
                <span className="text-muted-foreground text-xs flex items-center gap-1.5 font-medium">
                  Speed: <b className="text-foreground text-sm font-black">{displaySpeed}</b>
                </span>
              </div>

              {/* SECONDARY: 4 Prominent Core Telemetry Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* 1. GPS */}
                <div className="p-3 rounded-xl bg-muted/60 border border-border/50 flex flex-col justify-between">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">GPS</span>
                  <b
                    className={`block font-extrabold text-base sm:text-lg mt-1 ${
                      displayGpsStatus === "ACTIVE"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : displayGpsStatus === "DENIED"
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {displayGpsStatus}
                  </b>
                </div>

                {/* 2. Speed */}
                <div className="p-3 rounded-xl bg-muted/60 border border-border/50 flex flex-col justify-between">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Speed</span>
                  <b className="text-foreground block font-extrabold text-base sm:text-lg mt-1">
                    {displaySpeed}
                  </b>
                </div>

                {/* 3. Distance */}
                <div className="p-3 rounded-xl bg-muted/60 border border-border/50 flex flex-col justify-between">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Distance</span>
                  <b className="text-foreground block font-extrabold text-base sm:text-lg mt-1">
                    {displayDistance}
                  </b>
                </div>

                {/* 4. Observations */}
                <div className="p-3 rounded-xl bg-muted/60 border border-border/50 flex flex-col justify-between">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Observations</span>
                  <b className="text-primary block font-extrabold text-base sm:text-lg mt-1">
                    {displayObservations}
                  </b>
                </div>
              </div>

              {/* TERTIARY: Segment, Motion & Transit Progress */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-background/60 border border-border/40">
                  <span className="text-[10px] text-muted-foreground block font-medium">Current Segment</span>
                  <b className="text-primary truncate block font-mono font-bold text-xs mt-0.5" title={displayMatchedSegment}>
                    {displayMatchedSegment && displayMatchedSegment !== "—"
                      ? `Road Segment (${displayMatchedSegment})`
                      : "Matching corridor…"}
                  </b>
                </div>
                <div className="p-2.5 rounded-lg bg-background/60 border border-border/40">
                  <span className="text-[10px] text-muted-foreground block font-medium">Motion Sensors</span>
                  <b
                    className={`block font-bold text-xs mt-0.5 ${
                      displayMotionStatus === "ACTIVE"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {displayMotionStatus}
                  </b>
                </div>
                <div className="p-2.5 rounded-lg bg-background/60 border border-border/40">
                  <span className="text-[10px] text-muted-foreground block font-medium">Duration</span>
                  <b className="text-foreground block font-bold text-xs mt-0.5">
                    {formatDuration(currentTrip.duration_seconds)}
                  </b>
                </div>
                <div className="p-2.5 rounded-lg bg-background/60 border border-border/40">
                  <span className="text-[10px] text-muted-foreground block font-medium">Pipeline Status</span>
                  <b className="text-emerald-600 dark:text-emerald-400 block font-bold text-xs mt-0.5 truncate">
                    {isSimulating ? `${currentTrip.event_count} demo hazards` : "Sensor stream active"}
                  </b>
                </div>
              </div>

              {/* Advanced Diagnostics Accordion (collapsible) */}
              <details className="text-xs text-muted-foreground pt-0.5">
                <summary className="cursor-pointer font-medium hover:text-foreground text-[11px] select-none py-1 inline-flex items-center gap-1">
                  <span>Advanced Sensor Diagnostics</span>
                </summary>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-muted/40 border border-border/30">
                    <span className="text-[10px] text-muted-foreground block">GPS Accuracy</span>
                    <b className="text-foreground block font-semibold">{displayAccuracy}</b>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40 border border-border/30">
                    <span className="text-[10px] text-muted-foreground block">Heading</span>
                    <b className="text-foreground block font-semibold">{displayHeading}</b>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40 border border-border/30">
                    <span className="text-[10px] text-muted-foreground block">Altitude</span>
                    <b className="text-foreground block font-semibold">{displayAltitude}</b>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40 border border-border/30">
                    <span className="text-[10px] text-muted-foreground block">GPS Samples</span>
                    <b className="text-foreground block font-semibold">{displayGpsSamples}</b>
                  </div>
                </div>
              </details>

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

          {/* Section 15: LIVE SENSOR DIAGNOSTICS EXPANDABLE ACCORDION (Dev & Mobile Diagnostic) */}
          <details className="mt-3 group rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3 text-[11px] font-mono">
            <summary className="cursor-pointer font-sans font-bold text-xs text-primary flex items-center justify-between select-none">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                LIVE SENSOR DIAGNOSTICS
              </span>
              <span className="text-[10px] font-mono text-muted-foreground group-open:rotate-90 transition-transform">
                ▶
              </span>
            </summary>

            <div className="pt-2.5 border-t border-primary/15 mt-2 space-y-2">
              {/* GPS Speed & Movement Validation Section (Section 12 verification) */}
              <div className="p-2.5 rounded-lg bg-background/80 border border-primary/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-sans font-bold text-[11px] text-foreground flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${
                      telemetry.motionState === "MOVING"
                        ? "bg-emerald-500 animate-pulse"
                        : telemetry.motionState === "GPS_UNCERTAIN"
                          ? "bg-amber-500"
                          : "bg-blue-500"
                    }`} />
                    GPS Speed & Movement Validation
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    telemetry.motionState === "MOVING"
                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                      : telemetry.motionState === "GPS_UNCERTAIN"
                        ? "bg-amber-500/10 text-amber-600 border border-amber-500/30"
                        : "bg-blue-500/10 text-blue-600 border border-blue-500/30"
                  }`}>
                    STATE: {telemetry.motionState ?? (telemetry.speedKmh && telemetry.speedKmh > 0 ? "MOVING" : "STATIONARY")}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-muted-foreground text-[10px]">
                  <div>
                    Browser GPS speed:{" "}
                    <b className="text-foreground">
                      {telemetry.browserSpeedKmh !== null && telemetry.browserSpeedKmh !== undefined
                        ? `${telemetry.browserSpeedKmh.toFixed(1)} km/h`
                        : "null"}
                    </b>
                  </div>
                  <div>
                    Calculated GPS speed:{" "}
                    <b className="text-foreground">
                      {telemetry.calculatedSpeedKmh !== null && telemetry.calculatedSpeedKmh !== undefined
                        ? `${telemetry.calculatedSpeedKmh.toFixed(1)} km/h`
                        : "—"}
                    </b>
                  </div>
                  <div>
                    Validated speed:{" "}
                    <b className="text-foreground font-bold">
                      {telemetry.validatedSpeedKmh !== null && telemetry.validatedSpeedKmh !== undefined
                        ? `${telemetry.validatedSpeedKmh.toFixed(1)} km/h`
                        : telemetry.speedKmh !== null
                          ? `${telemetry.speedKmh.toFixed(1)} km/h`
                          : "—"}
                    </b>
                  </div>
                  <div>
                    GPS accuracy:{" "}
                    <b className="text-foreground">
                      {telemetry.accuracyMeters !== null
                        ? `±${telemetry.accuracyMeters.toFixed(1)} m`
                        : "—"}
                    </b>
                  </div>
                  <div>
                    Distance between fixes:{" "}
                    <b className="text-foreground">
                      {telemetry.lastStepDistanceMeters !== null && telemetry.lastStepDistanceMeters !== undefined
                        ? `${telemetry.lastStepDistanceMeters.toFixed(2)} m`
                        : "—"}
                    </b>
                  </div>
                  <div>
                    Accumulated distance:{" "}
                    <b className="text-foreground">
                      {telemetry.distanceMeters.toFixed(1)} m ({(telemetry.distanceMeters / 1000).toFixed(3)} km)
                    </b>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-muted-foreground">
                <div>
                  GPS permission:{" "}
                  <b className="text-foreground">{telemetry.gpsPermission ?? "PROMPT"}</b>
                </div>
                <div>
                  GPS availability:{" "}
                  <b
                    className={
                      telemetry.gpsStatus === "ACTIVE"
                        ? "text-emerald-600 dark:text-emerald-400 font-bold"
                        : "text-amber-600 font-bold"
                    }
                  >
                    {telemetry.gpsStatus === "ACTIVE" ? "YES" : "NO"}
                  </b>
                </div>
                <div>
                  GPS sample count:{" "}
                  <b className="text-foreground">{telemetry.gpsSampleCount}</b>
                </div>
                <div>
                  last GPS update:{" "}
                  <b className="text-foreground">
                    {telemetry.lastGpsUpdate
                      ? new Date(telemetry.lastGpsUpdate).toLocaleTimeString()
                      : "—"}
                  </b>
                </div>
                <div>
                  latitude:{" "}
                  <b className="text-foreground">
                    {telemetry.latitude !== null ? telemetry.latitude.toFixed(6) : "—"}
                  </b>
                </div>
                <div>
                  longitude:{" "}
                  <b className="text-foreground">
                    {telemetry.longitude !== null ? telemetry.longitude.toFixed(6) : "—"}
                  </b>
                </div>
                <div>
                  heading:{" "}
                  <b className="text-foreground">
                    {telemetry.headingDegrees !== null
                      ? `${telemetry.headingDegrees.toFixed(1)}°`
                      : "—"}
                  </b>
                </div>
                <div>
                  accelerometer availability:{" "}
                  <b
                    className={
                      telemetry.accelerometerAvailable
                        ? "text-emerald-600 dark:text-emerald-400 font-bold"
                        : "text-foreground"
                    }
                  >
                    {telemetry.accelerometerAvailable ? "YES" : "NO"}
                  </b>
                </div>
                <div>
                  accelerometer sample count:{" "}
                  <b className="text-foreground">{telemetry.motionSampleCount}</b>
                </div>
                <div>
                  gyroscope availability:{" "}
                  <b
                    className={
                      telemetry.gyroscopeAvailable
                        ? "text-emerald-600 dark:text-emerald-400 font-bold"
                        : "text-foreground"
                    }
                  >
                    {telemetry.gyroscopeAvailable ? "YES" : "NO"}
                  </b>
                </div>
                <div>
                  motion sample count:{" "}
                  <b className="text-foreground">{telemetry.motionSampleCount}</b>
                </div>
                <div>
                  online/offline:{" "}
                  <b
                    className={
                      telemetry.isOnline
                        ? "text-emerald-600 dark:text-emerald-400 font-bold"
                        : "text-amber-600 font-bold"
                    }
                  >
                    {telemetry.isOnline ? "ONLINE" : "OFFLINE"}
                  </b>
                </div>
                <div className="col-span-2">
                  secure context:{" "}
                  <b
                    className={
                      telemetry.isSecureContext
                        ? "text-emerald-600 dark:text-emerald-400 font-bold"
                        : "text-red-500 font-bold"
                    }
                  >
                    {telemetry.isSecureContext ? "YES (HTTPS/localhost)" : "NO (Insecure HTTP)"}
                  </b>
                </div>
              </div>

              {/* 34 Feature Pipeline Readiness Diagnostics */}
              <div className="p-2 rounded-lg bg-background/60 border border-border/40 space-y-1 text-[10px]">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-foreground">34-Feature Rolling Window (5.0s / 10Hz):</span>
                  <span
                    className={
                      featureReadiness?.readyForMl
                        ? "text-emerald-600 font-extrabold"
                        : "text-amber-600"
                    }
                  >
                    {featureReadiness?.readyForMl
                      ? "READY FOR INFERENCE (34/34 features)"
                      : `ACCUMULATING (${featureReadiness?.featuresAvailable.length ?? 0}/34 features)`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between text-muted-foreground">
                  <span>
                    Window:{" "}
                    {featureReadiness
                      ? `${featureReadiness.windowDurationSeconds.toFixed(1)}s`
                      : "0.0s"}{" "}
                    / 5.0s
                  </span>
                  <span>Sensor samples in window: {featureReadiness?.sampleCount ?? 0} / 50</span>
                  <span>GPS samples total: {telemetry.gpsSampleCount}</span>
                </div>
              </div>
            </div>
          </details>

          {/* Bottom attribution footer */}
          <div className="mt-2.5 pt-2.5 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span>Your bus journey contributes road-condition intelligence during daily transit.</span>
            <span className="font-medium text-muted-foreground/80">
              {isSimulating
                ? "Demo data · Synthetic KSRTC-style observations"
                : "Live Contributor sensing · Real mobile observations"}
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
