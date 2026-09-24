import { useState, useMemo } from "react";
import { Search, Compass, Route, ChevronRight, ShieldCheck, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DemoRoute } from "@/lib/traveller-routes";
import { calculateRouteCondition } from "@/lib/traveller-routes";
import type { SegmentRow } from "@/lib/roadsense-data";

interface RouteSelectorProps {
  routes: DemoRoute[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  summaries: SegmentRow[];
}

export function RouteSelector({
  routes,
  selectedRouteId,
  onSelectRoute,
  summaries,
}: RouteSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "OBSERVED" | "STATEWIDE">("ALL");

  const summariesMap = useMemo(() => {
    return new Map(summaries.map((s) => [s.segment_id, s]));
  }, [summaries]);

  // Compute calculated conditions for all routes once
  const routeSummaries = useMemo(() => {
    return routes.map((r) => ({
      route: r,
      summary: calculateRouteCondition(r, summariesMap),
    }));
  }, [routes, summariesMap]);

  // Filter routes based on search and category
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return routeSummaries.filter(({ route }) => {
      if (filterType === "OBSERVED" && route.status !== "OBSERVED") return false;
      if (filterType === "STATEWIDE" && route.status !== "INSUFFICIENT_OBSERVATIONS") return false;
      if (!q) return true;
      return (
        route.name.toLowerCase().includes(q) ||
        route.origin.toLowerCase().includes(q) ||
        route.destination.toLowerCase().includes(q) ||
        route.description.toLowerCase().includes(q)
      );
    });
  }, [routeSummaries, searchQuery, filterType]);

  return (
    <section className="panel p-4 sm:p-5 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
            <Compass className="w-3.5 h-3.5" />
            <span>Explore a Route</span>
          </div>
          <h3 className="text-base sm:text-lg font-extrabold text-foreground mt-0.5">
            Where are you travelling?
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select one of 12 Kerala demo travel corridors to inspect road conditions and hazard intelligence.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl self-start sm:self-auto text-xs">
          <Button
            type="button"
            variant={filterType === "ALL" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilterType("ALL")}
            className="h-7 px-2.5 text-xs font-semibold rounded-lg"
          >
            All ({routes.length})
          </Button>
          <Button
            type="button"
            variant={filterType === "OBSERVED" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilterType("OBSERVED")}
            className="h-7 px-2.5 text-xs font-semibold rounded-lg"
          >
            Monitored (7)
          </Button>
          <Button
            type="button"
            variant={filterType === "STATEWIDE" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilterType("STATEWIDE")}
            className="h-7 px-2.5 text-xs font-semibold rounded-lg"
          >
            Statewide (5)
          </Button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search destination, city, or corridor (e.g. Munnar, Thrissur, Alappuzha)..."
          className="pl-9 h-10 text-xs sm:text-sm rounded-xl border-border/70 bg-background"
        />
      </div>

      {/* 12 Route Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(({ route, summary }) => {
          const isSelected = selectedRouteId === route.id;
          const isObserved = summary.hasObservations;

          return (
            <article
              key={route.id}
              onClick={() => onSelectRoute(route.id)}
              className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between select-none ${
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/40 shadow-sm"
                  : "border-border/60 bg-card hover:bg-muted/40 hover:border-border"
              }`}
            >
              <div>
                {/* Card Top: Name & Condition Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                      <Route className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{route.name}</span>
                    </h4>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                      {route.description}
                    </p>
                  </div>

                  {isObserved ? (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                        summary.conditionClass === "GOOD"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                          : summary.conditionClass === "MODERATE"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                            : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {summary.conditionClass} · {summary.conditionScore}/100
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 bg-muted text-muted-foreground border border-border/50">
                      Unobserved
                    </span>
                  )}
                </div>

                {/* Key Metrics Row */}
                {isObserved ? (
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-border/40 text-[11px]">
                    <div>
                      <span className="text-[9px] text-muted-foreground block">Confidence</span>
                      <b className="text-foreground font-bold">{summary.observationConfidencePct}%</b>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground block">Segments</span>
                      <b className="text-foreground font-bold">{summary.totalMonitoredSegments}</b>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground block">Hazards</span>
                      <b className="text-primary font-bold">{summary.hazards.totalHazards}</b>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 pt-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-muted-foreground/80 shrink-0" />
                    <span>Insufficient mapped observations on corridor.</span>
                  </div>
                )}
              </div>

              {/* Card Footer: Explore CTA */}
              <div className="mt-3 pt-2 flex items-center justify-between text-xs">
                <span className="text-[10px] text-muted-foreground font-medium">
                  {route.distanceKm} km approx
                </span>
                <span
                  className={`inline-flex items-center gap-1 font-bold text-[11px] ${
                    isSelected ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{isSelected ? "Active Route" : "Explore"}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="p-8 text-center text-xs text-muted-foreground">
          No corridors match &quot;{searchQuery}&quot;. Try searching for &quot;Kochi&quot;, &quot;Munnar&quot;, or &quot;Thrissur&quot;.
        </div>
      )}

      {/* Synthetic Notice */}
      <div className="pt-2 text-[10px] text-muted-foreground flex flex-wrap items-center justify-between gap-1 border-t border-border/40">
        <span className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span>Demo data • Synthetic KSRTC-style observations</span>
        </span>
        <span className="italic text-[9px] text-muted-foreground/80">
          Prototype road-condition estimate • Not official KSRTC schedule
        </span>
      </div>
    </section>
  );
}
