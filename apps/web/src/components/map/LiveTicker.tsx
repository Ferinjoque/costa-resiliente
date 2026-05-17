"use client";

import { useEffect, useRef, useState } from "react";
import { useSocialSignals, useAlerts } from "@/lib/queries";
import { useUIStore } from "@/store/ui";
import { clsx } from "clsx";

interface TickerItem {
  id: string;
  text: string;
  color: string;
}

const LABEL_COLOR: Record<string, string> = {
  needs_help:            "text-red-400",
  road_blocked:          "text-yellow-400",
  infrastructure_damage: "text-orange-400",
  weather_observation:   "text-blue-400",
};

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-yellow-400",
  low:      "text-blue-400",
};

// Compact ASCII tags replace inline emoji. Emoji rendering varies wildly by
// OS/browser and reads as AI-template chrome — these short SINAGERD-style
// labels are deterministic and scan as operational logging.
const TYPE_ICON: Record<string, string> = {
  flood:          "[SAR]",
  huayco:         "[HUA]",
  social_cluster: "[SOC]",
};

function timeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
}

export function LiveTicker() {
  const { locale } = useUIStore();
  const { data: socialData } = useSocialSignals(48);
  const { data: alerts = [] } = useAlerts();
  const trackRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    const alertItems: TickerItem[] = alerts
      .filter((a) => a.status === "active")
      .map((a) => ({
        id: `a-${a.id}`,
        text: `${TYPE_ICON[a.type] ?? "[ALT]"} ${a.title} · ${timeShort(a.created_at)}`,
        color: SEV_COLOR[a.severity] ?? "text-slate-300",
      }));

    const socialItems: TickerItem[] = (socialData?.features ?? [])
      .filter((f) => f.properties.triage_label === "needs_help" || f.properties.triage_label === "road_blocked")
      .slice(0, 8)
      .map((f) => {
        const src = f.properties.source ?? "?";
        const district = f.properties.district_name ?? "—";
        const label = f.properties.triage_label ?? "";
        const tag = label === "needs_help" ? "[SOS]" : "[BLK]";
        return {
          id: `s-${f.properties.id}`,
          text: `${tag} ${src} · ${district} · ${timeShort(f.properties.ingested_at)}`,
          color: LABEL_COLOR[label] ?? "text-slate-300",
        };
      });

    const combined = [...alertItems, ...socialItems];
    setItems(combined);
  }, [alerts, socialData]);

  // Don't render when no items or on mobile (would overlay bottom nav in an ugly way)
  if (items.length === 0) return null;

  // Duplicate so the CSS loop animation looks seamless
  const doubled = [...items, ...items];

  const label = locale === "es" ? "VIVO" : "LIVE";

  return (
    <div
      className={[
        "absolute bottom-0 left-0 right-0 h-7 z-10",
        "hidden sm:flex items-center",
        "bg-surface-base/85 backdrop-blur-sm border-t border-slate-700/70",
        "overflow-hidden",
      ].join(" ")}
      role="region"
      aria-live="polite"
      aria-atomic="false"
      aria-label={locale === "es" ? "Actividad en vivo" : "Live activity"}
    >
      {/* LIVE label — static left anchor */}
      <div className="shrink-0 flex items-center gap-1.5 pl-3 pr-2 border-r border-slate-700/70 h-full bg-surface-base/90">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
        <span className="text-[10px] font-bold tracking-wider text-red-400">{label}</span>
      </div>

      {/* Scrolling track */}
      <div className="flex-1 overflow-hidden relative h-full flex items-center">
        <div ref={trackRef} className="ticker-track flex items-center gap-0 whitespace-nowrap">
          {doubled.map((item, i) => (
            <span key={`${item.id}-${i}`} className="inline-flex items-center gap-1 pr-8">
              <span className={clsx("text-[11px] font-mono", item.color)}>{item.text}</span>
              <span className="text-slate-600 text-[10px]" aria-hidden="true">·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
