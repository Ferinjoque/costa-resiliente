"use client";

import { AlertTriangle, Waves, Users, ChevronRight } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAlerts, useFloodExposure, useDistrictRiskSummary } from "@/lib/queries";
import { Button, Pill, Divider } from "@/components/ui/primitives";

const LEVEL_CFG = {
  EMERGENCIA: {
    pill: "danger" as const,
    label: { es: "EMERGENCIA", en: "EMERGENCY" },
  },
  ALERTA: {
    pill: "warn" as const,
    label: { es: "ALERTA", en: "ALERT" },
  },
  AVISO: {
    pill: "warn" as const,
    label: { es: "AVISO", en: "NOTICE" },
  },
  NORMAL: {
    pill: "ok" as const,
    label: { es: "NORMAL", en: "NORMAL" },
  },
};

type Level = keyof typeof LEVEL_CFG;

export function SituationBrief() {
  const { activePanel, setActivePanel, scenario, locale } = useUIStore();
  const { data: alerts = [] } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const { data: summary } = useDistrictRiskSummary();

  if (activePanel !== "map" || scenario.districtUbigeo) return null;

  const active = alerts.filter((a) => a.status === "active");
  const critical = active.filter((a) => a.severity === "critical").length;
  const high = active.filter((a) => a.severity === "high").length;

  const level: Level =
    critical > 0 ? "EMERGENCIA"
    : high > 1 || active.length > 4 ? "ALERTA"
    : active.length > 0 ? "AVISO"
    : "NORMAL";

  const cfg = LEVEL_CFG[level];

  const floodKm2 = exposure?.districts.reduce((s, d) => s + d.overlap_km2, 0) ?? 0;
  const affectedPop = exposure?.total_affected_population ?? 0;

  const topDistrict = summary?.features
    .filter((f) => f.properties.risk_level !== "bajo")
    .sort((a, b) => {
      const o: Record<string, number> = { muy_alto: 3, alto: 2, moderado: 1, bajo: 0 };
      return o[b.properties.risk_level] - o[a.properties.risk_level];
    })[0];

  const bullets: { icon: React.ReactNode; text: string }[] = [];

  if (active.length > 0) {
    bullets.push({
      icon: <AlertTriangle size={10} className="text-danger shrink-0 mt-px" />,
      text:
        locale === "es"
          ? `${active.length} alerta${active.length !== 1 ? "s" : ""} activa${active.length !== 1 ? "s" : ""}${critical > 0 ? ` · ${critical} crítica${critical !== 1 ? "s" : ""}` : ""}`
          : `${active.length} active alert${active.length !== 1 ? "s" : ""}${critical > 0 ? ` · ${critical} critical` : ""}`,
    });
  }

  if (floodKm2 > 0) {
    bullets.push({
      icon: <Waves size={10} className="text-accent shrink-0 mt-px" />,
      text:
        locale === "es"
          ? `${floodKm2.toFixed(1)} km² inundados (SAR Sentinel-1)`
          : `${floodKm2.toFixed(1)} km² flooded (SAR Sentinel-1)`,
    });
  }

  if (affectedPop > 0) {
    bullets.push({
      icon: <Users size={10} className="text-ink-subtle shrink-0 mt-px" />,
      text:
        locale === "es"
          ? `~${affectedPop >= 1000 ? `${(affectedPop / 1000).toFixed(0)}k` : affectedPop} personas en zona de riesgo`
          : `~${affectedPop >= 1000 ? `${(affectedPop / 1000).toFixed(0)}k` : affectedPop} people in risk zones`,
    });
  }

  return (
    <aside
      className="absolute bottom-20 right-3 left-3 z-10 sm:hidden bg-surface border border-border-strong rounded-2xl shadow-panel overflow-hidden panel-animate"
      role="status"
      aria-label={locale === "es" ? "Resumen de situación" : "Situation brief"}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
          {locale === "es" ? "Situación" : "Situation"}
        </span>
        <Pill variant={cfg.pill}>
          {cfg.label[locale]}
        </Pill>
      </div>

      {/* Bullets */}
      {bullets.length > 0 ? (
        <ul className="px-4 py-3 space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              {b.icon}
              <span className="text-sm text-ink-muted leading-snug">{b.text}</span>
            </li>
          ))}
          {topDistrict && (
            <li className="text-xs text-ink-muted pt-1">
              {locale === "es" ? "Prioridad 1" : "Priority 1"} ·{" "}
              <span className="font-medium text-ink">{topDistrict.properties.name}</span>
            </li>
          )}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-ink-muted">
          {locale === "es" ? "Sin alertas activas." : "No active alerts."}
        </p>
      )}

      {/* Actions row */}
      <div className="flex items-center border-t border-border">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setActivePanel("alerts")}
          aria-label={locale === "es" ? "Ver panel de alertas" : "Open alerts panel"}
          className="flex-1 justify-center py-2.5 rounded-none"
        >
          {locale === "es" ? "Alertas" : "Alerts"}
          <ChevronRight size={11} className="opacity-50" />
        </Button>
        <Divider className="h-5 w-px self-center mx-0" />
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setActivePanel("ask")}
          aria-label={locale === "es" ? "Abrir copiloto" : "Open copilot"}
          className="flex-1 justify-center py-2.5 rounded-none"
        >
          {locale === "es" ? "Copiloto" : "Copilot"}
          <ChevronRight size={11} className="opacity-50" />
        </Button>
      </div>
    </aside>
  );
}
