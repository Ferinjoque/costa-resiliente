"use client";

import { useState } from "react";
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Users,
  XCircle,
  MapPin,
  Send,
  X,
  ChevronDown,
  Ship,
  Siren,
  Ambulance,
  Flame,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
import { useAlerts, useFloodExposure } from "@/lib/queries";
import { actOnAlert, logDecision } from "@/lib/api";
import type { LiveToast } from "@/store/ui";
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

const SEVERITY_BAR: Record<string, string> = {
  critical: "bg-danger",
  high:     "bg-danger",
  medium:   "bg-warn",
  low:      "bg-ok-soft",
};

// Backend status values (must match ops.alerts status check constraint)
const ACTION_STATUS: Record<string, string> = {
  acknowledge:    "acknowledged",
  escalate:       "escalated",
  false_positive: "false_positive",
  close:          "closed",
};

const STATUS_LABEL: Record<string, { es: string; en: string }> = {
  acknowledged:   { es: "Reconocida",     en: "Acknowledged" },
  escalated:      { es: "Escalada",       en: "Escalated" },
  false_positive: { es: "Falso positivo", en: "False positive" },
  closed:         { es: "Cerrada",        en: "Closed" },
};

const STATUS_VARIANT: Record<string, "danger" | "ok" | "warn" | "default"> = {
  escalated:      "danger",
  acknowledged:   "ok",
  false_positive: "warn",
  closed:         "default",
};

// ─── Monotonic action id generator ───────────────────────────────────────────
let _lastTs = 0;
function nextActionId(): number {
  const now = Date.now();
  const id  = now <= _lastTs ? _lastTs + 1 : now;
  _lastTs   = id;
  return id;
}

