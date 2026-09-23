import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Map,
  Rows3,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  Route,
  Activity,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRoadData } from "@/lib/roadsense-data";
import { calculateNetworkCondition } from "@/lib/condition-engine";

export function TravellerStatusBar() {
  const d = useRoadData();

  const net = useMemo(() => {
    if (!d.summaries.length) {
      return {
        networkScore: 74.4,
        goodCount: 72,
        moderateCount: 78,
        poorCount: 10,
        totalCorridors: 160,
        totalPasses: 60,
        totalHazards: 4323,
        uniqueBuses: 10,
      };
    }
    return calculateNetworkCondition(
      d.summaries.map((s) => ({
        conditionScore: Number(s.condition_score ?? 74.4),
        segmentLengthMeters: Number(s.length_m ?? 100),
        conditionClass: String(s.condition_class ?? "MODERATE"),
        totalPasses: Number(s.pass_count ?? s.n_passes ?? 60),
        totalEvents: Number(s.event_count ?? s.n_events ?? 0),
        uniqueBuses: Number(s.unique_bus_count ?? 10),
      }))
    );
  }, [d.summaries]);

  // Dynamically compute the latest relevant observation timestamp
  const latestTimestamp = useMemo(() => {
    if (d.events.length > 0) {
      const maxTs = d.events.reduce((latest, e) => {
        const t = new Date(e.timestamp).getTime();
        return t > latest ? t : latest;
      }, 0);
      if (maxTs > 0) {
        return new Date(maxTs).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }
    return "18 Sep 2026, 06:30";
  }, [d.events]);

  const scoreClass =
    net.networkScore >= 80 ? "text-emerald-600 dark:text-emerald-400" :
    net.networkScore >= 50 ? "text-amber-600 dark:text-amber-400" :
    "text-rose-600 dark:text-rose-400";

  const scoreLabel =
    net.networkScore >= 80 ? "Good" :
    net.networkScore >= 50 ? "Moderate" : "Poor";

  return (
    <section className="mb-4 rounded-xl border border-border bg-card shadow-[0_4px_20px_oklch(0.3_0.04_285/0.04)] dark:shadow-[0_4px_20px_oklch(0.05_0_0/0.25)] p-3.5 transition-all">
      {/* Top Header / Mode row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            Traveller Mode Active
          </span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 uppercase tracking-wide">
            Road Intelligence
          </span>
        </div>

        {/* Action navigation shortcuts */}
        <div className="flex items-center gap-1.5">
          <Link to="/road-map">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] px-2.5 font-medium border-border"
            >
              <Map className="w-3 h-3 mr-1 text-emerald-600" /> View Live Map
            </Button>
          </Link>
          <Link to="/segments">
            <Button
              variant="default"
              size="sm"
              className="h-7 text-[11px] px-2.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Rows3 className="w-3 h-3 mr-1" /> Compare Corridors <ArrowUpRight className="w-3 h-3 ml-0.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Snapshot metrics bar */}
      <div className="pt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/40">
          <div className="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <small className="text-[10px] text-muted-foreground block truncate">Network Condition</small>
            <span className="font-bold text-foreground text-xs">
              {net.networkScore}/100 <span className={`text-[10px] font-semibold ${scoreClass}`}>({scoreLabel})</span>
            </span>
            <span className="text-[9px] text-muted-foreground block">
              {net.goodCount}G · {net.moderateCount}M · {net.poorCount}P
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/40">
          <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Route className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <small className="text-[10px] text-muted-foreground block truncate">Corridors Monitored</small>
            <span className="font-bold text-foreground text-xs">{net.totalCorridors} Segments</span>
            <span className="text-[9px] text-muted-foreground block">Kochi / Ernakulam</span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/40">
          <div className="w-7 h-7 rounded-md bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <small className="text-[10px] text-muted-foreground block truncate">Catalogued Hazards</small>
            <span className="font-bold text-foreground text-xs">{(net.totalHazards || 4323).toLocaleString()} Events</span>
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 block font-medium">74 non-hazards filtered</span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/40">
          <div className="w-7 h-7 rounded-md bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <small className="text-[10px] text-muted-foreground block truncate">Observations</small>
            <span className="font-bold text-foreground text-xs">{net.totalPasses} Passes</span>
            <span className="text-[9px] text-muted-foreground block">{net.uniqueBuses} KSRTC Fleet Buses</span>
          </div>
        </div>
      </div>

      {/* Dynamic Data Freshness & Synthetic Note */}
      <div className="mt-2.5 pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-muted-foreground/70" />
          <span>Last pass recorded: <b className="text-foreground font-semibold">{latestTimestamp}</b></span>
        </span>
        <span className="font-medium text-muted-foreground/80">
          Demo data • Synthetic KSRTC-style observations
        </span>
      </div>
    </section>
  );
}
