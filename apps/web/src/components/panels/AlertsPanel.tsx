"use client";

import { useState } from "react";
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Users,
  TrendingDown,
  XCircle,
  MapPin,
  Send,
  X,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
import { useAlerts, useFloodExposure } from "@/lib/queries";
import { actOnAlert } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import type { Alert, DecisionLogEntry } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import {
  Panel,
  PanelHeader,
  PanelTitle,
  SectionLabel,
  Button,
  Badge,
  Divider,
  EmptyState,
} from "@/components/ui/primitives";

const OPERATOR_ID = "operator-1";

const TYPE_ICON: Record<string, LucideIcon> = {
  flood: AlertTriangle,
  huayco: TrendingUp,
  social_cluster: Users,
};

// Severity accent bar color — left edge of each row.
const SEVERITY_BAR: Record<string, string> = {
  critical: "bg-danger",
  high:     "bg-danger",
  medium:   "bg-warn",
  low:      "bg-ok-soft",
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
  const sinagerdColor =
    sinagerdLevel === "EMERGENCIA"
      ? "text-danger bg-danger-soft border-danger/30"
      : "text-warn-muted bg-warn-soft border-warn/30";

  const TYPE_ES: Record<string, string> = {
    flood: "Inundación SAR", huayco: "Huayco / Deslizamiento", social_cluster: "Señal social urgente",
  };
  const TYPE_EN: Record<string, string> = {
    flood: "SAR Flood", huayco: "Huayco / Landslide", social_cluster: "Urgent social signal",
  };
  const typeLabel = (locale === "es" ? TYPE_ES : TYPE_EN)[alert.type] ?? alert.type;

  const defaultNote =
    locale === "es"
      ? `Nivel SINAGERD: ${sinagerdLevel}\nEvento: ${alert.title}\nTipo: ${typeLabel}\nAcción requerida: Activar protocolo de evacuación preventiva y coordinar con INDECI COEN.\n\nNotas adicionales:`
      : `SINAGERD Level: ${sinagerdLevel}\nEvent: ${alert.title}\nType: ${typeLabel}\nRequired action: Activate preventive evacuation protocol and coordinate with INDECI COEN.\n\nAdditional notes:`;

  const [note, setNote] = useState(defaultNote);

  const title   = locale === "es" ? "Confirmar escalada" : "Confirm escalation";
  const subtitle =
    locale === "es"
      ? "Este evento será escalado al COEN/INDECI. El registro quedará en el log de decisiones."
      : "This event will be escalated to COEN/INDECI. The record will be saved to the decision log.";
  const confirmLabel = locale === "es" ? "Escalar ahora" : "Escalate now";
  const cancelLabel  = locale === "es" ? "Cancelar" : "Cancel";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Modal chrome — cream surface, no backdrop-blur */}
      <div className="relative w-full sm:max-w-md bg-surface border border-border-strong rounded-t-2xl sm:rounded-2xl shadow-panel flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-border">
          <TrendingUp size={15} className="text-warn-muted shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">{title}</p>
            <p className="text-xs text-ink-subtle mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onCancel}
            className="text-ink-subtle hover:text-ink transition-colors"
            aria-label={cancelLabel}
          >
            <X size={15} />
          </button>
        </div>

        {/* Alert context */}
        <div className="px-5 pt-3 pb-2">
          <div className={clsx("flex items-center gap-2 rounded-xl border px-3 py-2 mb-3", sinagerdColor)}>
            <span className="text-[10px] font-bold uppercase tracking-widest">{sinagerdLevel}</span>
            <span className="text-[10px] opacity-50" aria-hidden="true">·</span>
            <span className="text-xs truncate">{alert.title}</span>
          </div>

          {/* Editable escalation report */}
          <label className="block text-xs text-ink-subtle mb-1 font-semibold uppercase tracking-caps">
            {locale === "es" ? "Reporte de escalada (editable)" : "Escalation report (editable)"}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={6}
            className="w-full bg-surface border border-border-strong rounded-xl px-3 py-2 text-xs text-ink font-mono resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 placeholder:text-ink-subtle"
            aria-label={locale === "es" ? "Notas de escalada" : "Escalation notes"}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 pb-4">
          <Button variant="ghost" size="sm" onClick={onCancel} className="flex-1 justify-center">
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onConfirm(note)}
            className="flex-1 justify-center"
          >
            <Send size={12} aria-hidden="true" />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── AlertRow ─────────────────────────────────────────────────────────────────

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

  async function handleAction(
    action: "acknowledge" | "escalate" | "false_positive" | "close",
  ) {
    const newStatus = ACTION_MAP[action];
    // Optimistic update — works in demo mode
    qc.setQueryData(["alerts", undefined], (old: Alert[] | undefined) =>
      old ? old.map((a) => (a.id === alert.id ? { ...a, status: newStatus } : a)) : old,
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
    flood:          { es: "inundación",   en: "flood" },
    huayco:         { es: "huayco",       en: "huayco" },
    social_cluster: { es: "señal social", en: "social signal" },
  };
  const typeLabel = TYPE_LABELS[alert.type]?.[locale] ?? alert.type.replace("_", " ");

  // Status pill variant for non-active rows
  const statusPillVariant =
    alert.status === "escalated"    ? "danger" :
    alert.status === "acknowledged" ? "ok"     :
    alert.status === "resolved"     ? "warn"   : "default";

  const statusLabel =
    alert.status === "acknowledged" ? (locale === "es" ? "Reconocido" : "Acknowledged") :
    alert.status === "escalated"    ? (locale === "es" ? "Escalado" : "Escalated") :
    alert.status === "resolved"     ? (locale === "es" ? "Falso positivo" : "False positive") :
    alert.status;

  return (
    <li className="hover:bg-surface-hover transition-colors relative group">
      <div className="flex items-stretch gap-0">
        {/* Left severity accent bar */}
        <span
          className={clsx(
            "w-[2px] shrink-0 self-stretch my-3 ml-4 rounded-full",
            SEVERITY_BAR[alert.severity] ?? "bg-border",
          )}
          aria-label={`Severidad: ${alert.severity}`}
        />

        <div className="flex-1 min-w-0 px-4 py-3">
          {/* Meta line */}
          <div className="flex items-center gap-1.5 mb-1">
            <Icon size={10} className="text-ink-subtle shrink-0" aria-hidden="true" />
            <span className="text-xs text-ink-subtle font-medium">{typeLabel}</span>
            <span className="text-ink-subtle text-xs" aria-hidden="true">·</span>
            <span className="text-xs text-ink-subtle tabular-nums">{timeAgo(alert.created_at)}</span>
          </div>

          {/* Title */}
          <p className="text-sm font-semibold text-ink leading-snug">
            {alert.title}
          </p>

          {alert.description && (
            <p className="text-xs text-ink-muted mt-1 leading-snug line-clamp-2">
              {alert.description}
            </p>
          )}

          {/* Action strip for active alerts */}
          {alert.status === "active" ? (
            <div className="flex items-center gap-1 mt-2.5 flex-wrap">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleAction("acknowledge")}
                aria-label={tr("alerts", "acknowledge")}
              >
                {locale === "es" ? "Reconocer" : "Acknowledge"}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowEscalation(true)}
                className="text-danger hover:text-danger hover:bg-danger-soft"
              >
                {locale === "es" ? "Escalar" : "Escalate"}
              </Button>
              {alert.lat != null && alert.lng != null && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={flyToAlert}
                  title={locale === "es" ? "Ver en mapa" : "Show on map"}
                  aria-label={locale === "es" ? "Ver en mapa" : "Show on map"}
                >
                  <MapPin size={11} aria-hidden="true" />
                  {locale === "es" ? "Ver en mapa" : "Map"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setMenuOpen((o) => !o)}
                className="ml-auto"
                aria-label={locale === "es" ? "Más acciones" : "More actions"}
              >
                {locale === "es" ? "Más" : "More"}
              </Button>

              {menuOpen && (
                <div className="absolute right-4 top-auto mt-1 z-30 bg-surface border border-border-strong rounded-xl shadow-panel w-48 py-1.5 animate-fade-in">
                  <button
                    onClick={() => handleAction("false_positive")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors text-left"
                  >
                    <TrendingDown size={12} aria-hidden="true" />
                    {locale === "es" ? "Falso positivo" : "False positive"}
                  </button>
                  <button
                    onClick={() => handleAction("close")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors text-left"
                  >
                    <XCircle size={12} aria-hidden="true" />
                    {locale === "es" ? "Cerrar" : "Close"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Status badge for non-active rows */
            <span
              className={clsx(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-2",
                statusPillVariant === "danger"  ? "bg-danger-soft text-danger" :
                statusPillVariant === "ok"      ? "bg-ok-soft text-ok-muted" :
                statusPillVariant === "warn"    ? "bg-warn-soft text-warn-muted" :
                "bg-surface-sunken text-ink-muted",
              )}
            >
              {statusLabel}
            </span>
          )}
        </div>
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

// ─── AiRecommendation ─────────────────────────────────────────────────────────

function AiRecommendation({
  alerts,
  locale,
}: {
  alerts: Alert[];
  locale: "es" | "en";
}) {
  const active   = alerts.filter((a) => a.status === "active");
  const critical = active.filter((a) => a.severity === "critical");
  const high     = active.filter((a) => a.severity === "high");

  if (critical.length === 0 && high.length < 2) return null;

  const firstCritical = critical[0];
  const isHuayco =
    firstCritical?.type === "huayco" || active.some((a) => a.type === "huayco");

  let rec: string;
  if (locale === "es") {
    if (critical.length > 0 && isHuayco) {
      rec = `Evacuación preventiva inmediata — Quebrada Jicamarca. Probabilidad huayco 91%, umbral 42 mm superado. Desplegar USAR Equipo Alfa al punto de reunión por Av. Las Torres antes de las 15:00. Notificar INDECI COEN.`;
    } else if (critical.length > 0) {
      rec = `Alerta crítica activa en ${firstCritical!.title}. Activar protocolo DELTA COEN. Preposicionar botes en Chosica y Carabayllo norte. Confirmar capacidad de albergues.`;
    } else {
      rec = `Riesgo compuesto ALTO en ${high.length} distritos. Pre-alertar personal INDECI en Lurigancho, Ate y Carabayllo. Monitorear estaciones Chosica y Carabayllo cada 15 min.`;
    }
  } else {
    if (critical.length > 0 && isHuayco) {
      rec = `Immediate preventive evacuation — Quebrada Jicamarca. Huayco probability 91%, threshold exceeded. Deploy USAR Team Alpha to assembly point via Av. Las Torres before 15:00. Notify INDECI COEN.`;
    } else if (critical.length > 0) {
      rec = `Critical alert active at ${firstCritical!.title}. Activate COEN protocol DELTA. Pre-position boats in Chosica and Carabayllo norte. Confirm shelter capacity.`;
    } else {
      rec = `HIGH composite risk across ${high.length} districts. Pre-alert INDECI personnel in Lurigancho, Ate, Carabayllo. Monitor Chosica and Carabayllo stations every 15 min.`;
    }
  }

  return (
    <div className="bg-accent-soft border border-accent/20 rounded-xl mx-4 my-3 px-4 py-3">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-xs font-bold text-accent uppercase tracking-caps">IA</span>
        <span className="text-xs text-ink-subtle">
          {locale === "es" ? "Recomendación" : "Recommendation"}
        </span>
      </div>
      <p className="text-sm text-ink leading-snug">{rec}</p>
    </div>
  );
}

// ─── Monotonic action id generator ───────────────────────────────────────────
// HMR-safe because no value lives across reloads except `_lastTs`,
// which self-recovers on next call.
let _lastTs = 0;
function nextActionId(): number {
  const now = Date.now();
  const id  = now <= _lastTs ? _lastTs + 1 : now;
  _lastTs   = id;
  return id;
}

// ─── QuickDispatch ────────────────────────────────────────────────────────────

function QuickDispatch({
  alerts,
  locale,
}: {
  alerts: Alert[];
  locale: "es" | "en";
}) {
  const qc = useQueryClient();
  const [dispatched, setDispatched] = useState<Set<string>>(new Set());
  const active   = alerts.filter((a) => a.status === "active");
  const critical = active.filter((a) => a.severity === "critical");

  if (critical.length === 0) return null;

  const resources = [
    { id: "bote", es: "Bote Rescate", en: "Rescue Boat"  },
    { id: "usar", es: "USAR Alfa",    en: "USAR Alpha"   },
    { id: "amb",  es: "Ambulancia",   en: "Ambulance"    },
    { id: "bomb", es: "Bomberos",     en: "Fire Brigade" },
  ];

  function dispatch(id: string, label: string) {
    if (dispatched.has(id)) return;
    setDispatched((s) => new Set([...s, id]));
    qc.setQueryData<DecisionLogEntry[]>(["decision-log", 100], (old) => {
      if (!old) return old;
      return [
        {
          id: nextActionId(),
          logged_at: new Date().toISOString(),
          operator_id: "operator-1",
          action_type: "resource_dispatch",
          alert_id: critical[0]?.id ?? null,
          payload: { resource: id, resource_name: label },
          session_id: "demo",
        },
        ...old,
      ].slice(0, 100);
    });
  }

  return (
    <div className="px-4 py-3 border-b border-border">
      <SectionLabel className="mb-2.5">
        {locale === "es" ? "Despacho rápido" : "Quick dispatch"}
      </SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        {resources.map((r) => {
          const isOut = dispatched.has(r.id);
          const label = locale === "es" ? r.es : r.en;
          return (
            <Button
              key={r.id}
              variant={isOut ? "ghost" : "secondary"}
              size="xs"
              onClick={() => dispatch(r.id, label)}
              disabled={isOut}
              className={clsx("justify-start gap-2", isOut && "text-ink-subtle")}
            >
              {isOut && (
                <CheckCircle size={11} className="text-ok-muted shrink-0" aria-hidden="true" />
              )}
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// ─── ResponseProtocol ─────────────────────────────────────────────────────────

function ResponseProtocol({
  alerts,
  locale,
}: {
  alerts: Alert[];
  locale: "es" | "en";
}) {
  const qc = useQueryClient();
  const [checked, setChecked]     = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(true);
  const active   = alerts.filter((a) => a.status === "active");
  const critical = active.filter((a) => a.severity === "critical");

  if (critical.length === 0) return null;

  const isHuayco = active.some((a) => a.type === "huayco");

  const steps = [
    { id: "s1", es: "Notificar COEN/INDECI por radio",         en: "Notify COEN/INDECI via radio"      },
    {
      id: "s2",
      es: isHuayco ? "Evacuar Quebrada Jicamarca"            : "Activar ruta de evacuación",
      en: isHuayco ? "Evacuate Quebrada Jicamarca"           : "Activate evacuation route",
    },
    { id: "s3", es: "Verificar albergues (capacidad/estado)", en: "Verify shelters (capacity/status)" },
    { id: "s4", es: "Preparar ficha EDAN para COER",          en: "Prepare EDAN form for COER"        },
  ];

  function toggle(id: string, label: string) {
    const next = new Set(checked);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      qc.setQueryData<DecisionLogEntry[]>(["decision-log", 100], (old) => {
        if (!old) return old;
        return [
          {
            id: nextActionId(),
            logged_at: new Date().toISOString(),
            operator_id: "operator-1",
            action_type: "protocol_step",
            alert_id: critical[0]?.id ?? null,
            payload: { step: id, label },
            session_id: "demo",
          },
          ...old,
        ].slice(0, 100);
      });
    }
    setChecked(next);
  }

  const done = steps.filter((s) => checked.has(s.id)).length;

  return (
    <div className="border-b border-border">
      {/* Collapsible header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
        aria-expanded={!collapsed}
      >
        <SectionLabel className="flex-1">
          {locale === "es" ? "Protocolo INDECI" : "INDECI Protocol"}
        </SectionLabel>
        <span className="text-xs text-ink-subtle tabular-nums font-mono">
          {done}/{steps.length}
        </span>
        <ChevronDown
          size={12}
          className={clsx(
            "text-ink-subtle transition-transform shrink-0",
            !collapsed && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {!collapsed && (
        <ul className="px-4 pb-3 flex flex-col gap-1.5">
          {steps.map((step) => {
            const isDone = checked.has(step.id);
            return (
              <li key={step.id}>
                <button
                  onClick={() => toggle(step.id, locale === "es" ? step.es : step.en)}
                  className="w-full flex items-start gap-2.5 text-left group py-1"
                >
                  {/* Square checkbox */}
                  <span
                    className={clsx(
                      "mt-0.5 w-4 h-4 shrink-0 rounded flex items-center justify-center transition-colors",
                      isDone
                        ? "bg-ink border-transparent"
                        : "border border-border group-hover:border-border-strong",
                    )}
                    aria-hidden="true"
                  >
                    {isDone && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path
                          d="M1 4l2.5 2.5L9 1"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span
                    className={clsx(
                      "text-xs leading-snug flex-1 transition-colors",
                      isDone
                        ? "text-ink-subtle line-through"
                        : "text-ink group-hover:text-accent",
                    )}
                  >
                    {locale === "es" ? step.es : step.en}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── AlertsPanel ─────────────────────────────────────────────────────────────

export function AlertsPanel() {
  const { activePanel, locale, alertStreamConnected: sseConnected } = useUIStore();
  const { data: alerts = [], isLoading, isError, dataUpdatedAt } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const tr = useT(locale);

  if (activePanel !== "alerts") return null;

  const activeCount = alerts.filter((a) => a.status === "active").length;

  return (
    <aside
      className={[
        // Mobile: bottom sheet
        "fixed bottom-14 left-0 right-0 h-[70vh] rounded-t-2xl border-t border-border-strong",
        // Desktop: flush right drawer — no rounded corners, left border only
        "sm:absolute sm:top-0 sm:right-0 sm:bottom-0 sm:left-auto sm:h-full sm:w-[360px]",
        "sm:rounded-none sm:border-t-0 sm:border-l sm:border-border-strong",
        // Surface — solid cream, no glass
        "bg-surface shadow-panel",
        "z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={tr("alerts", "title")}
      role="complementary"
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-10 h-[3px] rounded-full bg-border" />
      </div>

      {/* Panel header */}
      <PanelHeader className="px-4 py-3 sm:rounded-none" border={false}>
        <Bell size={16} className="text-ink-muted shrink-0" aria-hidden="true" />
        <PanelTitle>{tr("alerts", "title")}</PanelTitle>

        {/* Live badge */}
        {sseConnected && (
          <span className="flex items-center gap-1 text-xs text-ok-muted font-medium">
            <span
              className="w-1.5 h-1.5 rounded-full bg-ok-muted live-dot"
              aria-hidden="true"
            />
            {locale === "es" ? "EN VIVO" : "LIVE"}
          </span>
        )}

        {/* Active count badge */}
        {activeCount > 0 && <Badge count={activeCount} variant="danger" />}
      </PanelHeader>

      <Divider />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Population exposure callout */}
        {exposure && exposure.total_affected_population > 0 && (
          <div className="bg-danger-soft border border-danger/20 rounded-xl mx-4 mt-3 mb-1 px-4 py-3">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-xl font-bold text-danger tabular-nums">
                ~{exposure.total_affected_population.toLocaleString(
                  locale === "es" ? "es-PE" : "en-US",
                )}
              </span>
              <span className="text-xs text-ink-muted">
                {tr("alerts", "personsAtRisk")}
              </span>
            </div>
            <p className="text-xs text-ink-muted leading-snug">
              {exposure.districts.slice(0, 3).map((d) => d.district_name).join(" · ")}
              {exposure.districts.length > 3 &&
                ` +${exposure.districts.length - 3} ${locale === "es" ? "distritos" : "districts"}`}
            </p>
          </div>
        )}

        {/* AI recommendation */}
        <AiRecommendation alerts={alerts} locale={locale} />

        {/* Quick resource dispatch + INDECI protocol checklist */}
        <QuickDispatch alerts={alerts} locale={locale} />
        <ResponseProtocol alerts={alerts} locale={locale} />

        {/* Alert list */}
        <ul
          className="divide-y divide-border-subtle"
          role="list"
          aria-label={tr("alerts", "title")}
        >
          {isLoading && (
            <li className="px-4 py-10 text-xs text-ink-muted text-center" aria-live="polite">
              {tr("alerts", "loading")}
            </li>
          )}
          {isError && (
            <li className="px-4 py-10 text-xs text-danger text-center" role="alert">
              {tr("alerts", "error")}
            </li>
          )}
          {!isLoading && !isError && alerts.length === 0 && (
            <li>
              <EmptyState
                icon={<CheckCircle size={20} />}
                title={locale === "es" ? "Sin alertas activas." : "No active alerts."}
                body={
                  locale === "es"
                    ? "Los sensores satelitales y señales sociales se actualizan en segundo plano. Esta vista refrescará automáticamente."
                    : "Satellite sensors and social signals refresh in the background. This view updates automatically."
                }
              />
            </li>
          )}
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} locale={locale} />
          ))}
        </ul>
      </div>

      {/* Footer */}
      <Divider />
      <footer className="px-4 py-2.5 text-xs text-ink-subtle">
        {dataUpdatedAt
          ? `${tr("alerts", "updated")} · ${timeAgo(new Date(dataUpdatedAt).toISOString())}`
          : tr("alerts", "liveSSE")}
      </footer>
    </aside>
  );
}
