"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle, AlertTriangle, TrendingUp, Users, TrendingDown, XCircle, MoreHorizontal, MapPin, Send, X, type LucideIcon } from "lucide-react";
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

// ─── Escalation confirmation modal ───────────────────────────────────────────

function EscalationModal({
  alert,
  locale,
  onConfirm,
  onCancel,
}: {
  alert: Alert;
  locale: "es" | "en";
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const SEVERITY_SINAGERD: Record<string, string> = {
    critical: "EMERGENCIA", high: "ALERTA", medium: "AVISO", low: "AVISO",
  };
  const sinagerdLevel = SEVERITY_SINAGERD[alert.severity] ?? "ALERTA";
  const sinagerdColor = sinagerdLevel === "EMERGENCIA"
    ? "text-red-300 bg-red-900/30 border-red-600/50"
    : "text-orange-300 bg-orange-900/30 border-orange-600/50";

  const TYPE_ES: Record<string, string> = {
    flood: "Inundación SAR", huayco: "Huayco / Deslizamiento", social_cluster: "Señal social urgente",
  };
  const TYPE_EN: Record<string, string> = {
    flood: "SAR Flood", huayco: "Huayco / Landslide", social_cluster: "Urgent social signal",
  };
  const typeLabel = (locale === "es" ? TYPE_ES : TYPE_EN)[alert.type] ?? alert.type;

  const defaultNote = locale === "es"
    ? `Nivel SINAGERD: ${sinagerdLevel}\nEvento: ${alert.title}\nTipo: ${typeLabel}\nAcción requerida: Activar protocolo de evacuación preventiva y coordinar con INDECI COEN.\n\nNotas adicionales:`
    : `SINAGERD Level: ${sinagerdLevel}\nEvent: ${alert.title}\nType: ${typeLabel}\nRequired action: Activate preventive evacuation protocol and coordinate with INDECI COEN.\n\nAdditional notes:`;

  const [note, setNote] = useState(defaultNote);

  const title = locale === "es" ? "Confirmar escalada" : "Confirm escalation";
  const subtitle = locale === "es"
    ? "Este evento será escalado al COEN/INDECI. El registro quedará en el log de decisiones."
    : "This event will be escalated to COEN/INDECI. The record will be saved to the decision log.";
  const confirmLabel = locale === "es" ? "Escalar ahora" : "Escalate now";
  const cancelLabel = locale === "es" ? "Cancelar" : "Cancel";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full sm:max-w-md bg-surface-raised border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-slate-700">
          <TrendingUp size={15} className="text-orange-400 shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors" aria-label={cancelLabel}>
            <X size={15} />
          </button>
        </div>

        {/* Alert context */}
        <div className="px-5 pt-3 pb-2">
          <div className={clsx("flex items-center gap-2 rounded-lg border px-3 py-2 mb-3", sinagerdColor)}>
            <span className="text-[10px] font-bold uppercase tracking-widest">{sinagerdLevel}</span>
            <span className="text-[10px] opacity-60">·</span>
            <span className="text-[11px] truncate">{alert.title}</span>
          </div>

          {/* Editable escalation report */}
          <label className="block text-[10px] text-slate-400 mb-1 uppercase tracking-wide">
            {locale === "es" ? "Reporte de escalada (editable)" : "Escalation report (editable)"}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={6}
            className="w-full bg-surface-panel border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-orange-500/60"
            aria-label={locale === "es" ? "Notas de escalada" : "Escalation notes"}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 pb-4">
          <button
            onClick={onCancel}
            className="flex-1 text-xs text-slate-400 border border-slate-600 hover:border-slate-500 rounded-lg py-2 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm(note)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-orange-700 hover:bg-orange-600 text-white rounded-lg py-2 transition-colors font-medium"
          >
            <Send size={12} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertRow({ alert, locale }: { alert: Alert; locale: "es" | "en" }) {
  const qc = useQueryClient();
  const { setFlyToPoint, setActivePanel } = useUIStore();
  const Icon = TYPE_ICON[alert.type] ?? Bell;
  const tr = useT(locale);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEscalation, setShowEscalation] = useState(false);

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
                    onClick={() => { setMenuOpen(false); setShowEscalation(true); }}
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
      {showEscalation && (
        <EscalationModal
          alert={alert}
          locale={locale}
          onConfirm={async (note) => {
            setShowEscalation(false);
            await handleAction("escalate");
            void note;
          }}
          onCancel={() => setShowEscalation(false)}
        />
      )}
    </li>
  );
}

function AiRecommendation({ alerts, locale }: { alerts: Alert[]; locale: "es" | "en" }) {
  const active = alerts.filter((a) => a.status === "active");
  const critical = active.filter((a) => a.severity === "critical");
  const high = active.filter((a) => a.severity === "high");

  if (critical.length === 0 && high.length < 2) return null;

  const firstCritical = critical[0];
  const isHuayco = firstCritical?.type === "huayco" || active.some((a) => a.type === "huayco");

  let rec: string;
  if (locale === "es") {
    if (critical.length > 0 && isHuayco) {
      rec = `Evacuación preventiva inmediata — Quebrada Jicamarca. Probabilidad huayco 91%, umbral 42 mm superado. Desplegar USAR Equipo Alfa al punto de reunión por Av. Las Torres antes de las 15:00. Notificar INDECI COEN.`;
    } else if (critical.length > 0) {
      rec = `Alerta crítica activa en ${firstCritical.title}. Activar protocolo DELTA COEN. Preposicionar botes en Chosica y Carabayllo norte. Confirmar capacidad de albergues.`;
    } else {
      rec = `Riesgo compuesto ALTO en ${high.length} distritos. Pre-alertar personal INDECI en Lurigancho, Ate y Carabayllo. Monitorear estaciones Chosica y Carabayllo cada 15 min.`;
    }
  } else {
    if (critical.length > 0 && isHuayco) {
      rec = `Immediate preventive evacuation — Quebrada Jicamarca. Huayco probability 91%, threshold exceeded. Deploy USAR Team Alpha to assembly point via Av. Las Torres before 15:00. Notify INDECI COEN.`;
    } else if (critical.length > 0) {
      rec = `Critical alert active at ${firstCritical.title}. Activate COEN protocol DELTA. Pre-position boats in Chosica and Carabayllo norte. Confirm shelter capacity.`;
    } else {
      rec = `HIGH composite risk across ${high.length} districts. Pre-alert INDECI personnel in Lurigancho, Ate, Carabayllo. Monitor Chosica and Carabayllo stations every 15 min.`;
    }
  }

  return (
    <div className="mx-3 mt-2 rounded-lg border border-costa-700/60 bg-costa-900/25 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] font-bold text-costa-400 tracking-wide">✦ AI</span>
        <span className="text-[10px] text-costa-300 font-medium">
          {locale === "es" ? "Recomendación operacional" : "Operational recommendation"}
        </span>
      </div>
      <p className="text-[11px] text-slate-200 leading-snug">{rec}</p>
    </div>
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

      {/* AI recommendation — shown when critical or multiple high alerts */}
      <AiRecommendation alerts={alerts} locale={locale} />

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
