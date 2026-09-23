import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useRoadData, label } from "@/lib/roadsense-data";
import { PageTitle } from "@/components/roadsense/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendChart } from "@/components/roadsense/charts";
import { ShieldCheck, AlertTriangle, HelpCircle, Activity, Info } from "lucide-react";

const MapView = lazy(() => import("@/components/roadsense/leaflet-map"));
const schema = z.object({ segment: z.string().optional() });

export const Route = createFileRoute("/road-map")({
  ssr: false,
  validateSearch: (s) => schema.parse(s),
  head: () => ({
    meta: [
      { title: "Road Map — Beacon Road Intelligence" },
      {
        name: "description",
        content: "Explore corridor condition indicators and repeated bus observation intelligence.",
      },
      { property: "og:title", content: "Road Map — Beacon Road Intelligence" },
      {
        property: "og:description",
        content: "Explore monitored segments, condition scores, and detected events on an interactive map.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoadMap,
});

/**
 * Deterministic human-readable explanation generated from existing metrics.
 * Answers the traveller question: "Why does Beacon think this road has this condition?"
 */
function getScoreExplanation(score: number, confidencePct: number, s?: any): string {
  if (confidencePct < 50) {
    return "More observations are needed across additional fleet passes to increase observation confidence.";
  }
  if (score >= 80) {
    return "Few accepted hazards have been observed across repeated bus passes. Baseline structural integrity remains sound.";
  }
  if (score >= 50) {
    return "Some recurring road issues have been observed across multiple passes. Moderate structural degradation detected.";
  }
  const potholes = s?.pothole_count ?? 0;
  const passes = s?.affected_pass_count ?? s?.pass_count ?? 0;
  if (potholes > 0) {
    return `Repeated higher-severity hazards (including ${potholes} accepted potholes) confirmed across ${passes} passes caused the segment score to decrease significantly.`;
  }
  return "Repeated higher-severity hazards have been observed across multiple passes, lowering the corridor health score.";
}

function RoadMap() {
  const d = useRoadData();
  const search = Route.useSearch();
  const [selected, setSelected] = useState(search.segment ?? "");

  useEffect(() => {
    if (!selected && d.summaries[0]) {
      setSelected(d.summaries[0].segment_id);
    }
  }, [d.summaries, selected]);

  const [mode, setMode] = useState<"segments" | "events">("segments");
  const [minScore, setMinScore] = useState(0);
  const [minConf, setMinConf] = useState(0);
  const [filterClass, setFilterClass] = useState("all");

  const filteredSummaries = useMemo(() => {
    return d.summaries.filter((s) => {
      const score = s.condition_score ?? 74.4;
      const conf = (s.confidence ?? 0.83) * 100;
      const cls = s.condition_class ?? (score >= 80 ? "GOOD" : score >= 50 ? "MODERATE" : "POOR");

      if (score < minScore) return false;
      if (conf < minConf) return false;
      if (filterClass !== "all" && cls !== filterClass) return false;
      return true;
    });
  }, [d.summaries, minScore, minConf, filterClass]);

  const s = d.summaries.find((x) => x.segment_id === selected);
  const ev = d.events.filter((e) => e.segment_id === selected);

  const score = s?.condition_score != null ? s.condition_score : 74.4;
  const conditionClass =
    s?.condition_class ?? (score >= 80 ? "GOOD" : score >= 50 ? "MODERATE" : "POOR");
  const confidencePct = Math.round((s?.confidence ?? 0.83) * 100);

  // Dynamic freshness calculation derived from the dataset
  const dynamicFreshness = useMemo(() => {
    if (s?.last_observed_at) {
      return new Date(s.last_observed_at).toLocaleString();
    }
    if (d.events.length > 0) {
      const latestTs = d.events.reduce((max, e) => {
        const t = new Date(e.timestamp).getTime();
        return t > max ? t : max;
      }, 0);
      if (latestTs > 0) {
        return new Date(latestTs).toLocaleString();
      }
    }
    return "18 Sep 2026, 06:30";
  }, [s, d.events]);

  const scoreExplanation = useMemo(
    () => getScoreExplanation(score, confidencePct, s),
    [score, confidencePct, s]
  );

  const trend = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        name: `W${i + 1}`,
        value: Math.max(20, Math.min(100, Math.round(score + (i - 3) * 2.5 + Math.sin(i) * 3))),
      })),
    [score]
  );

  return (
    <>
      <PageTitle
        title="Traveller Road Map"
        subtitle="Repeated multi-bus observations aggregated into corridor road-condition intelligence."
      />

      {/* Map Control Filters */}
      <div className="map-filters panel flex flex-wrap items-center gap-3">
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="text-xs rounded-md border border-border bg-background px-2.5 py-1.5 font-medium"
        >
          <option value="all">All Condition Classes</option>
          <option value="GOOD">Good (≥ 80)</option>
          <option value="MODERATE">Moderate (50–79)</option>
          <option value="POOR">Poor (&lt; 50)</option>
        </select>

        <label className="text-xs flex items-center gap-1.5 font-medium text-muted-foreground">
          Min Score
          <Input
            type="number"
            min="0"
            max="100"
            value={minScore}
            onChange={(e) => setMinScore(+e.target.value)}
            className="w-16 h-7 text-xs"
          />
        </label>

        <label className="text-xs flex items-center gap-1.5 font-medium text-muted-foreground">
          Min Confidence %
          <Input
            type="number"
            min="0"
            max="100"
            value={minConf}
            onChange={(e) => setMinConf(+e.target.value)}
            className="w-16 h-7 text-xs"
          />
        </label>

        <div className="mode-toggle ml-auto flex gap-1">
          <Button
            variant={mode === "segments" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("segments")}
            className="h-7 text-xs font-semibold"
          >
            Corridors
          </Button>
          <Button
            variant={mode === "events" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("events")}
            className="h-7 text-xs font-semibold"
          >
            Events
          </Button>
        </div>
      </div>

      <div className="map-layout">
        <div className="panel map-large">
          <ClientOnly fallback={<div className="map-loading">Loading road intelligence map…</div>}>
            <Suspense fallback={<div className="map-loading">Loading road intelligence map…</div>}>
              <MapView
                features={d.segments}
                summaries={filteredSummaries}
                events={d.events}
                mode={mode}
                selected={selected}
                onSelect={setSelected}
              />
            </Suspense>
          </ClientOnly>

          {/* Condition-based Map Legend & Confidence Guidance */}
          <div className="map-legend flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs pt-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-foreground">Road Condition:</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <b>Good</b> (80–100)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <b>Moderate</b> (50–79)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-rose-500" />
                <b>Poor</b> (&lt; 50)
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info className="w-3 h-3 text-primary shrink-0" />
              <span>Observation confidence represents observation volume, not probability of safety.</span>
            </div>
          </div>
        </div>

        {/* Selected Segment Inspector Card */}
        <aside className="panel inspector space-y-3">
          {s ? (
            <>
              <div className="card-heading flex items-center justify-between gap-2 border-b pb-2">
                <div>
                  <small className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                    Selected Corridor
                  </small>
                  <h3 className="text-base font-extrabold text-foreground">{selected}</h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {s?.road_name || "NH_CORRIDOR_A"} · {s?.road_type || "HIGHWAY"} ({s?.length_m || 120}m)
                  </p>
                </div>

                {/* Condition Score & Badge */}
                <div className="text-right shrink-0">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-full text-xs font-black tracking-wide text-white ${
                      conditionClass === "GOOD"
                        ? "bg-emerald-600"
                        : conditionClass === "MODERATE"
                        ? "bg-amber-500"
                        : "bg-rose-600"
                    }`}
                  >
                    {conditionClass}
                  </span>
                  <div className="text-xs font-extrabold text-foreground mt-0.5">
                    {score} <span className="text-[10px] text-muted-foreground font-normal">/ 100</span>
                  </div>
                </div>
              </div>

              {/* 8 & 9. WHY THIS SCORE? DETERMINISTIC EXPLANATION */}
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary">
                  <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Why this score?</span>
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                  {scoreExplanation}
                </p>
                {confidencePct < 50 && (
                  <span className="inline-block text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-1">
                    ⚠️ Low confidence — Beacon needs more repeated observations.
                  </span>
                )}
              </div>

              {/* Observation Evidence Grid */}
              <div className="detail-grid">
                <div>
                  <small>Observation Confidence</small>
                  <b className="text-primary font-black">{confidencePct}%</b>
                </div>
                <div>
                  <small>Observed Passes</small>
                  <b>{s?.pass_count ?? s?.n_passes ?? 60} passes</b>
                </div>
                <div>
                  <small>Fleet Buses</small>
                  <b>{s?.unique_bus_count ?? 10} buses</b>
                </div>
                <div>
                  <small>Affected Passes</small>
                  <b className={(s?.affected_pass_count ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : ""}>
                    {s?.affected_pass_count ?? 0} passes
                  </b>
                </div>
              </div>

              {/* Catalogued Hazards Breakdown */}
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-foreground">
                  <span>Catalogued Hazards</span>
                  <span className="text-muted-foreground">{s?.event_count ?? s?.n_events ?? ev.length} total</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="flex justify-between py-0.5 px-1.5 rounded bg-background/60">
                    <span className="text-muted-foreground">Potholes:</span>
                    <b className="text-foreground">{s?.pothole_count ?? 0}</b>
                  </div>
                  <div className="flex justify-between py-0.5 px-1.5 rounded bg-background/60">
                    <span className="text-muted-foreground">Speed Breakers:</span>
                    <b className="text-foreground">{s?.speed_breaker_count ?? 0}</b>
                  </div>
                  <div className="flex justify-between py-0.5 px-1.5 rounded bg-background/60">
                    <span className="text-muted-foreground">Broken Patches:</span>
                    <b className="text-foreground">{s?.broken_patch_count ?? 0}</b>
                  </div>
                  <div className="flex justify-between py-0.5 px-1.5 rounded bg-background/60">
                    <span className="text-muted-foreground">Roughness:</span>
                    <b className="text-foreground">{s?.roughness_count ?? 0}</b>
                  </div>
                </div>

                {/* Filtered non-hazards diagnostic */}
                <div className="pt-1 flex items-center justify-between text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Filtered non-hazards:
                  </span>
                  <b>{s?.suppressed_count ?? 0} suppressed</b>
                </div>
              </div>

              {/* Condition Trend */}
              <div className="pt-1">
                <h4 className="text-xs font-bold text-foreground mb-1">Condition Score Trend</h4>
                <div className="h-32">
                  <TrendChart data={trend} />
                </div>
              </div>

              {/* Last Observed Timestamp & Freshness */}
              <div className="pt-2 border-t text-[10px] text-muted-foreground space-y-1">
                <div className="flex items-center justify-between">
                  <span>Last observed:</span>
                  <b className="text-foreground">{dynamicFreshness}</b>
                </div>
                <div className="text-[9px] italic text-muted-foreground/80">
                  Demo dataset • Synthetic KSRTC-style observations
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
              <p>No road corridors match your current filters.</p>
              <p className="text-[11px]">Adjust your minimum score or confidence criteria above.</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
