import { useMemo } from "react";
import { X, Route, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DemoRoute } from "@/lib/traveller-routes";
import { calculateRouteCondition } from "@/lib/traveller-routes";
import type { SegmentRow } from "@/lib/roadsense-data";

interface RouteComparisonDialogProps {
  routes: DemoRoute[];
  summariesMap: Map<string, SegmentRow>;
  onClose: () => void;
  onSelectRoute: (routeId: string) => void;
}

export function RouteComparisonDialog({
  routes,
  summariesMap,
  onClose,
  onSelectRoute,
}: RouteComparisonDialogProps) {
  const comparisons = useMemo(() => {
    return routes.map((r) => ({
      route: r,
      summary: calculateRouteCondition(r, summariesMap),
    }));
  }, [routes, summariesMap]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-foreground">
              Factual Route Comparison
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Side-by-side factual road intelligence metrics across 12 Kerala demo corridors without subjective rankings.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full cursor-pointer"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Modal Table Body */}
        <div className="p-4 overflow-x-auto flex-1">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border/60 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                <th className="py-2 px-2.5">Corridor Route</th>
                <th className="py-2 px-2.5">Condition</th>
                <th className="py-2 px-2.5">Score</th>
                <th className="py-2 px-2.5">Confidence</th>
                <th className="py-2 px-2.5">Segments</th>
                <th className="py-2 px-2.5">Hazards</th>
                <th className="py-2 px-2.5">Potholes</th>
                <th className="py-2 px-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {comparisons.map(({ route, summary }) => {
                const isObserved = summary.hasObservations;

                return (
                  <tr key={route.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-2.5 font-bold text-foreground">
                      <div className="flex items-center gap-1.5">
                        <Route className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{route.name}</span>
                      </div>
                      <small className="text-[10px] text-muted-foreground font-normal block">
                        {route.distanceKm} km approx
                      </small>
                    </td>

                    <td className="py-2.5 px-2.5">
                      {isObserved ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            summary.conditionClass === "GOOD"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : summary.conditionClass === "MODERATE"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                          }`}
                        >
                          {summary.conditionClass}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Unobserved</span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 font-extrabold text-foreground">
                      {isObserved ? `${summary.conditionScore}/100` : "—"}
                    </td>

                    <td className="py-2.5 px-2.5 font-bold text-primary">
                      {isObserved ? `${summary.observationConfidencePct}%` : "—"}
                    </td>

                    <td className="py-2.5 px-2.5 text-foreground">
                      {isObserved ? summary.totalMonitoredSegments : "0"}
                    </td>

                    <td className="py-2.5 px-2.5 text-foreground font-semibold">
                      {isObserved ? summary.hazards.totalHazards : "—"}
                    </td>

                    <td className="py-2.5 px-2.5 font-semibold text-rose-600 dark:text-rose-400">
                      {isObserved ? summary.hazards.potholeCount : "—"}
                    </td>

                    <td className="py-2.5 px-2.5 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onSelectRoute(route.id);
                          onClose();
                        }}
                        className="h-7 px-2.5 text-[11px] font-semibold rounded-lg"
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span>Demo data • Synthetic KSRTC-style observations</span>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onClose}
            className="h-8 px-4 text-xs font-semibold rounded-lg"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
