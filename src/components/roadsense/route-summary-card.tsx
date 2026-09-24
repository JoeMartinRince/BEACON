import {
  Route as RouteIcon,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Clock,
  Compass,
  ArrowLeft,
  Columns2,
  Info,
  Layers,
  Activity,
  BusFront,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DemoRoute, RouteConditionSummary } from "@/lib/traveller-routes";

interface RouteSummaryCardProps {
  route: DemoRoute;
  summary: RouteConditionSummary;
  onClearRoute: () => void;
  onOpenCompare?: () => void;
}

export function RouteSummaryCard({
  route,
  summary,
  onClearRoute,
  onOpenCompare,
}: RouteSummaryCardProps) {
  const isObserved = summary.hasObservations;

  return (
    <article className="panel p-4 sm:p-5 space-y-4">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClearRoute}
            className="h-8 px-2.5 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
            title="Return to statewide full network map"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Full Network</span>
          </Button>

          <div className="h-5 w-px bg-border/60 mx-0.5 hidden sm:block" />

          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
              Selected Corridor
            </span>
            <h3 className="text-base sm:text-lg font-extrabold text-foreground flex items-center gap-2">
              <RouteIcon className="w-4 h-4 text-primary shrink-0" />
              <span>{route.name}</span>
            </h3>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onOpenCompare && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenCompare}
              className="h-8 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Columns2 className="w-3.5 h-3.5 text-primary" />
              <span>Compare Routes</span>
            </Button>
          )}

          {isObserved ? (
            <span
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                summary.conditionClass === "GOOD"
                  ? "bg-emerald-600 text-white"
                  : summary.conditionClass === "MODERATE"
                    ? "bg-amber-500 text-white"
                    : "bg-rose-600 text-white"
              }`}
            >
              {summary.conditionClass} · {summary.conditionScore}/100
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
              Awaiting Observations
            </span>
          )}
        </div>
      </div>

      {/* Description & Distance subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-muted-foreground">
        <p className="font-medium text-foreground/90">{route.description}</p>
        <span className="text-[11px] font-bold text-foreground shrink-0">
          Estimated Corridor Length: {route.distanceKm} km
        </span>
      </div>

      {/* 4 Core Summary Metrics Grid */}
      {isObserved ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* 1. Condition Score */}
            <div className="p-3 rounded-xl bg-muted/60 border border-border/50 flex flex-col justify-between">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                Route Condition
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <strong className="text-xl sm:text-2xl font-extrabold text-foreground">
                  {summary.conditionScore}
                </strong>
                <small className="text-xs text-muted-foreground font-medium">/ 100</small>
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5">Length-weighted score</span>
            </div>

            {/* 2. Observation Confidence */}
            <div className="p-3 rounded-xl bg-muted/60 border border-border/50 flex flex-col justify-between">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                Observation Confidence
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <strong className="text-xl sm:text-2xl font-extrabold text-primary">
                  {summary.observationConfidencePct}%
                </strong>
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5">Repeated pass volume</span>
            </div>

            {/* 3. Observed Passes & Fleet Buses */}
            <div className="p-3 rounded-xl bg-muted/60 border border-border/50 flex flex-col justify-between">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                Observed Passes
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <strong className="text-xl sm:text-2xl font-extrabold text-foreground">
                  {summary.totalPasses}
                </strong>
                <small className="text-xs text-muted-foreground font-medium">passes</small>
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5">
                {summary.uniqueBuses} unique fleet buses
              </span>
            </div>

            {/* 4. Monitored Segments & Hazards */}
            <div className="p-3 rounded-xl bg-muted/60 border border-border/50 flex flex-col justify-between">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                Monitored Segments
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <strong className="text-xl sm:text-2xl font-extrabold text-foreground">
                  {summary.totalMonitoredSegments}
                </strong>
                <small className="text-xs text-muted-foreground font-medium">segments</small>
              </div>
              <span className="text-[10px] text-primary font-bold mt-0.5">
                {summary.hazards.totalHazards} accepted hazards
              </span>
            </div>
          </div>

          {/* Deterministic Explanation Card */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5 text-xs text-foreground/90">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-primary block text-[11px] uppercase tracking-wider">
                Why this route score?
              </span>
              <p className="mt-0.5 leading-relaxed font-medium">
                {summary.explanation}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="p-6 rounded-xl bg-muted/40 border border-dashed border-border/60 text-center space-y-2">
          <p className="text-sm font-bold text-foreground">
            Insufficient Mapped Observations for {route.name}
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            This corridor represents a realistic Kerala intercity travel route. Beacon has not yet recorded repeated multi-bus sensor passes on this specific geographic sector.
          </p>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onClearRoute}
            className="mt-2 text-xs font-semibold rounded-lg"
          >
            Explore Monitored Corridors
          </Button>
        </div>
      )}
    </article>
  );
}
