import { Compass, Radio, Shield, Info, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { BeaconBrand } from "./beacon-brand";

/**
 * Official Beacon Landing / Hero Section
 * Highlights the core brand premise:
 * "Every participating bus becomes a moving beacon for road conditions."
 * Features subtle lighthouse ray motifs, the metaphor "See the road ahead",
 * and prominent data transparency notices.
 */
export function BeaconHero() {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-card border border-border shadow-[0_8px_30px_oklch(0.3_0.04_285/0.05)] dark:shadow-[0_8px_30px_oklch(0.05_0_0/0.25)] p-5 sm:p-7 mb-4 transition-all">
      {/* Subtle Lighthouse Ray / Signal Motif in background */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 w-[420px] h-[420px] sm:w-[540px] sm:h-[540px] opacity-[0.045] dark:opacity-[0.06] select-none text-[#172A3A] dark:text-sky-400"
        aria-hidden="true"
      >
        <svg viewBox="0 0 500 500" fill="none" className="w-full h-full">
          {/* Circular rings */}
          <circle cx="250" cy="250" r="80" stroke="currentColor" strokeWidth="2" />
          <circle cx="250" cy="250" r="140" stroke="currentColor" strokeWidth="2" strokeDasharray="6 6" />
          <circle cx="250" cy="250" r="210" stroke="currentColor" strokeWidth="1.5" />
          {/* Radiating beacon rays */}
          {Array.from({ length: 18 }).map((_, i) => {
            const angle = (i * 20 * Math.PI) / 180;
            const x1 = 250 + 60 * Math.cos(angle);
            const y1 = 250 + 60 * Math.sin(angle);
            const x2 = 250 + 240 * Math.cos(angle);
            const y2 = 250 + 240 * Math.sin(angle);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth="2"
              />
            );
          })}
        </svg>
      </div>

      <div className="relative z-10">
        {/* Top brand & metaphor badge row */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <BeaconBrand
            size="lg"
            subtitle="Road Intelligence Network"
            badge="Moving Fleet Signals"
          />

          {/* Supporting phrase pill: "See the road ahead." */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#172A3A]/5 dark:bg-sky-500/10 border border-[#172A3A]/15 dark:border-sky-500/20 text-[#172A3A] dark:text-sky-300 text-xs font-bold tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#172A3A] dark:bg-sky-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#172A3A] dark:bg-sky-500" />
            </span>
            <Compass className="w-3.5 h-3.5" />
            <span>See the road ahead.</span>
          </div>
        </div>

        {/* Primary Headline */}
        <h2 className="text-xl sm:text-2xl md:text-[28px] font-extrabold text-foreground tracking-tight leading-tight max-w-3xl">
          Every participating bus becomes a moving beacon for road conditions.
        </h2>

        {/* Supporting Text */}
        <p className="mt-2.5 text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Beacon transforms everyday journeys into a distributed road-sensing network, helping
          travellers understand road conditions through continuous observations.
        </p>

        {/* Strategic Motifs / Signal Guidance Badges */}
        <div className="mt-4 flex flex-wrap items-center gap-2 pt-1 text-[11px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 border border-border/50">
            <Radio className="w-3.5 h-3.5 text-[#172A3A] dark:text-sky-400 shrink-0" />
            <span>8 Active Buses · Distributed Network</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 border border-border/50">
            <Compass className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>160 Monitored Corridors</span>
          </span>
          <Link
            to="/road-map"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary text-[11px] font-bold transition-colors ml-auto"
          >
            <span>Explore Live Map</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Data Transparency Footer Notice */}
        <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded bg-muted/80 border border-border/40 text-foreground/80">
              <Info className="w-3 h-3 text-muted-foreground" />
              Demo data • Synthetic KSRTC-style observations
            </span>
            <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded bg-muted/80 border border-border/40 text-foreground/80">
              <Shield className="w-3 h-3 text-emerald-600" />
              Prototype road-condition estimate
            </span>
          </div>
          <span className="text-[9px] text-muted-foreground/75 italic">
            Continuous observations for prototype evaluation • Not official KSRTC data
          </span>
        </div>
      </div>
    </section>
  );
}
