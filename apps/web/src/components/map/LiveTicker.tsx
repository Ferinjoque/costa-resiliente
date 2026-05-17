"use client";

import { useRef } from "react";
import { useSocialSignals, useAlerts } from "@/lib/queries";
import { useUIStore } from "@/store/ui";
import { clsx } from "clsx";

interface TickerItem { id: string; text: string; color: string; }

// Severity → text color on dark bg
const SEV_COLOR: Record<string, string> = {
  critical: "text-danger",
  high:     "text-danger",
  medium:   "text-warn-muted",
  low:      "text-ink-muted",
};

// Alert type → short readable tag
const TYPE_TAG: Record<string, { es: string; en: string }> = {
  flood:          { es: "INUND",  en: "FLOOD"  },
  huayco:         { es: "HUAYCO", en: "HUAYCO" },
  social_cluster: { es: "SOC",    en: "SOC"    },
};

// Social triage → tag + color
const SOCIAL_META: Record<string, { es: string; en: string; color: string }> = {
  needs_help:            { es: "AYUDA",  en: "HELP",  color: "text-danger"    },
  road_blocked:          { es: "BLOQ",   en: "ROAD",  color: "text-warn-muted" },
  infrastructure_damage: { es: "INFRA",  en: "INFRA", color: "text-warn-muted" },
  weather_observation:   { es: "METEO",  en: "METEO", color: "text-accent"     },
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

  const alertItems: TickerItem[] = alerts
    .filter((a) => a.status === "active")
    .map((a) => {
      const tagObj = TYPE_TAG[a.type];
      const tag = tagObj ? tagObj[locale] : "ALERTA";
      return {
        id: `a-${a.id}`,
        text: `[${tag}] ${a.title} · ${timeShort(a.created_at)}`,
        color: SEV_COLOR[a.severity] ?? "text-ink-muted",
      };
    });

  const socialItems: TickerItem[] = (socialData?.features ?? [])
    .filter((f) => {
      const lbl = f.properties.triage_label;
      return lbl && lbl !== "false_alarm" && lbl !== "irrelevant";
    })
    .slice(0, 8)
    .map((f) => {
      const label = f.properties.triage_label ?? "";
      const meta  = SOCIAL_META[label];
      const tag   = meta ? meta[locale] : "SEÑAL";
      const color = meta?.color ?? "text-ink-muted";
      const where = f.properties.district_name ?? "—";
      const snippet = f.properties.text
        ? ` · "${f.properties.text.slice(0, 45).trimEnd()}${f.properties.text.length > 45 ? "…" : ""}"`
        : "";
      return {
        id: `s-${f.properties.id}`,
        text: `[${tag}] ${where}${snippet} · ${timeShort(f.properties.ingested_at)}`,
        color,
      };
    });

  const items = [...alertItems, ...socialItems];
  if (items.length === 0) return null;

  const doubled = [...items, ...items];
  const label = locale === "es" ? "VIVO" : "LIVE";

  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-9 z-10 hidden sm:flex items-center overflow-hidden"
      style={{ background: "oklch(10% 0.004 240)" }}
      role="region"
      aria-live="polite"
      aria-atomic="false"
      aria-label={locale === "es" ? "Actividad en vivo" : "Live activity"}
    >
      {/* LIVE badge */}
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

      {/* Scrolling track */}
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
              <span style={{ color: "oklch(30% 0 0)" }} className="text-xs select-none" aria-hidden="true">◆</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
