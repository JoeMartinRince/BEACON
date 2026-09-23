import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Map,
  ChevronRight,
  Menu,
  X,
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
import { BeaconBrand } from "./beacon-brand";

const nav = [
  ["Dashboard", "/", LayoutDashboard],
  ["Road Map", "/road-map", Map],
  ["Trip History", "/trips", Navigation],
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

  return (
    <div className="min-h-screen bg-canvas p-0 lg:p-6">
      <div className="app-frame">
        <aside
          className={`sidebar ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        >
          <div className="flex items-center justify-between">
            <BeaconBrand size="md" subtitle="Road Intelligence" />
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
                  {active && <ChevronRight className="ml-auto" />}
                </Link>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
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
          {/* Projector Presentation Mode Banner */}
          {presentationMode && (
            <div className="bg-[#172A3A] text-white px-4 py-2 border-b border-border/30 flex items-center justify-between shadow-md select-none">
              <div className="flex items-center gap-2.5">
                <img
                  src="/beacon-logo.png"
                  alt="Beacon Logo"
                  className="w-7 h-7 rounded-full shadow-xs shrink-0"
                />
                <span className="font-black tracking-[0.16em] text-sm uppercase">BEACON</span>
                <span className="text-[11px] text-slate-300 font-semibold hidden md:inline">
                  • Moving Bus Road-Condition Sensing
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/20 text-sky-200 border border-sky-400/20">
                  Presentation Mode
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={togglePresentationMode}
                  className="h-7 text-xs text-white hover:bg-white/10 hover:text-white px-2"
                >
                  Exit
                </Button>
              </div>
            </div>
          )}

          <header className="topbar">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
              {/* Left Side: Brand on mobile & desktop */}
              <div className="flex items-center justify-between md:justify-start gap-2 sm:gap-3 min-w-0 w-full md:w-auto">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Mobile Menu Toggle Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 lg:hidden min-h-[38px] min-w-[38px]"
                    onClick={() => setOpen(true)}
                    aria-label="Open navigation"
                  >
                    <Menu className="w-5 h-5" />
                  </Button>

                  {/* Mobile Header: [ Lighthouse Logo (32px) ] BEACON */}
                  <div className="lg:hidden flex items-center min-w-0">
                    <BeaconBrand size="sm" />
                  </div>
                </div>

                {/* Desktop Header: [ Lighthouse Logo (36px) ] BEACON */}
                <div className="hidden lg:flex items-center gap-3 min-w-0">
                  <BeaconBrand size="md" subtitle="Fleet Sensing" />
                  <div className="h-6 w-px bg-border/60 mx-1" />
                  <div className="min-w-0">
                    <h1 className="text-sm font-extrabold text-foreground truncate">
                      Every participating bus becomes a moving beacon for road conditions.
                    </h1>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {isContributor
                        ? "🚌 Contributor Mode · Real-time vehicle sensing active"
                        : "🧭 Traveller Mode · Corridor road condition intelligence"}
                    </p>
                  </div>
                </div>

                {/* Mobile Presentation Quick Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePresentationMode}
                  className={`md:hidden h-8 px-2 rounded-lg text-xs font-semibold border flex items-center gap-1 shrink-0 ${
                    presentationMode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background/80 text-muted-foreground border-border/60"
                  }`}
                  title="Toggle Presentation Mode"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Show</span>
                </Button>
              </div>

              {/* Mode Switcher & Presentation Action */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <ModeSwitcher className="w-full md:w-auto" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePresentationMode}
                  className={`hidden md:flex h-9 px-2.5 rounded-xl text-xs font-semibold border items-center gap-1.5 transition-all shrink-0 ${
                    presentationMode
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background/80 hover:bg-muted text-muted-foreground border-border/60"
                  }`}
                  title="Toggle Projector Presentation Mode"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Presentation</span>
                </Button>
              </div>
            </div>

            {/* Mobile Sub-Header context row */}
            <div className="lg:hidden mt-2 pt-1.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="truncate">
                {isContributor
                  ? "🚌 Contributor Mode · 12 recorded passes"
                  : "🧭 Traveller Mode · 160 corridors"}
              </span>
              <span className="font-bold text-[#172A3A] dark:text-sky-400 tracking-wide uppercase shrink-0 ml-1">
                See the road ahead
              </span>
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