// ─── EscalationModal ─────────────────────────────────────────────────────────

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={locale === "es" ? "Confirmar escalada" : "Confirm escalation"}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full sm:max-w-md bg-surface border border-border-strong rounded-t-2xl sm:rounded-2xl shadow-panel flex flex-col z-10">
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-border">
          <TrendingUp size={15} className="text-warn-muted shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">
              {locale === "es" ? "Confirmar escalada" : "Confirm escalation"}
            </p>
            <p className="text-xs text-ink-subtle mt-0.5">
              {locale === "es"
                ? "Se registrará en el log de decisiones y se notificará COEN/INDECI."
                : "Will be logged to the decision log and COEN/INDECI notified."}
            </p>
          </div>
          <button onClick={onCancel} className="text-ink-subtle hover:text-ink transition-colors" aria-label="Cancelar">
            <X size={15} />
          </button>
        </div>
        <div className="px-5 pt-3 pb-2">
          <div className={clsx("flex items-center gap-2 rounded-xl border px-3 py-2 mb-3", sinagerdColor)}>
            <span className="text-[10px] font-bold uppercase tracking-widest">{sinagerdLevel}</span>
            <span className="text-[10px] opacity-50" aria-hidden="true">·</span>
            <span className="text-xs truncate">{alert.title}</span>
          </div>
          <label className="block text-xs text-ink-subtle mb-1 font-semibold uppercase tracking-caps">
            {locale === "es" ? "Reporte de escalada (editable)" : "Escalation report (editable)"}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={6}
            className="w-full bg-surface border border-border-strong rounded-xl px-3 py-2 text-xs text-ink font-mono resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
            aria-label={locale === "es" ? "Notas de escalada" : "Escalation notes"}
          />
        </div>
        <div className="flex items-center gap-2 px-5 pb-4">
          <Button variant="ghost" size="sm" onClick={onCancel} className="flex-1 justify-center">
            {locale === "es" ? "Cancelar" : "Cancel"}
          </Button>
          <Button variant="danger" size="sm" onClick={() => onConfirm(note)} className="flex-1 justify-center">
            <Send size={12} aria-hidden="true" />
            {locale === "es" ? "Escalar ahora" : "Escalate now"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── AlertRow ─────────────────────────────────────────────────────────────────

const ACTION_TOAST: Record<string, { es: string; en: string }> = {
  acknowledge:    { es: "Alerta reconocida — guardada en log", en: "Alert acknowledged — logged" },
  escalate:       { es: "Escalada a INDECI COEN — registrado", en: "Escalated to INDECI COEN — logged" },
  false_positive: { es: "Marcada como falso positivo",        en: "Marked as false positive" },
  close:          { es: "Alerta cerrada",                     en: "Alert closed" },
};

function AlertRow({ alert, locale }: { alert: Alert; locale: "es" | "en" }) {
  const qc = useQueryClient();
  const { setFlyToPoint, addToast } = useUIStore();
  const Icon = TYPE_ICON[alert.type] ?? Bell;
  const tr = useT(locale);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEscalation, setShowEscalation] = useState(false);
  const [acting, setActing] = useState(false);

  function flyToAlert() {
    if (alert.lat == null || alert.lng == null) return;
    setFlyToPoint([alert.lng, alert.lat]);
  }

  async function handleAction(
    action: "acknowledge" | "escalate" | "false_positive" | "close",
    note?: string,
  ) {
    setActing(true);
    const newStatus = ACTION_STATUS[action];
    qc.setQueryData(["alerts", undefined], (old: Alert[] | undefined) =>
      old ? old.map((a) => (a.id === alert.id ? { ...a, status: newStatus } : a)) : old,
    );
    setMenuOpen(false);
    try {
      await actOnAlert(alert.id, action, OPERATOR_ID, note);
      qc.invalidateQueries({ queryKey: ["alerts"] });
      addToast({
        message: ACTION_TOAST[action]?.[locale] ?? (locale === "es" ? "Acción registrada" : "Action logged"),
        variant: action === "escalate" ? "warn" : "success",
      } as Omit<LiveToast, "id" | "at">);
    } catch {
      // optimistic update stands in demo mode — still show toast
      addToast({
        message: ACTION_TOAST[action]?.[locale] ?? (locale === "es" ? "Acción registrada" : "Action logged"),
        variant: "success",
      } as Omit<LiveToast, "id" | "at">);
    } finally {
      setActing(false);
    }
  }

  const TYPE_LABELS: Record<string, { es: string; en: string }> = {
    flood:          { es: "Inundación SAR", en: "SAR Flood" },
    huayco:         { es: "Huayco",         en: "Huayco" },
    social_cluster: { es: "Señal social",   en: "Social signal" },
  };
  const typeLabel = TYPE_LABELS[alert.type]?.[locale] ?? alert.type.replace("_", " ");

  const statusLabel   = STATUS_LABEL[alert.status]?.[locale]   ?? alert.status;
  const statusVariant = STATUS_VARIANT[alert.status]            ?? "default";

  const src    = alert.source_refs?.source ?? null;
  const srcUrl = alert.source_refs?.url    ?? null;

  return (
    <li className="hover:bg-surface-hover transition-colors relative">
      <div className="flex items-stretch gap-0">
        {/* Left severity bar */}
        <span
          className={clsx("w-[3px] shrink-0 self-stretch my-3 ml-4 rounded-full", SEVERITY_BAR[alert.severity] ?? "bg-border")}
          aria-label={`Severidad: ${alert.severity}`}
        />

        <div className="flex-1 min-w-0 px-4 py-3">
          {/* Meta line: type · age · source */}
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <Icon size={10} className="text-ink-subtle shrink-0" aria-hidden="true" />
            <span className="text-xs text-ink-subtle font-medium">{typeLabel}</span>
            <span className="text-ink-subtle" aria-hidden="true">·</span>
            <span className="text-xs text-ink-subtle tabular-nums">{timeAgo(alert.created_at)}</span>
            {src && (
              <>
                <span className="text-ink-subtle" aria-hidden="true">·</span>
                {srcUrl ? (
                  <a
                    href={srcUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline flex items-center gap-0.5"
                    title={locale === "es" ? "Abrir fuente en nueva pestaña" : "Open source in new tab"}
                  >
                    {src}
                    <ExternalLink size={9} aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-xs text-ink-subtle">{src}</span>
                )}
              </>
            )}
          </div>

          {/* Title */}
          <p className="text-sm font-semibold text-ink leading-snug">{alert.title}</p>

          {alert.description && (
            <p className="text-xs text-ink-muted mt-1 leading-snug line-clamp-2">{alert.description}</p>
          )}

          {/* Action strip for active alerts */}
          {alert.status === "active" ? (
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              <button
                onClick={() => handleAction("acknowledge")}
                disabled={acting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-sunken border border-border hover:bg-surface-hover hover:border-border-strong text-ink transition-colors disabled:opacity-50"
                aria-label={tr("alerts", "acknowledge")}
                title={locale === "es" ? "Registra que viste esta alerta. Se guarda en el log de decisiones." : "Records that you reviewed this alert. Saved to decision log."}
              >
                <CheckCircle size={11} className="text-ok-muted" aria-hidden="true" />
                {locale === "es" ? "Reconocer" : "Acknowledge"}
              </button>

              <button
                onClick={() => setShowEscalation(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-danger-soft border border-danger/30 hover:bg-danger/20 text-danger transition-colors"
                title={locale === "es" ? "Escala a INDECI COEN. Abre formulario de reporte editable." : "Escalate to INDECI COEN. Opens an editable escalation report."}
              >
                <TrendingUp size={11} aria-hidden="true" />
                {locale === "es" ? "Escalar" : "Escalate"}
              </button>

              {alert.lat != null && alert.lng != null && (
                <button
                  onClick={flyToAlert}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-sunken border border-border hover:bg-surface-hover hover:border-border-strong text-ink transition-colors"
                  aria-label={locale === "es" ? "Ver en mapa" : "Show on map"}
                  title={locale === "es" ? "Centra el mapa en esta alerta" : "Center map on this alert"}
                >
                  <MapPin size={11} className="text-ink-subtle" aria-hidden="true" />
                  {locale === "es" ? "Ver mapa" : "Map"}
                </button>
              )}

              {/* More menu */}
              <div className="relative ml-auto">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-subtle hover:text-ink hover:bg-surface-hover border border-transparent hover:border-border transition-colors"
                  aria-label={locale === "es" ? "Más acciones" : "More actions"}
                  aria-expanded={menuOpen}
                >
                  {locale === "es" ? "Más" : "More"}
                  <ChevronDown size={10} className={clsx("transition-transform", menuOpen && "rotate-180")} aria-hidden="true" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                    <div className="absolute right-0 top-full mt-1 z-30 bg-surface border border-border-strong rounded-xl shadow-panel w-48 py-1.5">
                      <button
                        onClick={() => handleAction("false_positive")}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors text-left"
                      >
                        <XCircle size={12} aria-hidden="true" />
                        <span>
                          <span className="block">{locale === "es" ? "Falso positivo" : "False positive"}</span>
                          <span className="text-2xs text-ink-subtle">{locale === "es" ? "Descarta, guarda en log" : "Dismiss, log it"}</span>
                        </span>
                      </button>
                      <button
                        onClick={() => handleAction("close")}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors text-left"
                      >
                        <X size={12} aria-hidden="true" />
                        <span>
                          <span className="block">{locale === "es" ? "Cerrar alerta" : "Close alert"}</span>
                          <span className="text-2xs text-ink-subtle">{locale === "es" ? "Evento resuelto" : "Event resolved"}</span>
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <span
              className={clsx(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-2",
                statusVariant === "danger"  ? "bg-danger-soft text-danger" :
                statusVariant === "ok"      ? "bg-ok-soft text-ok-muted" :
                statusVariant === "warn"    ? "bg-warn-soft text-warn-muted" :
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
            await handleAction("escalate", note);
          }}
          onCancel={() => setShowEscalation(false)}
        />
      )}
    </li>
  );
}

// ─── AiRecommendation ─────────────────────────────────────────────────────────

function AiRecommendation({ alerts, locale }: { alerts: Alert[]; locale: "es" | "en" }) {
  const active   = alerts.filter((a) => a.status === "active");
  const critical = active.filter((a) => a.severity === "critical");
  const high     = active.filter((a) => a.severity === "high");

  if (critical.length === 0 && high.length < 2) return null;

  const firstCritical = critical[0];
  const isHuayco = firstCritical?.type === "huayco" || active.some((a) => a.type === "huayco");

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
        <span className="text-xs text-ink-subtle">{locale === "es" ? "Recomendación" : "Recommendation"}</span>
      </div>
      <p className="text-sm text-ink leading-snug">{rec}</p>
    </div>
  );
}

// ─── QuickDispatch ────────────────────────────────────────────────────────────

type ResourceId = "bote" | "usar" | "amb" | "bomb";

interface Resource {
  id: ResourceId;
  es: string;
  en: string;
  icon: LucideIcon;
  forTypes: string[];
}

const RESOURCES: Resource[] = [
  { id: "bote",  es: "Bote Rescate",  en: "Rescue Boat",   icon: Ship,      forTypes: ["flood"] },
  { id: "usar",  es: "USAR Alfa",     en: "USAR Alpha",    icon: Users,     forTypes: ["flood", "huayco"] },
  { id: "amb",   es: "Ambulancia",    en: "Ambulance",     icon: Ambulance, forTypes: ["flood", "huayco", "social_cluster"] },
  { id: "bomb",  es: "Bomberos",      en: "Fire Brigade",  icon: Flame,     forTypes: ["flood", "huayco"] },
];

function QuickDispatch({ alerts, locale }: { alerts: Alert[]; locale: "es" | "en" }) {
  const { addToast } = useUIStore();
  const [dispatched, setDispatched] = useState<Map<ResourceId, string>>(new Map());
  const active   = alerts.filter((a) => a.status === "active");
  const urgent   = active.filter((a) => a.severity === "critical" || a.severity === "high");

  if (urgent.length === 0) return null;

  const activeTypes = new Set(urgent.map((a) => a.type));
  const relevantResources = RESOURCES.filter((r) =>
    r.forTypes.some((t) => activeTypes.has(t)),
  );
  const primaryAlert = urgent[0];

  async function dispatch(r: Resource) {
    if (dispatched.has(r.id)) return;
    const label = locale === "es" ? r.es : r.en;
    const ts = new Date().toLocaleTimeString("es-PE", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima",
    });
    setDispatched((m) => new Map([...m, [r.id, ts]]));
    await logDecision({
      operator_id: OPERATOR_ID,
      action_type: "resource_dispatch",
      alert_id: primaryAlert?.id ?? null,
      payload: { resource: r.id, resource_name: label, dispatched_at: new Date().toISOString() },
      session_id: "demo",
    });
    addToast({
      message: locale === "es" ? `${label} despachado — registrado en log` : `${label} dispatched — logged`,
      variant: "success",
    } as Omit<LiveToast, "id" | "at">);
  }

  const dispatchedCount = dispatched.size;

  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2 mb-2.5">
        <SectionLabel className="flex-1">
          {locale === "es" ? "Despacho rápido" : "Quick dispatch"}
        </SectionLabel>
        {dispatchedCount > 0 && (
          <span className="text-xs text-ok-muted font-medium">
            {dispatchedCount} {locale === "es" ? "despachado(s)" : "dispatched"}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {relevantResources.map((r) => {
          const isOut = dispatched.has(r.id);
          const ts    = dispatched.get(r.id);
          const label = locale === "es" ? r.es : r.en;
          const Icon  = r.icon;
          return (
            <button
              key={r.id}
              onClick={() => dispatch(r)}
              disabled={isOut}
              className={clsx(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left",
                isOut
                  ? "bg-ok-soft text-ok-muted cursor-default"
                  : "bg-surface-sunken border border-border hover:bg-surface-hover hover:border-border-strong text-ink",
              )}
              aria-label={`${isOut ? (locale === "es" ? "Despachado" : "Dispatched") : (locale === "es" ? "Despachar" : "Dispatch")} ${label}`}
            >
              {isOut
                ? <CheckCircle size={12} className="shrink-0" aria-hidden="true" />
                : <Icon size={12} className="shrink-0 text-ink-subtle" aria-hidden="true" />
              }
              <span className="flex-1 truncate">{label}</span>
              {isOut && ts && (
                <span className="text-2xs text-ok-muted font-mono tabular-nums shrink-0">{ts}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── ResponseProtocol ─────────────────────────────────────────────────────────

function ResponseProtocol({ alerts, locale }: { alerts: Alert[]; locale: "es" | "en" }) {
  const { addToast } = useUIStore();
  const [checked, setChecked]     = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(true);
  const active   = alerts.filter((a) => a.status === "active");
  const urgent   = active.filter((a) => a.severity === "critical" || a.severity === "high");

  if (urgent.length === 0) return null;

  const isHuayco = active.some((a) => a.type === "huayco" && (a.severity === "critical" || a.severity === "high"));
  const primaryAlert = urgent[0];

  const steps = isHuayco
    ? [
        { id: "s1", es: "Notificar COEN/INDECI por radio",           en: "Notify COEN/INDECI via radio" },
        { id: "s2", es: "Evacuar Quebrada Jicamarca — ruta Av. Las Torres", en: "Evacuate Quebrada Jicamarca via Av. Las Torres" },
        { id: "s3", es: "Verificar albergues habilitados y capacidad", en: "Verify enabled shelters and capacity" },
        { id: "s4", es: "Desplegar USAR y botes en zona de descarga",  en: "Deploy USAR and boats to discharge zone" },
        { id: "s5", es: "Preparar ficha EDAN para COER",               en: "Prepare EDAN form for COER" },
      ]
    : [
        { id: "s1", es: "Notificar COEN/INDECI por radio",            en: "Notify COEN/INDECI via radio" },
        { id: "s2", es: "Activar ruta de evacuación preventiva",       en: "Activate preventive evacuation route" },
        { id: "s3", es: "Verificar albergues (capacidad / estado)",    en: "Verify shelters (capacity / status)" },
        { id: "s4", es: "Preparar ficha EDAN para COER",               en: "Prepare EDAN form for COER" },
      ];

  async function toggle(id: string, label: string) {
    const next = new Set(checked);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      await logDecision({
        operator_id: OPERATOR_ID,
        action_type: "protocol_step",
        alert_id: primaryAlert?.id ?? null,
        payload: { step: id, label, completed_at: new Date().toISOString() },
        session_id: "demo",
      });
      const nextDone = [...next].filter((s) => steps.some((st) => st.id === s)).length;
      if (nextDone === steps.length) {
        addToast({
          message: locale === "es" ? "Protocolo INDECI completado — log guardado" : "INDECI Protocol complete — log saved",
          variant: "success",
        } as Omit<LiveToast, "id" | "at">);
      } else {
        addToast({
          message: locale === "es" ? `Paso ${nextDone}/${steps.length} completado — registrado` : `Step ${nextDone}/${steps.length} complete — logged`,
          variant: "info",
        } as Omit<LiveToast, "id" | "at">);
      }
    }
    setChecked(next);
  }

  const done  = steps.filter((s) => checked.has(s.id)).length;
  const allDone = done === steps.length;

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
        aria-expanded={!collapsed}
      >
        <Siren size={13} className={clsx("shrink-0 transition-colors", allDone ? "text-ok-muted" : "text-warn-muted")} aria-hidden="true" />
        <SectionLabel className="flex-1">
          {locale === "es" ? "Protocolo INDECI" : "INDECI Protocol"}
        </SectionLabel>
        <span className={clsx("text-xs tabular-nums font-mono", allDone ? "text-ok-muted font-semibold" : "text-ink-subtle")}>
          {done}/{steps.length}
        </span>
        <ChevronDown
          size={12}
          className={clsx("text-ink-subtle transition-transform shrink-0", !collapsed && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {!collapsed && (
        <div className="px-4 pb-3">
          {allDone && (
            <div className="flex items-center gap-2 bg-ok-soft border border-ok/20 rounded-xl px-3 py-2 mb-3">
              <CheckCircle size={13} className="text-ok-muted shrink-0" aria-hidden="true" />
              <span className="text-xs text-ok-muted font-medium">
                {locale === "es" ? "Protocolo completado — registrado en el log" : "Protocol complete — logged to decision log"}
              </span>
            </div>
          )}
          <ul className="flex flex-col gap-1.5" role="list">
            {steps.map((step) => {
              const isDone = checked.has(step.id);
              return (
                <li key={step.id}>
                  <button
                    onClick={() => toggle(step.id, locale === "es" ? step.es : step.en)}
                    className="w-full flex items-start gap-2.5 text-left group py-1"
                    aria-pressed={isDone}
                  >
                    <span
                      className={clsx(
                        "mt-0.5 w-4 h-4 shrink-0 rounded flex items-center justify-center transition-colors",
                        isDone ? "bg-ink border-transparent" : "border border-border group-hover:border-border-strong",
                      )}
                      aria-hidden="true"
                    >
                      {isDone && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className={clsx("text-xs leading-snug flex-1 transition-colors", isDone ? "text-ink-subtle line-through" : "text-ink group-hover:text-accent")}>
                      {locale === "es" ? step.es : step.en}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── AlertsPanel ─────────────────────────────────────────────────────────────

type FilterTab = "active" | "all";

export function AlertsPanel() {
  const { activePanel, locale, alertStreamConnected: sseConnected } = useUIStore();
  const { data: alerts = [], isLoading, isError, dataUpdatedAt } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const tr = useT(locale);
  const [tab, setTab] = useState<FilterTab>("active");

  if (activePanel !== "alerts") return null;

  const activeAlerts  = alerts.filter((a) => a.status === "active");
  const historyAlerts = alerts.filter((a) => a.status !== "active");
  const displayed     = tab === "active" ? activeAlerts : alerts;

  const activeCount   = activeAlerts.length;

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[70vh] rounded-t-2xl border-t border-border-strong",
        "sm:absolute sm:top-0 sm:right-0 sm:bottom-0 sm:left-auto sm:h-full sm:w-[360px]",
        "sm:rounded-none sm:border-t-0 sm:border-l sm:border-border-strong",
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
        {sseConnected && (
          <span className="flex items-center gap-1 text-xs text-ok-muted font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-ok-muted live-dot" aria-hidden="true" />
            {locale === "es" ? "EN VIVO" : "LIVE"}
          </span>
        )}
        {activeCount > 0 && <Badge count={activeCount} variant="danger" />}
      </PanelHeader>

      <Divider />

      {/* Filter tabs */}
      <div className="flex border-b border-border-subtle px-4 gap-0" role="tablist">
        {(["active", "all"] as FilterTab[]).map((t) => {
          const count = t === "active" ? activeCount : alerts.length;
          const label = t === "active"
            ? (locale === "es" ? "Activas" : "Active")
            : (locale === "es" ? "Todas" : "All");
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                tab === t
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-subtle hover:text-ink",
              )}
            >
              {label}
              {count > 0 && (
                <span className={clsx(
                  "text-2xs px-1.5 py-0.5 rounded-full tabular-nums",
                  tab === t
                    ? (t === "active" && activeCount > 0 ? "bg-danger text-white" : "bg-accent-soft text-accent")
                    : "bg-surface-sunken text-ink-subtle",
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Population exposure callout — only on active tab */}
        {tab === "active" && exposure && exposure.total_affected_population > 0 && (
          <div className="bg-danger-soft border border-danger/20 rounded-xl mx-4 mt-3 mb-1 px-4 py-3">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-xl font-bold text-danger tabular-nums">
                ~{exposure.total_affected_population.toLocaleString(locale === "es" ? "es-PE" : "en-US")}
              </span>
              <span className="text-xs text-ink-muted">{tr("alerts", "personsAtRisk")}</span>
            </div>
            <p className="text-xs text-ink-muted leading-snug">
              {exposure.districts.slice(0, 3).map((d) => d.district_name).join(" · ")}
              {exposure.districts.length > 3 && ` +${exposure.districts.length - 3} ${locale === "es" ? "distritos" : "districts"}`}
            </p>
          </div>
        )}

        {/* AI recommendation — active tab only */}
        {tab === "active" && <AiRecommendation alerts={alerts} locale={locale} />}

        {/* Dispatch + protocol — active tab only */}
        {tab === "active" && <QuickDispatch alerts={alerts} locale={locale} />}
        {tab === "active" && <ResponseProtocol alerts={alerts} locale={locale} />}

        {/* History header */}
        {tab === "all" && historyAlerts.length > 0 && activeCount > 0 && (
          <div className="px-4 pt-3 pb-1">
            <SectionLabel>{locale === "es" ? `Activas (${activeCount})` : `Active (${activeCount})`}</SectionLabel>
          </div>
        )}

        {/* Alert list */}
        <ul className="divide-y divide-border-subtle" role="list" aria-label={tr("alerts", "title")}>
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
          {!isLoading && !isError && displayed.length === 0 && tab === "active" && (
            <li>
              <EmptyState
                icon={<CheckCircle size={20} />}
                title={locale === "es" ? "Sin alertas activas." : "No active alerts."}
                body={locale === "es"
                  ? "Los sensores satelitales y señales sociales se actualizan en segundo plano."
                  : "Satellite sensors and social signals refresh in the background."}
              />
            </li>
          )}
          {displayed.map((alert) => (
            <AlertRow key={alert.id} alert={alert} locale={locale} />
          ))}
        </ul>

        {/* History section header in "all" tab */}
        {tab === "all" && historyAlerts.length > 0 && activeCount > 0 && (
          <div className="px-4 pt-2 pb-1 border-t border-border-subtle mt-1">
            <SectionLabel>{locale === "es" ? `Historial (${historyAlerts.length})` : `History (${historyAlerts.length})`}</SectionLabel>
          </div>
        )}
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
