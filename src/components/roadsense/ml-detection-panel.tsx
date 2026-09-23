import { useState, useEffect } from "react";
import {
  Sparkles,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  MapPin,
  Activity,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MlPredictionData {
  eventType: string;
  isEvent: boolean;
  confidence: number;
  classProbabilities?: Record<string, number>;
  timestamp: string;
  latitude: number;
  longitude: number;
  segmentId: string;
  matchedDistanceMeters?: number;
  isSuppressed: boolean;
  suppressionReason?: string | null;
  predictionSource: string;
  modelVersion: string;
  passId?: string;
  featuresSummary?: {
    verticalPeak?: number;
    jerkMax?: number;
    speedMean?: number;
  };
}

// Fallback embedded prediction ensures zero dependency on server runtime or missing files
const FALLBACK_PREDICTION: MlPredictionData = {
  eventType: "POTHOLE",
  isEvent: true,
  confidence: 0.9577,
  classProbabilities: {
    POTHOLE: 0.9577,
    ROUGHNESS: 0.0278,
    BROKEN_PATCH: 0.0129,
    SPEED_BREAKER: 0.0017,
    NORMAL: 0.0,
  },
  timestamp: "2026-09-18T06:30:04.100000",
  latitude: 9.937457,
  longitude: 76.268698,
  segmentId: "SEG_036",
  matchedDistanceMeters: 13.3,
  isSuppressed: false,
  suppressionReason: null,
  predictionSource: "ML",
  modelVersion: "beacon-event-rf-v1",
  passId: "PASS_01_001_01",
  featuresSummary: {
    verticalPeak: 9.433,
    jerkMax: 67.67,
    speedMean: 50.6,
  },
};

export function MlDetectionPanel() {
  const [prediction, setPrediction] = useState<MlPredictionData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  // Load generated demo prediction on mount
  useEffect(() => {
    fetch("/data/ml/demo_prediction.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.eventType) {
          setPrediction(data);
        } else {
          setPrediction(FALLBACK_PREDICTION);
        }
      })
      .catch(() => {
        setPrediction(FALLBACK_PREDICTION);
      });
  }, []);

  const handleRunDetection = () => {
    setIsRunning(true);
    // Simulate real-time 5-second windowing & feature pass
    setTimeout(() => {
      setIsRunning(false);
      setHasRun(true);
    }, 600);
  };

  const handleReset = () => {
    setHasRun(false);
  };

  const p = prediction ?? FALLBACK_PREDICTION;

  return (
    <section className="mb-4 sm:mb-5 rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-[0_4px_24px_oklch(0.3_0.04_285/0.04)] dark:shadow-[0_4px_24px_oklch(0_0_0/0.2)] transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-xs font-bold text-primary border border-primary/20 tracking-wide uppercase">
            <Cpu className="w-3.5 h-3.5" />
            ROAD EVENT DETECTION
          </span>
          <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground border border-border/40 tracking-wider">
            Random Forest • {p.modelVersion}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Status: Ready</span>
        </div>
      </div>

      {/* Main Body */}
      <div className="pt-3.5 space-y-3.5">
        {!hasRun ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-foreground">
                Road Hazard & Pothole Classifier
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automated classification of road surface anomalies from vehicle kinematics.
              </p>
            </div>
            <Button
              type="button"
              variant="default"
              onClick={handleRunDetection}
              disabled={isRunning}
              className="min-h-[44px] h-11 px-5 text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0 w-full sm:w-auto"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isRunning ? "Extracting Features & Classifying..." : "Run Demo Detection"}</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {/* Clear Demo / Synthetic provenance notice */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-[10px] font-extrabold text-amber-700 dark:text-amber-300 border border-amber-500/30 uppercase tracking-wide flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                DEMO / SYNTHETIC DATA
              </span>
              <span className="text-[11px] text-muted-foreground">
                Demo inference • Evaluated from synthetic sensor window
              </span>
            </div>

            {/* Detection result grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              {/* Event Type */}
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                <span className="text-[11px] text-muted-foreground block font-medium">Detected Event</span>
                <b className="text-primary text-base font-extrabold block mt-0.5 uppercase tracking-wide">
                  {p.eventType.replace("_", " ")}
                </b>
              </div>

              {/* Confidence */}
              <div className="p-3 rounded-xl bg-muted/60 border border-border/40">
                <span className="text-[11px] text-muted-foreground block font-medium">Confidence (predict_proba)</span>
                <b className="text-foreground text-base font-extrabold block mt-0.5">
                  {(p.confidence * 100).toFixed(1)}%
                </b>
              </div>

              {/* Matched Segment */}
              <div className="p-3 rounded-xl bg-muted/60 border border-border/40">
                <span className="text-[11px] text-muted-foreground block font-medium">Matched Segment</span>
                <b className="text-foreground text-base font-extrabold block mt-0.5">
                  {p.segmentId}
                  {p.matchedDistanceMeters !== undefined && (
                    <small className="text-[10px] text-muted-foreground font-normal ml-1">
                      ({p.matchedDistanceMeters}m)
                    </small>
                  )}
                </b>
              </div>

              {/* Suppression check */}
              <div className="p-3 rounded-xl bg-muted/60 border border-border/40">
                <span className="text-[11px] text-muted-foreground block font-medium">False Positive Filter</span>
                <b className="text-emerald-600 dark:text-emerald-400 text-sm font-extrabold block mt-0.5 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  {!p.isSuppressed ? "Passed (Accepted)" : `Suppressed (${p.suppressionReason})`}
                </b>
              </div>
            </div>

            {/* Context details bar */}
            <div className="p-3 rounded-xl bg-muted/40 border border-border/50 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span>{p.latitude.toFixed(6)}, {p.longitude.toFixed(6)}</span>
                </span>
                <span>
                  Source: <b className="text-foreground font-bold">{p.predictionSource}</b>
                </span>
                <span>
                  Pass: <b className="text-foreground font-bold">{p.passId || "PASS_01_001_01"}</b>
                </span>
                {p.featuresSummary && (
                  <span className="hidden sm:inline text-muted-foreground">
                    Jerk max: <b className="text-foreground">{p.featuresSummary.jerkMax} m/s³</b> · Speed: <b className="text-foreground">{p.featuresSummary.speedMean} km/h</b>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="min-h-[38px] h-9 px-3 text-xs font-semibold rounded-lg border-border flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Test Another Window</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Collapsible Model Details Accordion */}
        <details className="text-xs text-muted-foreground rounded-xl border border-dashed border-border/60 bg-muted/30 p-2.5 group">
          <summary className="cursor-pointer font-semibold text-xs text-foreground/80 flex items-center justify-between select-none">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary" />
              Model details
            </span>
            <span className="text-[10px] text-muted-foreground">
              34 features · 5s window · 50 samples · 10 Hz
            </span>
          </summary>
          <div className="pt-2 mt-2 border-t border-border/40 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-[10px] text-muted-foreground block">Feature Vector</span>
              <b className="text-foreground">34 kinematic & jerk</b>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Window Duration</span>
              <b className="text-foreground">5-second temporal</b>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Sample Count</span>
              <b className="text-foreground">50 samples @ 10 Hz</b>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Model Version</span>
              <b className="text-foreground">{p.modelVersion}</b>
            </div>
          </div>
        </details>

        {/* Subtle footer */}
        <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-muted-foreground">
          <span>
            Preview mode — Offline inference pipeline. Test predictions do not write to live database.
          </span>
          <span className="font-medium text-muted-foreground/80">
            Demo data · Synthetic KSRTC-style observations
          </span>
        </div>
      </div>
    </section>
  );
}
