"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle, AlertTriangle, TrendingUp, Users, TrendingDown, XCircle, MoreHorizontal, MapPin, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
import { useAlerts, useFloodExposure } from "@/lib/queries";
import { actOnAlert, alertsStreamUrl } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import type { Alert } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const OPERATOR_ID = "operator-1";

const TYPE_ICON: Record<string, LucideIcon> = {
  flood: AlertTriangle,
  huayco: TrendingUp,
  social_cluster: Users,
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-blue-400",
};

const ACTION_MAP: Record<string, string> = {
  acknowledge: "acknowledged",
  escalate: "escalated",
  false_positive: "resolved",
  close: "closed",
};

function AlertRow({ alert, locale }: { alert: Alert; locale: "es" | "en" }) {
  const qc = useQueryClient();
  const { setFlyToPoint, setActivePanel } = useUIStore();
  const Icon = TYPE_ICON[alert.type] ?? Bell;
  const tr = useT(locale);
  const [menuOpen, setMenuOpen] = useState(false);

  function flyToAlert() {
    if (alert.lat == null || alert.lng == null) return;
    setFlyToPoint([alert.lng, alert.lat]);
    setActivePanel("map");
  }

  async function handleAction(action: "acknowledge" | "escalate" | "false_positive" | "close") {
    const newStatus = ACTION_MAP[action];
    // Optimistic update — works in demo mode
    qc.setQueryData(["alerts", undefined], (old: Alert[] | undefined) =>
      old ? old.map((a) => a.id === alert.id ? { ...a, status: newStatus } : a) : old
    );
    setMenuOpen(false);
    try {
      await actOnAlert(alert.id, action, OPERATOR_ID);
      qc.invalidateQueries({ queryKey: ["alerts"] });
    } catch {
      // optimistic update stands in demo mode
    }
  }

  const TYPE_LABELS: Record<string, { es: string; en: string }> = {
    flood: { es: "inundación", en: "flood" },
    huayco: { es: "huayco", en: "huayco" },
    social_cluster: { es: "señal social", en: "social signal" },
  };
  const typeLabel = TYPE_LABELS[alert.type]?.[locale] ?? alert.type.replace("_", " ");

  return (
    <li className="px-4 py-3 hover:bg-surface-panel/50 transition-colors relative">
      <div className="flex items-start gap-2">
        <span
          className={clsx(
            "mt-1 h-2 w-2 rounded-full shrink-0",
            SEVERITY_DOT[alert.severity] ?? "bg-slate-400",
            alert.severity === "critical" && "animate-pulse",
          )}
          aria-label={`Severidad: ${alert.severity}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5">
            <p className="text-sm text-white leading-snug flex-1">{alert.title}</p>
            {alert.lat != null && alert.lng != null && (
              <button
                onClick={flyToAlert}
                className="shrink-0 mt-0.5 text-slate-500 hover:text-costa-400 transition-colors"
                title={locale === "es" ? "Ver en mapa" : "Show on map"}
                aria-label={locale === "es" ? "Ver en mapa" : "Show on map"}
              >
                <MapPin size={12} />
              </button>
            )}
          </div>
          {alert.description && (
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-2">{alert.description}</p>
          )}
          <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5">
            <Icon size={11} aria-hidden="true" />
            <span className="capitalize">{typeLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{timeAgo(alert.created_at)}</span>
          </p>
        </div>

        {alert.status === "active" ? (
          <div className="shrink-0 flex items-center gap-1">
            <button
              onClick={() => handleAction("acknowledge")}
              className="text-slate-400 hover:text-green-400 transition-colors"
              aria-label={tr("alerts", "acknowledge")}
              title={locale === "es" ? "Reconocer" : "Acknowledge"}
            >
              <CheckCircle size={15} />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                aria-label="Más acciones"
                title="Más acciones"
              >
                <MoreHorizontal size={15} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-6 z-30 bg-surface-raised border border-slate-600 rounded-lg shadow-xl w-40 py-1 animate-fade-in">
                  <button
                    onClick={() => handleAction("escalate")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-orange-300 hover:bg-orange-900/30 transition-colors"
                  >
                    <TrendingUp size={12} />
                    {locale === "es" ? "Escalar" : "Escalate"}
                  </button>
                  <button
                    onClick={() => handleAction("false_positive")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-surface-panel transition-colors"
                  >
                    <TrendingDown size={12} />
                    {locale === "es" ? "Falso positivo" : "False positive"}
                  </button>
                  <button
                    onClick={() => handleAction("close")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:bg-surface-panel transition-colors"
                  >
                    <XCircle size={12} />
                    {locale === "es" ? "Cerrar" : "Close"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <span className={clsx(
            "text-[10px] shrink-0 capitalize px-1.5 py-0.5 rounded",
            alert.status === "escalated" ? "bg-orange-900/40 text-orange-300" :
            alert.status === "acknowledged" ? "bg-green-900/30 text-green-400" :
            "bg-surface-panel text-slate-400"
          )}>{alert.status === "acknowledged" ? (locale === "es" ? "Reconocido" : "Acked") :
             alert.status === "escalated" ? (locale === "es" ? "Escalado" : "Escalated") :
             alert.status === "resolved" ? (locale === "es" ? "F.Positivo" : "F.Positive") :
             alert.status}</span>
        )}
      </div>
    </li>
  );
}

export function AlertsPanel() {
  const { activePanel, locale } = useUIStore();
  const qc = useQueryClient();
  const { data: alerts = [], isLoading, isError, dataUpdatedAt } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const sseRef = useRef<EventSource | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const tr = useT(locale);

  // SSE: subscribe to live alert push
  useEffect(() => {
    if (sseRef.current) return;
    const es = new EventSource(alertsStreamUrl());
    sseRef.current = es;

    es.onopen = () => setSseConnected(true);

    es.onmessage = (evt) => {
      try {
        const fresh: Alert[] = JSON.parse(evt.data);
        qc.setQueryData(["alerts", undefined], fresh);
        // Propagate to risk-summary so map color fills update on push
        qc.invalidateQueries({ queryKey: ["district-risk-summary"] });
        qc.invalidateQueries({ queryKey: ["flood-exposure"] });
      } catch {
        // malformed SSE frame — ignore
      }
    };

    es.onerror = () => {
      setSseConnected(false);
      es.close();
      sseRef.current = null;
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [qc]);

  if (activePanel !== "alerts") return null;

  const activeCount = alerts.filter((a) => a.status === "active").length;

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[62vh] rounded-t-2xl",
        "sm:absolute sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:h-auto sm:w-80 sm:max-w-sm sm:rounded-xl",
        "bg-surface-raised border border-slate-700 shadow-xl z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={tr("alerts", "title")}
      role="complementary"
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-slate-600" />
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <Bell size={15} className="text-costa-500" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">{tr("alerts", "title")}</h2>
        {sseConnected && (
          <span className="flex items-center gap-1 text-[9px] text-green-400 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 live-dot" aria-hidden="true" />
            LIVE
          </span>
        )}
        {activeCount > 0 && (
          <span
            className="ml-auto bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full"
            aria-label={`${activeCount} ${tr("alerts", "title").toLowerCase()} activas`}
          >
            {activeCount}
          </span>
        )}
      </div>

      {/* Population exposure callout */}
      {exposure && exposure.total_affected_population > 0 && (
        <div className="mx-3 mt-2 bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2">
          <p className="text-xs text-red-300 font-medium">
            ~{exposure.total_affected_population.toLocaleString(locale === "es" ? "es-PE" : "en-US")} {tr("alerts", "personsAtRisk")}
          </p>
          <p className="text-[10px] text-red-400 mt-0.5">
            {exposure.districts.slice(0, 3).map((d) => d.district_name).join(", ")}
            {exposure.districts.length > 3 && ` +${exposure.districts.length - 3} ${locale === "es" ? "distritos" : "districts"}`}
          </p>
        </div>
      )}

      <ul className="flex-1 overflow-y-auto divide-y divide-slate-700/50" role="list" aria-label={tr("alerts", "title")}>
        {isLoading && (
          <li className="px-4 py-8 text-xs text-slate-400 text-center" aria-live="polite">{tr("alerts", "loading")}</li>
        )}
        {isError && (
          <li className="px-4 py-8 text-xs text-red-400 text-center" role="alert">{tr("alerts", "error")}</li>
        )}
        {!isLoading && !isError && alerts.length === 0 && (
          <li className="px-4 py-8 text-xs text-slate-400 text-center">
            {tr("alerts", "noAlerts")}
          </li>
        )}
        {alerts.map((alert) => (
          <AlertRow key={alert.id} alert={alert} locale={locale} />
        ))}
      </ul>

      <div className="px-4 py-2 border-t border-slate-700 text-xs text-slate-400 text-center">
        {dataUpdatedAt
          ? `${tr("alerts", "updated")} ${timeAgo(new Date(dataUpdatedAt).toISOString())}`
          : tr("alerts", "liveSSE")}
      </div>
    </aside>
  );
}
