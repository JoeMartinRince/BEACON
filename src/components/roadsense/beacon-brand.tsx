import { Link } from "@tanstack/react-router";

interface BeaconBrandProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  asLink?: boolean;
  subtitle?: string;
  badge?: string;
}

/**
 * Official Beacon Brand component
 * Combines the preserved lighthouse logo image asset with the bold geometric BEACON wordmark.
 * - Desktop logo: ~36px (32–40px specification)
 * - Mobile logo: ~32px (30–36px specification)
 * - Hero logo: ~56px
 */
export function BeaconBrand({
  size = "md",
  className = "",
  asLink = true,
  subtitle,
  badge,
}: BeaconBrandProps) {
  // Logo image dimensions strictly adhering to specifications
  const logoDimensions =
    size === "sm"
      ? "w-8 h-8 min-w-[32px] min-h-[32px]" // 32px (30-36px mobile)
      : size === "lg"
      ? "w-14 h-14 min-w-[56px] min-h-[56px] sm:w-16 sm:h-16 sm:min-w-[64px] sm:min-h-[64px]"
      : "w-9 h-9 min-w-[36px] min-h-[36px]"; // 36px (32-40px desktop)

  const textStyles =
    size === "sm"
      ? "text-[17px] tracking-[0.12em]"
      : size === "lg"
      ? "text-2xl sm:text-3xl tracking-[0.16em]"
      : "text-[19px] tracking-[0.14em]";

  const content = (
    <div className={`inline-flex items-center gap-2.5 sm:gap-3 select-none ${className}`}>
      {/* Official Lighthouse Logo Image Asset */}
      <img
        src="/beacon-logo.png"
        alt="Beacon Lighthouse Logo"
        width={size === "sm" ? 32 : size === "lg" ? 64 : 36}
        height={size === "sm" ? 32 : size === "lg" ? 64 : 36}
        className={`${logoDimensions} object-contain rounded-full shrink-0 shadow-xs transition-transform duration-200 group-hover:scale-105`}
        loading="eager"
        decoding="async"
      />

      {/* Modern geometric BEACON wordmark */}
      <div className="flex flex-col justify-center min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`font-black font-sans ${textStyles} text-[#172A3A] dark:text-slate-100 uppercase leading-none`}
          >
            BEACON
          </span>
          {badge && (
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#172A3A]/10 text-[#172A3A] dark:bg-sky-500/20 dark:text-sky-300">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase mt-0.5 leading-tight truncate">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );

  if (asLink) {
    return (
      <Link
        to="/"
        className="group inline-flex items-center focus:outline-hidden"
        aria-label="Beacon Home"
      >
        {content}
      </Link>
    );
  }

  return content;
}
