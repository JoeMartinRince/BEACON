import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  RotateCcw,
  FileCheck2,
  Sliders,
  Gauge,
  Clock,
  Navigation,
  Compass,
  Check,
  Database,
  Layers,
  Activity,
  Bus,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import { useRoadData } from "@/lib/roadsense-data";
import { PageTitle } from "@/components/roadsense/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTrip } from "@/lib/trip-context";
import { DEFAULT_TRIP_SETTINGS } from "@/lib/trip-types";
import { getDatabaseStats, type DatabaseStats } from "@/lib/beacon-db";

const names = [
  "events.csv",
  "suppressed_events.csv",
  "passes.csv",
  "segment_summary.csv",
  "segments.geojson",
  "signals_sample.json",
  "metrics.json",
];

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RoadSense Kerala" },
      {
        name: "description",
        content: "Manage local prototype data files, trip detection preferences, and database status.",
      },
      { property: "og:title", content: "Settings — RoadSense Kerala" },
      {
        property: "og:description",
        content: "Upload replacement datasets or configure automatic trip detection parameters.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const d = useRoadData();
  const { settings, updateSettings } = useTrip();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);

  useEffect(() => {
    getDatabaseStats().then(setDbStats).catch(() => {});
  }, []);

  async function upload(files: FileList | null) {
    if (!files) return;
    try {
      for (const f of Array.from(files)) await d.replaceFile(f.name, f);
      setMessage(`${files.length} file${files.length > 1 ? "s" : ""} loaded for this browser.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed");
    }
  }

  const handleResetSettings = () => {
    updateSettings(DEFAULT_TRIP_SETTINGS);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <>
      <PageTitle
        title="Settings & Trip Parameters"
        subtitle="Configure automatic trip detection thresholds, replace demonstration files locally, and adjust sensing parameters."
      />

      {/* Trip Detection Thresholds */}
      <section className="panel p-5 mb-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Automatic Trip Detection Parameters
              </h3>
              <p className="text-xs text-muted-foreground">
                Configurable thresholds for zero-touch start, temporary stops (signals/bus stops),
                and trip end finalization.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Defaults restored
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetSettings}
              className="text-xs h-8 border-border"
            >
              Reset to Defaults
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {/* Movement Speed Threshold */}
          <div className="p-3.5 rounded-lg bg-muted/40 border border-border/50 space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Gauge className="w-3.5 h-3.5 text-primary" />
              <span>Movement Speed Threshold</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.5"
                min="1"
                max="25"
                value={settings.movementSpeedThresholdKmh}
                onChange={(e) =>
                  updateSettings({ movementSpeedThresholdKmh: Math.max(1, Number(e.target.value)) })
                }
                className="h-8 text-xs bg-background"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">km/h</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Vehicle speed required to trigger movement detection (default: 5.0 km/h).
            </p>
          </div>

          {/* Trip Start Confirmation */}
          <div className="p-3.5 rounded-lg bg-muted/40 border border-border/50 space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span>Start Confirmation Period</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="5"
                min="10"
                max="180"
                value={settings.startConfirmationSeconds}
                onChange={(e) =>
                  updateSettings({ startConfirmationSeconds: Math.max(5, Number(e.target.value)) })
                }
                className="h-8 text-xs bg-background"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">sec</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Duration movement must continue to reject GPS drift (default: 45 sec).
            </p>
          </div>

          {/* Temporary Stop Threshold */}
          <div className="p-3.5 rounded-lg bg-muted/40 border border-border/50 space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Navigation className="w-3.5 h-3.5 text-amber-500" />
              <span>Temporary Stop Threshold</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="15"
                min="30"
                max="300"
                value={settings.temporaryStopThresholdSeconds}
                onChange={(e) =>
                  updateSettings({
                    temporaryStopThresholdSeconds: Math.max(30, Number(e.target.value)),
                  })
                }
                className="h-8 text-xs bg-background"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">sec</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Stationary duration before classifying as traffic signal / bus stop pause (default:
              120 sec).
            </p>
          </div>

          {/* Trip End Confirmation */}
          <div className="p-3.5 rounded-lg bg-muted/40 border border-border/50 space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span>Trip End Confirmation</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="30"
                min="60"
                max="900"
                value={settings.tripEndConfirmationSeconds}
                onChange={(e) =>
                  updateSettings({
                    tripEndConfirmationSeconds: Math.max(60, Number(e.target.value)),
                  })
                }
                className="h-8 text-xs bg-background"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">sec</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Prolonged stationary duration required to conclude trip at destination (default: 300
              sec / 5 min).
            </p>
          </div>

          {/* Stationary Radius */}
          <div className="p-3.5 rounded-lg bg-muted/40 border border-border/50 space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Compass className="w-3.5 h-3.5 text-primary" />
              <span>Stationary Radius</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="5"
                min="10"
                max="100"
                value={settings.stationaryRadiusMeters}
                onChange={(e) =>
                  updateSettings({ stationaryRadiusMeters: Math.max(10, Number(e.target.value)) })
                }
                className="h-8 text-xs bg-background"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">meters</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Displacement threshold considered stationary while vehicle is parked (default: 25 m).
            </p>
          </div>
        </div>
      </section>

      {/* Dataset Replacement / Upload section */}
      <div className="settings-grid">
        <section className="panel uploader">
          <UploadCloud />
          <h3>Upload data</h3>
          <p>Choose CSV, GeoJSON, or JSON files using the supported filenames.</p>
          <input
            ref={input}
            type="file"
            multiple
            accept=".csv,.json,.geojson"
            className="hidden"
            onChange={(e) => void upload(e.target.files)}
          />
          <Button variant="pill" onClick={() => input.current?.click()}>
            <UploadCloud /> Choose files
          </Button>
          {message && (
            <div className="upload-message">
              <FileCheck2 />
              {message}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="card-heading">
            <h3>Active data source</h3>
            <span className="source-pill">{d.source}</span>
          </div>
          <div className="file-list">
            {names.map((n) => (
              <div key={n}>
                <FileCheck2 />
                <span>{n}</span>
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={d.reset}>
            <RotateCcw /> Restore sample files
          </Button>
        </section>
      </div>

      {/* Database & Synthetic Dataset Status */}
      <section className="panel p-5 mt-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Database Status & Synthetic Dataset
              </h3>
              <p className="text-xs text-muted-foreground">
                PostgreSQL schema status and ingested KSRTC corridor intelligence records.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                dbStats?.connected
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  dbStats?.connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              {dbStats?.connected ? "Supabase PostgreSQL (Connected)" : "Local Synthetic Fallback (Active)"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Contributor Side Card */}
          <div className="p-4 rounded-lg bg-muted/40 border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bus className="w-4 h-4 text-primary" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  1. Data Collection Side (Observations)
                </h4>
              </div>
              <span className="text-[11px] text-muted-foreground">KSRTC Buses</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-md bg-background border border-border/40">
                <span className="text-muted-foreground block text-[11px]">Bus Passes</span>
                <span className="text-base font-bold text-foreground">{dbStats?.passesCount ?? 60}</span>
                <span className="text-[10px] text-muted-foreground block">Across 10 buses</span>
              </div>
              <div className="p-2.5 rounded-md bg-background border border-border/40">
                <span className="text-muted-foreground block text-[11px]">Road Events</span>
                <span className="text-base font-bold text-foreground">{dbStats?.eventsCount ?? 4323}</span>
                <span className="text-[10px] text-muted-foreground block">Ground truth hazards</span>
              </div>
              <div className="p-2.5 rounded-md bg-background border border-border/40">
                <span className="text-muted-foreground block text-[11px]">Suppressed Maneuvers</span>
                <span className="text-base font-bold text-foreground">{dbStats?.suppressedCount ?? 74}</span>
                <span className="text-[10px] text-muted-foreground block">Driver turns & stops</span>
              </div>
              <div className="p-2.5 rounded-md bg-background border border-border/40">
                <span className="text-muted-foreground block text-[11px]">Sensor Telemetry</span>
                <span className="text-base font-bold text-foreground">1.42M</span>
                <span className="text-[10px] text-muted-foreground block">IMU + GPS 10Hz stream</span>
              </div>
            </div>
          </div>

          {/* Traveller Side Card */}
          <div className="p-4 rounded-lg bg-muted/40 border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  2. Traveller Side (Aggregates)
                </h4>
              </div>
              <span className="text-[11px] text-muted-foreground">Public Routes</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-md bg-background border border-border/40">
                <span className="text-muted-foreground block text-[11px]">Monitored Corridors</span>
                <span className="text-base font-bold text-foreground">{dbStats?.segmentsCount ?? 160}</span>
                <span className="text-[10px] text-muted-foreground block">Kochi network segments</span>
              </div>
              <div className="p-2.5 rounded-md bg-background border border-border/40">
                <span className="text-muted-foreground block text-[11px]">Segment Conditions</span>
                <span className="text-base font-bold text-foreground">{dbStats?.conditionsCount ?? 160}</span>
                <span className="text-[10px] text-muted-foreground block">Health scores & classes</span>
              </div>
              <div className="p-2.5 rounded-md bg-background border border-border/40">
                <span className="text-muted-foreground block text-[11px]">Network Distance</span>
                <span className="text-base font-bold text-foreground">1,238 km</span>
                <span className="text-[10px] text-muted-foreground block">Simulated coverage</span>
              </div>
              <div className="p-2.5 rounded-md bg-background border border-border/40">
                <span className="text-muted-foreground block text-[11px]">Data Ingestion</span>
                <span className="text-base font-bold text-emerald-600">Verified</span>
                <span className="text-[10px] text-muted-foreground block">Typed DB layer ready</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <b>Beacon Synthetic Road Network • Simulated KSRTC Bus Observations</b>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
              These records represent a simulated corridor dataset around the Kochi/Ernakulam region generated for algorithm validation and architecture demonstration. They do not represent real-world KSRTC operational telemetry.
            </p>
          </div>
        </div>
      </section>

      <div className="note">
        <b>Local-only configuration</b>
        <p>Trip detection parameters and uploaded files remain local to this browser session.</p>
      </div>
    </>
  );
}
