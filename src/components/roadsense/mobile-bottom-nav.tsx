import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Map,
  Rows3,
  MapPin,
  ChartNoAxesCombined,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  name: string;
  to: string;
  icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { name: "Dashboard", to: "/", icon: LayoutDashboard },
  { name: "Road Map", to: "/road-map", icon: Map },
  { name: "Segments", to: "/segments", icon: Rows3 },
  { name: "Events", to: "/events", icon: MapPin },
  { name: "Trends", to: "/trends", icon: ChartNoAxesCombined },
] as const;

export function MobileBottomNav() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-card/95 backdrop-blur-md border-t border-border shadow-[0_-4px_20px_oklch(0.3_0.04_285/0.08)] dark:shadow-[0_-4px_25px_oklch(0.05_0_0/0.4)] rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ name, to, icon: Icon }) => {
          const isActive = to === "/" ? currentPath === "/" : currentPath.startsWith(to);

          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center justify-center h-full py-1 px-0.5 transition-colors group select-none ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div
                className={`flex items-center justify-center w-11 h-7 rounded-full transition-all duration-200 ${
                  isActive
                    ? "bg-primary/15 text-primary scale-105"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span
                className={`text-[10px] tracking-tight leading-none mt-1 truncate max-w-[64px] ${
                  isActive ? "font-bold text-primary" : "font-medium"
                }`}
              >
                {name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
