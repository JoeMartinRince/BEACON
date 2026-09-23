import { useMemo, useState } from "react";
import { Search, Download, ArrowUpDown, MapPin, ShieldCheck, AlertTriangle } from "lucide-react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { download, label } from "@/lib/roadsense-data";
import { Empty } from "./shared";

export function SegmentsTable({ rows }: { rows: any[] }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<"score_asc" | "score_desc" | "hazards" | "passes">("score_asc");

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        const sid = String(r.segment_id || "").toLowerCase();
        const road = String(r.road_name || "").toLowerCase();
        const search = q.toLowerCase();
        return sid.includes(search) || road.includes(search);
      })
      .sort((a, b) => {
        const scoreA = Number(a.condition_score ?? 74.4);
        const scoreB = Number(b.condition_score ?? 74.4);
        const hazA = Number(a.event_count ?? a.n_events ?? 0);
        const hazB = Number(b.event_count ?? b.n_events ?? 0);
        const passA = Number(a.pass_count ?? a.n_passes ?? 60);
        const passB = Number(b.pass_count ?? b.n_passes ?? 60);

        if (sortKey === "score_asc") return scoreA - scoreB;
        if (sortKey === "score_desc") return scoreB - scoreA;
        if (sortKey === "hazards") return hazB - hazA;
        if (sortKey === "passes") return passB - passA;
        return 0;
      });
  }, [rows, q, sortKey]);

  return (
    <div className="panel table-panel space-y-3">
      {/* Table Toolbar */}
      <div className="table-tools flex flex-wrap items-center justify-between gap-2.5">
        <div className="search-field flex items-center gap-1.5 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by segment ID (e.g. SEG_024) or road name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="text-xs h-8"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as any)}
            className="text-xs rounded-md border border-border bg-background px-2.5 py-1.5 font-medium"
          >
            <option value="score_asc">Sort: Poorest Condition First</option>
            <option value="score_desc">Sort: Best Condition First</option>
            <option value="hazards">Sort: Most Hazards</option>
            <option value="passes">Sort: Most Passes</option>
          </select>

          <Button
            variant="pill"
            size="sm"
            onClick={() => download("beacon-corridor-conditions.csv", Papa.unparse(filtered))}
            className="h-8 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {!filtered.length ? (
        <Empty />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table className="text-xs">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-bold">Corridor ID</TableHead>
                <TableHead className="font-bold">Road / Type</TableHead>
                <TableHead className="font-bold">Condition Class</TableHead>
                <TableHead className="font-bold">Score</TableHead>
                <TableHead className="font-bold">Confidence</TableHead>
                <TableHead className="font-bold">Observed Passes</TableHead>
                <TableHead className="font-bold">Affected Passes</TableHead>
                <TableHead className="font-bold">Catalogued Hazards</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const score = Number(r.condition_score ?? 74.4);
                const cls =
                  r.condition_class ||
                  (score >= 80 ? "GOOD" : score >= 50 ? "MODERATE" : "POOR");
                const conf = Math.round((Number(r.confidence ?? 0.83)) * 100);
                const passes = r.pass_count ?? r.n_passes ?? 60;
                const affPasses = r.affected_pass_count ?? 0;
                const events = r.event_count ?? r.n_events ?? 0;

                const badgeBg =
                  cls === "GOOD"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                    : cls === "MODERATE"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";

                return (
                  <TableRow key={r.segment_id} className="hover:bg-muted/30">
                    <TableCell className="font-extrabold text-foreground">
                      {r.segment_id}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{r.road_name || "NH_CORRIDOR_A"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.road_type || "HIGHWAY"} · {r.length_m || 120}m
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase ${badgeBg}`}>
                        {cls}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-foreground">{score}</span>
                      <span className="text-[10px] text-muted-foreground font-normal"> / 100</span>
                    </TableCell>
                    <TableCell>
                      <b className="text-primary">{conf}%</b>
                    </TableCell>
                    <TableCell>
                      {passes} passes ({r.unique_bus_count ?? 10} buses)
                    </TableCell>
                    <TableCell>
                      <span className={affPasses > 0 ? "font-bold text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                        {affPasses} passes
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-foreground">{events} hazards</div>
                      <div className="text-[10px] text-muted-foreground flex gap-1.5 flex-wrap">
                        {r.pothole_count ? <span>{r.pothole_count} pot</span> : null}
                        {r.speed_breaker_count ? <span>{r.speed_breaker_count} sb</span> : null}
                        {r.broken_patch_count ? <span>{r.broken_patch_count} bp</span> : null}
                        {r.roughness_count ? <span>{r.roughness_count} ro</span> : null}
                        {events === 0 && <span className="text-emerald-600">Clean</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function EventsTable({
  rows,
  onLocate,
}: {
  rows: any[];
  onLocate?: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = rows.filter((r) =>
    (r.event_class + r.segment_id).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="panel table-panel space-y-3">
      <div className="table-tools flex items-center justify-between gap-2.5">
        <div className="search-field flex items-center gap-1.5 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter event class or corridor ID (e.g. pothole, SEG_024)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="text-xs h-8"
          />
        </div>
      </div>

      {!filtered.length ? (
        <Empty />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table className="text-xs">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-bold">Time</TableHead>
                <TableHead className="font-bold">Class</TableHead>
                <TableHead className="font-bold">Severity</TableHead>
                <TableHead className="font-bold">Detector Confidence</TableHead>
                <TableHead className="font-bold">Speed</TableHead>
                <TableHead className="font-bold">Corridor ID</TableHead>
                {onLocate && <TableHead className="font-bold w-10"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 50).map((r) => (
                <TableRow key={r.event_id} className="hover:bg-muted/30">
                  <TableCell>
                    {new Date(r.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="font-semibold">{label(r.event_class)}</TableCell>
                  <TableCell>
                    <span className="font-bold">{r.severity_0_5} / 5</span>
                  </TableCell>
                  <TableCell>{Math.round(r.detector_confidence * 100)}%</TableCell>
                  <TableCell>{r.speed_kmh} km/h</TableCell>
                  <TableCell className="font-semibold text-primary">{r.segment_id}</TableCell>
                  {onLocate && (
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onLocate(r.segment_id)}
                        aria-label="Locate on map"
                        className="h-7 w-7"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
