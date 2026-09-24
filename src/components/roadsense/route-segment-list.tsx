import { useState, useMemo } from "react";
import { Filter, Layers, ChevronRight, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SegmentRow } from "@/lib/roadsense-data";

interface RouteSegmentListProps {
  segmentIds: string[];
  summariesMap: Map<string, SegmentRow>;
  selectedSegmentId: string | null;
  onSelectSegment: (segmentId: string) => void;
}

export function RouteSegmentList({
  segmentIds,
  summariesMap,
  selectedSegmentId,
  onSelectSegment,
}: RouteSegmentListProps) {
  const [filter, setFilter] = useState<
    "ALL" | "GOOD" | "MODERATE" | "POOR" | "POTHOLES" | "ROUGHNESS"
  >("ALL");

  // Retrieve segment objects in route order
  const segments = useMemo(() => {
    return segmentIds
      .map((id) => summariesMap.get(id))
      .filter((s): s is SegmentRow => Boolean(s));
  }, [segmentIds, summariesMap]);

  // Apply filters
  const filtered = useMemo(() => {
    return segments.filter((s) => {
      const score = Number(s.condition_score ?? 74.4);
      const cls = s.condition_class ?? (score >= 80 ? "GOOD" : score >= 50 ? "MODERATE" : "POOR");
      const potholes = Number(s.pothole_count ?? 0);
      const roughness = Number(s.roughness_count ?? 0);

      if (filter === "GOOD") return cls === "GOOD";
      if (filter === "MODERATE") return cls === "MODERATE";
      if (filter === "POOR") return cls === "POOR";
      if (filter === "POTHOLES") return potholes > 0;
      if (filter === "ROUGHNESS") return roughness > 0;
      return true;
    });
  }, [segments, filter]);

  if (segments.length === 0) {
    return null;
  }

  return (
    <section className="panel p-4 sm:p-5 space-y-3.5">
      {/* Header and Filter Chips */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border/50 pb-2.5">
        <div>
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
            Corridor Segments
          </span>
          <h4 className="text-sm font-extrabold text-foreground flex items-center gap-1.5 mt-0.5">
            <Layers className="w-4 h-4 text-primary shrink-0" />
            <span>Monitored Route Segments ({filtered.length} of {segments.length})</span>
          </h4>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs scrollbar-none">
          <Button
            type="button"
            variant={filter === "ALL" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter("ALL")}
            className="h-7 px-2 text-[11px] font-semibold rounded-lg"
          >
            All
          </Button>
          <Button
            type="button"
            variant={filter === "POOR" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter("POOR")}
            className="h-7 px-2 text-[11px] font-semibold rounded-lg text-rose-600 dark:text-rose-400"
          >
            Poor
          </Button>
          <Button
            type="button"
            variant={filter === "MODERATE" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter("MODERATE")}
            className="h-7 px-2 text-[11px] font-semibold rounded-lg text-amber-600 dark:text-amber-400"
          >
            Moderate
          </Button>
          <Button
            type="button"
            variant={filter === "GOOD" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter("GOOD")}
            className="h-7 px-2 text-[11px] font-semibold rounded-lg text-emerald-600 dark:text-emerald-400"
          >
            Good
          </Button>
          <Button
            type="button"
            variant={filter === "POTHOLES" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter("POTHOLES")}
            className="h-7 px-2 text-[11px] font-semibold rounded-lg"
          >
            Potholes
          </Button>
          <Button
            type="button"
            variant={filter === "ROUGHNESS" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter("ROUGHNESS")}
            className="h-7 px-2 text-[11px] font-semibold rounded-lg"
          >
            Roughness
          </Button>
        </div>
      </div>

      {/* Segment Cards List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
        {filtered.map((s) => {
          const isSelected = selectedSegmentId === s.segment_id;
          const score = Number(s.condition_score ?? 74.4);
          const cls = s.condition_class ?? (score >= 80 ? "GOOD" : score >= 50 ? "MODERATE" : "POOR");

          // Normalized scale-safe confidence
          let rawConf = Number(s.confidence ?? 0.83);
          if (rawConf > 1.0) rawConf = rawConf / 100;
          const confPct = Math.round(rawConf * 100);

          const potholes = Number(s.pothole_count ?? 0);
          const sb = Number(s.speed_breaker_count ?? 0);
          const bp = Number(s.broken_patch_count ?? 0);
          const rough = Number(s.roughness_count ?? 0);
          const totalHazards = potholes + sb + bp + rough;

          return (
            <div
              key={s.segment_id}
              onClick={() => onSelectSegment(s.segment_id)}
              className={`p-3 rounded-xl border transition-all duration-150 cursor-pointer select-none ${
                isSelected
                  ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-xs"
                  : "border-border/60 bg-card hover:bg-muted/40 hover:border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="font-mono font-extrabold text-xs text-foreground">
                  {s.segment_id}
                </span>

                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    cls === "GOOD"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                      : cls === "MODERATE"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                        : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {cls} · {score}/100
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{confPct}% confidence</span>
                <span>{s.length_m ?? 120} m</span>
              </div>

              <div className="mt-1.5 pt-1.5 border-t border-border/40 text-[10px]">
                {totalHazards > 0 ? (
                  <span className="text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>
                      {potholes > 0 && `${potholes} pot `}
                      {sb > 0 && `${sb} sb `}
                      {bp > 0 && `${bp} bp `}
                      {rough > 0 && `${rough} rough`}
                    </span>
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>No accepted hazards</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
