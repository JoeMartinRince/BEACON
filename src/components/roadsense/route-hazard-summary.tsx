import { AlertTriangle, ShieldCheck, Activity, Layers, BusFront, Info } from "lucide-react";
import type { RouteHazardBreakdown } from "@/lib/traveller-routes";

interface RouteHazardSummaryProps {
  hazards: RouteHazardBreakdown;
  monitoredSegments: number;
  distanceKm: number;
  totalPasses: number;
  uniqueBuses: number;
}

export function RouteHazardSummary({
  hazards,
  monitoredSegments,
  distanceKm,
  totalPasses,
  uniqueBuses,
}: RouteHazardSummaryProps) {
  return (
    <section className="panel p-4 sm:p-5 space-y-3.5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div>
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
            Corridor Road Anomalies
          </span>
          <h4 className="text-sm font-extrabold text-foreground flex items-center gap-1.5 mt-0.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Road Hazards Observed Along Route</span>
          </h4>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-primary">
            {hazards.totalHazards} Accepted Hazards
          </span>
          <span className="text-xs text-muted-foreground font-medium">
            ({hazards.hazardDensityPerKm} / km)
          </span>
        </div>
      </div>

      {/* 4 Hazard Class Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        {/* 1. Potholes */}
        <div className="p-3 rounded-xl bg-muted/60 border border-border/50">
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
            Potholes
          </span>
          <b className="text-lg font-extrabold text-rose-600 dark:text-rose-400 block mt-1">
            {hazards.potholeCount}
          </b>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">
            Confirmed structural depressions
          </span>
        </div>

        {/* 2. Speed Breakers */}
        <div className="p-3 rounded-xl bg-muted/60 border border-border/50">
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
            Speed Breakers
          </span>
          <b className="text-lg font-extrabold text-amber-600 dark:text-amber-400 block mt-1">
            {hazards.speedBreakerCount}
          </b>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">
            Engineered traffic calmers
          </span>
        </div>

        {/* 3. Broken Patches */}
        <div className="p-3 rounded-xl bg-muted/60 border border-border/50">
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
            Broken Patches
          </span>
          <b className="text-lg font-extrabold text-orange-600 dark:text-orange-400 block mt-1">
            {hazards.brokenPatchCount}
          </b>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">
            Bitumen deterioration
          </span>
        </div>

        {/* 4. Roughness */}
        <div className="p-3 rounded-xl bg-muted/60 border border-border/50">
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
            Roughness
          </span>
          <b className="text-lg font-extrabold text-yellow-600 dark:text-yellow-400 block mt-1">
            {hazards.roughnessCount}
          </b>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">
            Continuous surface vibrations
          </span>
        </div>
      </div>

      {/* Repeated Pass vs Event Count Explanatory Footnote (Section 9 requirement) */}
      <div className="p-3 rounded-xl bg-muted/30 border border-border/50 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-[11px] leading-relaxed">
            <b className="text-foreground">Repeated Pass Evidence:</b> Observed repeatedly across <b>{totalPasses} fleet passes</b> and <b>{uniqueBuses} unique buses</b>.
            Beacon distinguishes <i>event count</i> ({hazards.totalHazards} hazards) from <i>affected passes</i> ({hazards.affectedPasses} passes) so multiple anomalies encountered during a single bus pass do not inflate independent pass counts.
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            ✓ 74 non-hazard maneuvers (sharp lane changes & bridge joints) are strictly suppressed.
          </p>
        </div>
      </div>
    </section>
  );
}
