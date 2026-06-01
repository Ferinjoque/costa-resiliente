"use client";

import { useRef } from "react";
import { useSocialSignals, useAlerts, useImerg } from "@/lib/queries";
import { URGENT_SOCIAL_LABELS } from "@/lib/constants";
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

// Severity → SINAGERD label for ticker
const SEV_LABEL: Record<string, { es: string; en: string }> = {
  critical: { es: "EMERG", en: "EMERG" },
  high:     { es: "ALERT", en: "ALERT" },
  medium:   { es: "AVISO", en: "AVISO" },
  low:      { es: "INFO",  en: "INFO"  },
};

// Alert type → short readable tag
const TYPE_TAG: Record<string, { es: string; en: string }> = {
  flood:          { es: "INUND",  en: "FLOOD"  },
  huayco:         { es: "HUAYCO", en: "HUAYCO" },
  social_cluster: { es: "SOC",    en: "SOC"    },
  rainfall:       { es: "LLUVIA", en: "RAIN"   },
};

// Social triage → tag + color
const SOCIAL_META: Record<string, { es: string; en: string; color: string }> = {
  needs_help:            { es: "AYUDA",   en: "HELP",   color: "text-danger"    },
  road_blocked:          { es: "BLOQ",    en: "ROAD",   color: "text-warn-muted" },
  huayco_observation:    { es: "HUAYCO",  en: "HUAYCO", color: "text-danger"    },
  flood_observation:     { es: "INUND",   en: "FLOOD",  color: "text-accent"    },
  infrastructure_damage: { es: "INFRA",   en: "INFRA",  color: "text-warn-muted" },
  weather_observation:   { es: "METEO",   en: "METEO",  color: "text-accent"    },
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
  const { data: imerg } = useImerg(72);
  const trackRef = useRef<HTMLDivElement>(null);

  const alertItems: TickerItem[] = alerts
    .filter((a) => a.status === "active")
    .map((a) => {
      const tagObj = TYPE_TAG[a.type];
      const typeTag = tagObj ? tagObj[locale] : "ALERTA";
      const sevTag = (SEV_LABEL[a.severity] ?? SEV_LABEL.high)[locale];
      const titleShort = a.title.length > 50 ? a.title.slice(0, 50).trimEnd() + "…" : a.title;
      return {
        id: `a-${a.id}`,
        text: `[${sevTag}·${typeTag}] ${titleShort} · ${timeShort(a.created_at)}`,
        color: SEV_COLOR[a.severity] ?? "text-ink-muted",
      };
    });

  const socialItems: TickerItem[] = (socialData?.features ?? [])
    .filter((f) => {
      const lbl = f.properties.triage_label;
      return lbl && URGENT_SOCIAL_LABELS.has(lbl);
    })
    .slice(0, 6)
    .map((f) => {
      const label = f.properties.triage_label ?? "";
      const meta  = SOCIAL_META[label];
      const tag   = meta ? meta[locale] : "SEÑAL";
      const color = meta?.color ?? "text-ink-muted";
      const where = f.properties.district_name ?? "—";
      const snippet = f.properties.text
        ? ` · "${f.properties.text.slice(0, 40).trimEnd()}${f.properties.text.length > 40 ? "…" : ""}"`
        : "";
      return {
        id: `s-${f.properties.id}`,
        text: `[${tag}] ${where}${snippet} · ${timeShort(f.properties.ingested_at)}`,
        color,
      };
    });

  // Add rainfall warning item if above ALERTA threshold
  const rainfallItems: TickerItem[] = [];
  if (imerg) {
    const maxRain = imerg.features.reduce((mx, f) => {
      const v = f.properties.acc_72h_mm ?? 0;
      return v > mx ? v : mx;
    }, 0);
    const maxWs = imerg.features.find((f) => (f.properties.acc_72h_mm ?? 0) === maxRain)?.properties.name ?? "";
    if (maxRain >= 50) {
      rainfallItems.push({
        id: "rain-emerg",
        text: locale === "es"
          ? `[EMERG·LLUVIA] ${maxRain.toFixed(0)} mm/72h cuenca ${maxWs} — ⚠ EMERGENCIA ANA`
          : `[EMERG·RAIN] ${maxRain.toFixed(0)} mm/72h ${maxWs} watershed — ⚠ ANA EMERGENCY`,
        color: "text-danger",
      });
    } else if (maxRain >= 25) {
      rainfallItems.push({
        id: "rain-alert",
        text: locale === "es"
          ? `[ALERT·LLUVIA] ${maxRain.toFixed(0)} mm/72h cuenca ${maxWs} — ALERTA ANA`
          : `[ALERT·RAIN] ${maxRain.toFixed(0)} mm/72h ${maxWs} watershed — ANA ALERT`,
        color: "text-warn-muted",
      });
    }
  }

  const items = [...rainfallItems, ...alertItems, ...socialItems];
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
