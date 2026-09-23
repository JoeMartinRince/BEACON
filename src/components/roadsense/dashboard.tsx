import { useMemo, Suspense, lazy } from "react";
import { Link, ClientOnly } from "@tanstack/react-router";
import {
  Activity,
  MapPinned,
  Route,
  ArrowUpRight,
  BusFront,
  Map as MapIcon,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { useRoadData, label } from "@/lib/roadsense-data";
import { useUserMode } from "@/lib/mode-context";
import { calculateNetworkCondition } from "@/lib/condition-engine";
import { MiniBars, MiniDots, MiniRange } from "./charts";

const MapView = lazy(() => import("./leaflet-map"));
const rings = Array.from({ length: 44 });

export function Dashboard() {
  const d = useRoadData();
  const { mode } = useUserMode();
  const isTraveller = mode === "TRAVELLER";

  const selected = d.summaries[23] ?? d.summaries[8] ?? d.summaries[0];
  const feature = d.segments.find(
    (s) => s.properties.segment_id === selected?.segment_id
  );
  const recent = d.events
    .filter((e) => e.segment_id === selected?.segment_id)
    .slice(0, 4);
  const passMap = new Map(d.passes.map((p) => [p.pass_id, p]));
  const avg = d.events.length
    ? d.events.reduce((a, e) => a + e.severity_0_5, 0) / d.events.length
    : 0;
  const coverage = Math.round((d.summaries.length / 160) * 100);
  const suppShare = Math.round(
    (d.suppressed.length / Math.max(1, d.events.length + d.suppressed.length)) * 100
  );

  const dynamicLastObserved = useMemo(() => {
    if (selected?.last_observed_at) {
      return new Date(selected.last_observed_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (recent[0]?.timestamp) {
      return new Date(recent[0].timestamp).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return "18 Sep 2026, 06:30";
  }, [selected, recent]);

  const net = useMemo(() => {
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

  const stats = useMemo(() => {
    if (isTraveller) {
      return [
        {
          title: "Network condition",
          value: `${net.networkScore}`,
          unit: "/ 100",
          icon: ShieldCheck,
          chart: <MiniRange />,
          trend: `${net.goodCount}G · ${net.moderateCount}M · ${net.poorCount}P`,
        },
        {
          title: "Monitored corridors",
          value: `${net.totalCorridors}`,
          unit: "segments",
          icon: MapPinned,
          chart: <MiniDots />,
          trend: `${net.totalPasses} passes · ${net.uniqueBuses} buses`,
        },
        {
          title: "Accepted hazards",
          value: `${(net.totalHazards || 4323).toLocaleString()}`,
          unit: "events",
          icon: AlertTriangle,
          chart: <MiniBars />,
          trend: "74 non-hazards filtered",
        },
      ];
    }

    return [
      {
        title: "Events detected",
        value: d.events.length,
        unit: "events",
        icon: Activity,
        chart: <MiniBars />,
        trend: "+12.4%",
      },
      {
        title: "Average severity",
        value: avg.toFixed(1),
        unit: "/ 5",
        icon: Route,
        chart: <MiniRange />,
        trend: "−0.3",
      },
      {
        title: "Segments monitored",
        value: d.summaries.length,
        unit: "of 160",
        icon: MapPinned,
        chart: <MiniDots />,
        trend: "+8.2%",
      },
    ];
  }, [isTraveller, net, d.events.length, d.summaries.length, avg]);

  return (
    <div className="dashboard-grid">
      {/* 6 & 7. Key Statistics - Responsive 2-column on mobile, prominent numbers */}
      <section className="kpi-grid">
        {stats.map((s, idx) => (
          <article
            className={`panel kpi ${idx === 2 ? "kpi-card-span" : ""}`}
            key={s.title}
          >
            <div className="kpi-copy">
              <p className="kpi-label">{s.title}</p>
              <div className="kpi-value-row">
                <span className="metric-icon" aria-hidden="true">
                  <s.icon />
                </span>
                <strong className="kpi-number">{s.value}</strong>
                <small className="kpi-unit">{s.unit}</small>
              </div>
              <em className="kpi-trend">
                <ArrowUpRight className="w-3 h-3 inline mr-0.5" />
                {s.trend}
              </em>
            </div>
            <div className="mini-chart">{s.chart}</div>
          </article>
        ))}
      </section>

      {/* 8 & 9. Segment Details - Non-colliding header, prominent ID, 2-column info */}
      <section className="panel segment-details">
        {isTraveller ? (
          <>
            <div className="card-heading flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-foreground">Corridor Condition</h3>
              {selected && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-black tracking-wide text-white ${
                    selected.condition_class === "GOOD"
                      ? "bg-emerald-600"
                      : selected.condition_class === "MODERATE"
                      ? "bg-amber-500"
                      : "bg-rose-600"
                  } shrink-0`}
                >
                  {selected.condition_class ?? "MODERATE"} · {selected.condition_score ?? 74.4}/100
                </span>
              )}
            </div>

            <h4 className="segment-id-text">{selected?.segment_id}</h4>

            <div className="detail-grid">
              <div>
                <small>Observation Confidence</small>
                <b className="text-primary font-black">
                  {Math.round((selected?.confidence ?? 0.83) * 100)}%
                </b>
              </div>
              <div>
                <small>Observed Passes</small>
                <b>{selected?.pass_count ?? selected?.n_passes ?? 60} ({selected?.unique_bus_count ?? 10} buses)</b>
              </div>
              <div>
                <small>Affected Passes</small>
                <b className={(selected?.affected_pass_count ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : ""}>
                  {selected?.affected_pass_count ?? 0} passes
                </b>
              </div>
              <div>
                <small>Hazards Breakdown</small>
                <b>
                  {selected?.pothole_count ?? 0} pot · {selected?.speed_breaker_count ?? 0} sb · {selected?.broken_patch_count ?? 0} bp
                </b>
              </div>
            </div>
            <p className="last-pass flex items-center justify-between text-[11px]">
              <span>Last observed · {dynamicLastObserved}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ Filtered {selected?.suppressed_count ?? 0} non-hazards
              </span>
            </p>
          </>
        ) : (
          <>
            <div className="card-heading flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-foreground">Segment Details</h3>
              {selected && (
                <span
                  className={`severity-pill sev-${Math.min(
                    5,
                    Math.round(selected.median_severity ?? 2)
                  )} shrink-0`}
                >
                  Severity {(selected.median_severity ?? 2).toFixed(1)}
                </span>
              )}
            </div>

            <h4 className="segment-id-text">{selected?.segment_id}</h4>

            <div className="detail-grid">
              <div>
                <small>Length</small>
                <b>{feature?.properties.length_m ?? 100} m</b>
              </div>
              <div>
                <small>Worst class</small>
                <b>{label(selected?.worst_class ?? "")}</b>
              </div>
              <div>
                <small>Confidence</small>
                <b>{Math.round((selected?.confidence ?? 0) * 100)}%</b>
              </div>
              <div>
                <small>Passes</small>
                <b>{selected?.n_passes ?? 60}</b>
              </div>
            </div>
            <p className="last-pass">Last pass · {dynamicLastObserved}</p>
          </>
        )}
      </section>

      {/* Route & Recent Passes */}
      <section className="route-stack">
        <article className="route-card">
          <div className="route-head">
            <div>
              <small>Selected corridor</small>
              <h3>
                {feature?.properties.start_chainage_m ?? 0} m <span>→</span>{" "}
                {(feature?.properties.start_chainage_m ?? 0) + 100} m
              </h3>
            </div>
            <BusFront />
          </div>
          <div className="corridor">
            <i />
            <span style={{ left: "58%" }}>
              <BusFront />
            </span>
          </div>
          <div className="route-times">
            <small>
              First pass
              <br />
              <b>07:24</b>
            </small>
            <small>
              Last pass
              <br />
              <b>14:12</b>
            </small>
          </div>
        </article>

        <article className="panel pass-card">
          <div className="card-heading">
            <h3>{selected?.segment_id}</h3>
            <small>Recent passes</small>
          </div>
          <div className="timeline">
            {recent.map((e) => (
              <div key={e.event_id}>
                <i />
                <span>
                  <b>{passMap.get(e.pass_id)?.bus_id ?? e.pass_id}</b>
                  <small>
                    {new Date(e.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {label(e.event_class)}
                  </small>
                </span>
              </div>
            ))}
          </div>
          <div className="coverage">
            <span>
              <i /> {coverage}% of segments covered
            </span>
            <b>
              <i style={{ width: `${coverage}%` }} />
            </b>
          </div>
        </article>
      </section>

      {/* Map Overview */}
      <section className="panel map-overview">
        <div className="card-heading">
          <h3>Map Overview</h3>
          <Link to="/road-map">
            View map <ArrowUpRight />
          </Link>
        </div>
        <div className="map-wrap">
          <ClientOnly fallback={<div className="map-loading">Loading corridor…</div>}>
            <Suspense fallback={<div className="map-loading">Loading corridor…</div>}>
              <MapView compact features={d.segments} summaries={d.summaries} />
            </Suspense>
          </ClientOnly>
        </div>
      </section>

      {/* Suppression */}
      <section className="panel suppression">
        <div className="card-heading">
          <h3>Suppression</h3>
          <small>Motion context</small>
        </div>
        <div className="ring-area">
          <div className="seg-ring">
            {rings.map((_, i) => (
              <i
                key={i}
                className={
                  i < Math.round((suppShare / 100) * rings.length) ? "filled" : ""
                }
                style={{
                  transform: `rotate(${i * (360 / rings.length)}deg) translateY(-62px)`,
                }}
              />
            ))}
            <div>
              <strong>{suppShare}%</strong>
              <small>suppressed</small>
            </div>
          </div>
          <div className="ring-legend">
            <span>
              <i className="hazard-dot" />
              Hazard events <b>{d.events.length}</b>
            </span>
            <span>
              <i className="supp-dot" />
              Suppressed manoeuvres <b>{d.suppressed.length}</b>
            </span>
          </div>
        </div>
      </section>

      {/* Fleet */}
      <section className="panel fleet">
        <div>
          <div className="card-heading">
            <h3>Fleet status</h3>
            <span className="live-dot">Live</span>
          </div>
          <p>Mobile sensing network</p>
          <div className="fleet-stats">
            <span>
              <b>8</b>
              <small>Active buses</small>
            </span>
            <span>
              <b>12</b>
              <small>Passes today</small>
            </span>
            <span>
              <b>36</b>
              <small>Avg km/h</small>
            </span>
          </div>
        </div>
        <div className="bus-art">
          <MapIcon />
          <BusFront />
        </div>
      </section>
    </div>
  );
}
