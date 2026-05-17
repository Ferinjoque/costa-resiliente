"use client";

import { useEffect, useRef, useState } from "react";
import { useSocialSignals, useAlerts } from "@/lib/queries";
import { useUIStore } from "@/store/ui";
import { clsx } from "clsx";

interface TickerItem { id: string; text: string; color: string; }

const LABEL_COLOR: Record<string, string> = {
  needs_help:            "text-danger",
  road_blocked:          "text-warn-muted",
  infrastructure_damage: "text-warn-muted",
  weather_observation:   "text-accent",
};
const SEV_COLOR: Record<string, string> = {
  critical: "text-danger",
  high:     "text-danger",
  medium:   "text-warn-muted",
  low:      "text-ink-muted",
};
const TYPE_TAG: Record<string, string> = {
  flood: "SAR", huayco: "HUA", social_cluster: "SOC",
};

function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima",
  });
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
        text: `[${TYPE_TAG[a.type] ?? "ALT"}] ${a.title} · ${timeShort(a.created_at)}`,
        color: SEV_COLOR[a.severity] ?? "text-ink-muted",
      }));

    const socialItems: TickerItem[] = (socialData?.features ?? [])
      .filter((f) => f.properties.triage_label === "needs_help" || f.properties.triage_label === "road_blocked")
      .slice(0, 8)
      .map((f) => {
        const label = f.properties.triage_label ?? "";
        const tag = label === "needs_help" ? "[SOS]" : "[BLK]";
        return {
          id: `s-${f.properties.id}`,
          text: `${tag} ${f.properties.source ?? "?"} · ${f.properties.district_name ?? "—"} · ${timeShort(f.properties.ingested_at)}`,
          color: LABEL_COLOR[label] ?? "text-ink-muted",
        };
      });

    setItems([...alertItems, ...socialItems]);
  }, [alerts, socialData]);

  if (items.length === 0) return null;

  const doubled = [...items, ...items];
  const label = locale === "es" ? "VIVO" : "LIVE";

  return (
    // Solid surface at bottom of map — no glass, no blur
    <div
      className="absolute bottom-0 left-0 right-0 h-9 z-10 hidden sm:flex items-center overflow-hidden"
      style={{ background: "oklch(10% 0.004 240)" }}
      role="region"
      aria-live="polite"
      aria-atomic="false"
      aria-label={locale === "es" ? "Actividad en vivo" : "Live activity"}
    >
      {/* LIVE anchor — solid dark chip */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 h-full border-r"
        style={{ borderColor: "oklch(22% 0.007 240)" }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-danger live-dot shrink-0" aria-hidden="true" />
        <span
          className="text-2xs font-bold tracking-widest uppercase"
          style={{ color: "oklch(58% 0.20 28)" }}
        >
          {label}
        </span>
      </div>
      {/* Scrolling track — high contrast text on very dark bg */}
      <div className="flex-1 overflow-hidden h-full flex items-center">
        <div ref={trackRef} className="ticker-track flex items-center whitespace-nowrap">
          {doubled.map((item, i) => (
            <span key={`${item.id}-${i}`} className="inline-flex items-center gap-2 pr-10">
              <span
                className={clsx("text-xs font-mono tabular-nums", item.color)}
                style={item.color === "text-ink-muted" ? { color: "oklch(72% 0 0)" } : undefined}
              >
                {item.text}
              </span>
              <span style={{ color: "oklch(35% 0 0)" }} className="text-xs" aria-hidden="true">·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
