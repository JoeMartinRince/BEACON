import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Search,
  MessageCircle,
  LayoutDashboard,
  Map,
  Rows3,
  MapPin,
  Activity,
  ChartNoAxesCombined,
  Waypoints,
  Settings,
  ChevronRight,
  Download,
  Menu,
  X,
  BusFront,
  Navigation,
  Tv,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DataProvider, useRoadData } from "@/lib/roadsense-data";
import { TripProvider } from "@/lib/trip-context";
import { ModeProvider, useUserMode } from "@/lib/mode-context";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { LiveTripStatus } from "./live-trip-status";
import { TravellerStatusBar } from "./traveller-status-bar";
import { ModeSwitcher } from "./mode-switcher";
import { MlDetectionPanel } from "./ml-detection-panel";

const nav = [
  ["Dashboard", "/", LayoutDashboard],
  ["Trips & Detection", "/trips", Navigation],
  ["Road Map", "/road-map", Map],
  ["Segments", "/segments", Rows3],
  ["Events", "/events", MapPin],
  ["Signal Viewer", "/signal-viewer", Activity],
  ["Trends & Exposure", "/trends", ChartNoAxesCombined],
  ["Method & Data", "/method", Waypoints],
  ["Settings", "/settings", Settings],
] as const;

function ShellInner({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const { events } = useRoadData();
  const { isContributor, presentationMode, togglePresentationMode } = useUserMode();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const exportReport = () => {
    const text = `RoadSense Kerala — Prototype report\nEvents detected: ${events.length}\nGenerated: ${new Date().toLocaleDateString()}\nCondition indicators are based on simulated/supplied demonstration data.`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "roadsense-report.txt";
    a.click();
  };

  return (
    <div className="min-h-screen bg-canvas p-0 lg:p-6">
      <div className="app-frame">
        <aside
          className={`sidebar ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        >
          <div className="flex items-center justify-between">
            <Link to="/" className="brand">
              <span className="brand-mark">
                <BusFront />
              </span>
              <span>
                RoadSense
                <br />
                <small>Kerala</small>
              </span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X />
            </Button>
          </div>
          <nav>
            {nav.map(([name, to, Icon]) => {
              const active = path === to;
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={`nav-item ${active ? "nav-active" : ""}`}
                >
                  <Icon />
                  <span>{name}</span>
                  {name === "Events" && <b>{events.length}</b>}
                  {active && <ChevronRight className="ml-auto" />}
                </Link>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <div className="profile">
              <span>JJ</span>
              <div>
                <strong>Joshwin James</strong>
                <small>Prototype team</small>
              </div>
            </div>
            <div className="theme-toggle">
              <button className={!dark ? "active" : ""} onClick={() => setDark(false)}>
                Light
              </button>
              <button className={dark ? "active" : ""} onClick={() => setDark(true)}>
                Dark
              </button>
            </div>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="topbar">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 lg:hidden min-h-[44px] min-w-[44px]"
                  onClick={() => setOpen(true)}
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
                <div className="min-w-0">
                  <h1 className="text-base sm:text-lg font-extrabold text-foreground truncate">
                    Welcome back, Joshwin!
                  </h1>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {isContributor
                      ? "🚌 Contributor Mode · 12 KSRTC fleet passes recorded today"
                      : "🧭 Traveller Mode · 160 monitored corridors for safe transit"}
                  </p>
                </div>
              </div>

              {/* Mode Switcher & Top Actions */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <ModeSwitcher className="w-full md:w-auto" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePresentationMode}
                  className={`h-9 px-2.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all shrink-0 ${
                    presentationMode
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background/80 hover:bg-muted text-muted-foreground border-border/60"
                  }`}
                  title="Toggle Projector Presentation Mode"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Presentation</span>
                </Button>
                <div className="top-actions hidden sm:flex">
                  <Button variant="darkIcon" size="icon" aria-label="Alerts">
                    <Bell />
                  </Button>
                  <Button variant="darkIcon" size="icon" aria-label="Search">
                    <Search />
                  </Button>
                  <Button variant="darkIcon" size="icon" aria-label="Messages">
                    <MessageCircle />
                  </Button>
                  <Button variant="pill" onClick={exportReport}>
                    <Download /> <span>Export report</span>
                  </Button>
                </div>
              </div>
            </div>
          </header>
          <main className="content">
            {isContributor ? <LiveTripStatus /> : <TravellerStatusBar />}
            {isContributor && path === "/" && <MlDetectionPanel />}
            {children}
          </main>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <DataProvider>
      <TripProvider>
        <ModeProvider>
          <ShellInner>{children}</ShellInner>
        </ModeProvider>
      </TripProvider>
    </DataProvider>
  );
}
