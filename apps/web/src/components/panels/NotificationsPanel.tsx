"use client";

import { useState } from "react";
import { Webhook, Plus, Trash2, X, CheckCircle, AlertCircle, Clock, SkipForward } from "lucide-react";
import { clsx } from "clsx";
import { useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/store/ui";
import { useNotificationSubscribers, useNotificationDeliveries } from "@/lib/queries";
import { createNotificationSubscriber, deleteNotificationSubscriber, RateLimitError } from "@/lib/api";
import {
  Panel,
  PanelHeader,
  PanelTitle,
  SectionLabel,
  Button,
  Badge,
  Pill,
  EmptyState,
  Divider,
} from "@/components/ui/primitives";
import { timeAgo } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, { es: string; en: string }> = {
  webhook:  { es: "Webhook",  en: "Webhook"  },
  email:    { es: "Email",    en: "Email"    },
  sms_stub: { es: "SMS (demo)", en: "SMS (demo)" },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  delivered: <CheckCircle size={11} className="text-ok-muted"    />,
  failed:    <AlertCircle size={11} className="text-danger"       />,
  skipped:   <SkipForward size={11} className="text-ink-subtle"   />,
  pending:   <Clock       size={11} className="text-warn-muted"   />,
};

const SEV_OPTIONS = ["critical", "high", "medium", "low"] as const;

// ─── Add subscriber form ──────────────────────────────────────────────────────

function AddSubscriberForm({ locale, onClose }: { locale: "es" | "en"; onClose: () => void }) {
  const qc = useQueryClient();
  const { addToast } = useUIStore();
  const [channel, setChannel] = useState<"webhook" | "email" | "sms_stub">("webhook");
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [sevMin, setSevMin] = useState<"critical" | "high" | "medium" | "low">("high");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!target.trim() || !label.trim()) {
      setError(locale === "es" ? "Rellena todos los campos." : "Fill in all fields.");
      return;
    }
    if (channel === "webhook") {
      try {
        const parsed = new URL(target.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        setError(locale === "es" ? "El target debe ser una URL http/https válida." : "Target must be a valid http/https URL.");
        return;
      }
    }
    setSaving(true);
    try {
      await createNotificationSubscriber({ channel, target: target.trim(), label: label.trim(), severity_min: sevMin });
      await qc.invalidateQueries({ queryKey: ["notification-subscribers"] });
      addToast({ message: locale === "es" ? "Suscriptor añadido" : "Subscriber added", variant: "success" });
      onClose();
    } catch (e: unknown) {
      if (e instanceof RateLimitError) {
        setError(locale === "es"
          ? `Demasiadas suscripciones. Espere ${e.retryAfter}s e intente de nuevo.`
          : `Too many subscriptions. Wait ${e.retryAfter}s and try again.`);
      } else {
        setError(e instanceof Error ? e.message : "Error");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-3 border-b border-border bg-surface-sunken space-y-2">
      <SectionLabel>{locale === "es" ? "Nuevo suscriptor" : "New subscriber"}</SectionLabel>

      {/* Channel */}
      <div className="flex gap-1 flex-wrap">
        {(["webhook", "email", "sms_stub"] as const).map((ch) => (
          <button
            key={ch}
            type="button"
            onClick={() => setChannel(ch)}
            className={clsx(
              "text-xs px-2.5 py-1 rounded-full border transition-colors",
              channel === ch
                ? "bg-ink text-surface border-ink"
                : "bg-surface border-border text-ink-muted hover:border-border-strong hover:text-ink",
            )}
          >
            {CHANNEL_LABEL[ch][locale]}
          </button>
        ))}
      </div>

      {/* Label */}
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={locale === "es" ? "Nombre (ej. COER Lima webhook)" : "Name (e.g. COER Lima webhook)"}
        className="w-full bg-surface border border-border rounded-xl text-xs text-ink px-3 py-1.5 focus:outline-none focus:border-border-strong"
      />

      {/* Target */}
      <input
        type="text"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder={
          channel === "webhook"
            ? "https://yourserver.com/hook"
            : channel === "email"
              ? "operador@coer.gob.pe"
              : "+51 9XX XXX XXX"
        }
        className="w-full bg-surface border border-border rounded-xl text-xs text-ink px-3 py-1.5 focus:outline-none focus:border-border-strong"
      />

      {/* Severity minimum */}
      <div className="flex items-center gap-2">
        <span className="text-2xs text-ink-subtle shrink-0">
          {locale === "es" ? "Nivel mínimo:" : "Min severity:"}
        </span>
        <div className="flex gap-1">
          {SEV_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSevMin(s)}
              className={clsx(
                "text-2xs px-2 py-0.5 rounded-full border transition-colors",
                sevMin === s
                  ? "bg-ink text-surface border-ink"
                  : "bg-surface border-border text-ink-muted hover:border-border-strong",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {channel !== "webhook" && (
        <p className="text-2xs text-ink-subtle italic">
          {locale === "es"
            ? "Email y SMS en modo demo (sin envío real). Solo webhook POST está activo."
            : "Email and SMS are demo-only (no real send). Only webhook POST is active."}
        </p>
      )}

      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="xs" onClick={onClose}>{locale === "es" ? "Cancelar" : "Cancel"}</Button>
        <Button variant="primary" size="xs" onClick={submit} disabled={saving}>
          {saving ? (locale === "es" ? "Guardando…" : "Saving…") : (locale === "es" ? "Guardar" : "Save")}
        </Button>
      </div>
    </div>
  );
}

// ─── NotificationsPanel ───────────────────────────────────────────────────────

export function NotificationsPanel() {
  const { activePanel, setActivePanel, locale } = useUIStore();
  const qc = useQueryClient();
  const { addToast } = useUIStore();
  const { data: subscribers = [], isLoading: subLoading, isError: subError, refetch: refetchSubs } = useNotificationSubscribers();
  const { data: deliveries = [], isLoading: delLoading, isError: delError, refetch: refetchDels } = useNotificationDeliveries();
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"subscribers" | "log">("subscribers");

  if (activePanel !== "notifications") return null;

  async function handleDelete(id: number) {
    try {
      await deleteNotificationSubscriber(id);
      await qc.invalidateQueries({ queryKey: ["notification-subscribers"] });
      addToast({ message: locale === "es" ? "Suscriptor desactivado" : "Subscriber disabled", variant: "info" });
    } catch {
      addToast({ message: locale === "es" ? "Error al desactivar" : "Error disabling", variant: "warn" });
    }
  }

  const deliveredCount = deliveries.filter((d) => d.status === "delivered").length;
  const failedCount    = deliveries.filter((d) => d.status === "failed").length;

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[70vh] rounded-t-2xl",
        "sm:absolute sm:top-0 sm:right-0 sm:h-full sm:w-[360px] sm:rounded-none sm:bottom-auto sm:left-auto",
        "bg-surface border-t border-border-strong sm:border-t-0 sm:border-l shadow-panel z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={locale === "es" ? "Notificaciones salientes" : "Outbound notifications"}
      role="complementary"
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-border-strong" />
      </div>

      {/* Header */}
      <PanelHeader>
        <Webhook size={15} className="text-accent shrink-0" aria-hidden="true" />
        <PanelTitle>
          {locale === "es" ? "Notificaciones" : "Notifications"}
        </PanelTitle>
        {subscribers.length > 0 && (
          <span className="text-xs font-mono tabular-nums text-ink-subtle bg-surface-sunken rounded px-1.5 py-0.5 shrink-0">
            {subscribers.length}
          </span>
        )}
        {failedCount > 0 && <Badge count={failedCount} variant="danger" />}
        <button
          onClick={() => setShowForm((o) => !o)}
          className={clsx(
            "ml-auto p-1 rounded transition-colors",
            showForm ? "text-accent bg-accent-soft" : "text-ink-muted hover:text-ink hover:bg-surface-hover",
          )}
          aria-label={locale === "es" ? "Añadir suscriptor" : "Add subscriber"}
          aria-pressed={showForm}
        >
          <Plus size={14} />
        </button>
        <button
          onClick={() => setActivePanel("map")}
          className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors"
          aria-label={locale === "es" ? "Cerrar panel" : "Close panel"}
        >
          <X size={15} />
        </button>
      </PanelHeader>

      {/* Add form */}
      {showForm && <AddSubscriberForm locale={locale} onClose={() => setShowForm(false)} />}

      {/* Tabs */}
      <div className="flex px-4 pt-2 gap-3 border-b border-border text-xs font-medium shrink-0">
        {(["subscribers", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "pb-2 border-b-2 transition-colors",
              tab === t ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t === "subscribers"
              ? locale === "es" ? `Suscriptores (${subscribers.length})` : `Subscribers (${subscribers.length})`
              : locale === "es" ? `Historial (${deliveries.length})` : `Log (${deliveries.length})`}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === "subscribers" && (
          <ul role="list" className="divide-y divide-border-subtle">
            {subLoading && (
              <li className="px-4 py-10 text-xs text-ink-muted text-center" aria-live="polite">
                {locale === "es" ? "Cargando suscriptores…" : "Loading subscribers…"}
              </li>
            )}
            {subError && (
              <li className="px-4 py-8 flex flex-col items-center gap-2" role="alert">
                <span className="text-xs text-danger text-center">
                  {locale === "es" ? "Error al cargar suscriptores." : "Could not load subscribers."}
                </span>
                <button onClick={() => refetchSubs()} className="text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
                  {locale === "es" ? "Reintentar" : "Retry"}
                </button>
              </li>
            )}
            {!subLoading && !subError && subscribers.length === 0 && (
              <li className="flex flex-col items-center">
                <EmptyState
                  title={locale === "es" ? "Sin suscriptores" : "No subscribers"}
                  body={locale === "es"
                    ? "Añade un webhook para recibir alertas escaladas."
                    : "Add a webhook to receive escalated alerts."}
                  icon={<Webhook size={20} />}
                />
              </li>
            )}
            {!subLoading && !subError && subscribers.map((sub) => (
              <li key={sub.id} className="px-4 py-3 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <Pill variant="default">{CHANNEL_LABEL[sub.channel]?.[locale] ?? sub.channel}</Pill>
                    <Pill variant={sub.severity_min === "critical" ? "danger" : sub.severity_min === "high" ? "danger" : "default"}>
                      ≥ {sub.severity_min}
                    </Pill>
                  </div>
                  <p className="text-sm text-ink font-medium truncate">{sub.label}</p>
                  <p className="text-xs text-ink-subtle font-mono truncate">{sub.target}</p>
                </div>
                <button
                  onClick={() => handleDelete(sub.id)}
                  className="p-1 rounded text-ink-subtle hover:text-danger transition-colors shrink-0"
                  aria-label={locale === "es" ? "Desactivar suscriptor" : "Disable subscriber"}
                  title={locale === "es" ? "Desactivar" : "Disable"}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {tab === "log" && (
          <>
            {!delLoading && !delError && deliveries.length > 0 && (
              <div className="px-4 py-2 border-b border-border-subtle flex gap-3 text-xs text-ink-muted">
                <span className="text-ok-muted font-medium">{deliveredCount} ✓</span>
                {failedCount > 0 && <span className="text-danger font-medium">{failedCount} ✗</span>}
              </div>
            )}
            <ul role="list" className="divide-y divide-border-subtle">
              {delLoading && (
                <li className="px-4 py-10 text-xs text-ink-muted text-center" aria-live="polite">
                  {locale === "es" ? "Cargando historial…" : "Loading delivery log…"}
                </li>
              )}
              {delError && (
                <li className="px-4 py-8 flex flex-col items-center gap-2" role="alert">
                  <span className="text-xs text-danger text-center">
                    {locale === "es" ? "Error al cargar historial." : "Could not load delivery log."}
                  </span>
                  <button onClick={() => refetchDels()} className="text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
                    {locale === "es" ? "Reintentar" : "Retry"}
                  </button>
                </li>
              )}
              {!delLoading && !delError && deliveries.length === 0 && (
                <li className="flex flex-col items-center">
                  <EmptyState
                    title={locale === "es" ? "Sin envíos" : "No deliveries"}
                    body={locale === "es"
                      ? "Las notificaciones enviadas aparecerán aquí."
                      : "Sent notifications will appear here."}
                    icon={<Clock size={20} />}
                  />
                </li>
              )}
              {!delLoading && !delError && deliveries.map((d) => (
                <li key={d.id} className="px-4 py-2.5 flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">{STATUS_ICON[d.status]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs text-ink font-medium">{d.trigger_event}</span>
                      {d.alert_id && (
                        <span className="text-2xs text-ink-subtle font-mono">#{d.alert_id}</span>
                      )}
                    </div>
                    {d.last_error && (
                      <p className="text-2xs text-danger font-mono truncate">{d.last_error}</p>
                    )}
                    <p className="text-2xs text-ink-subtle font-mono">
                      {timeAgo(d.created_at)}
                      {d.attempts > 1 && ` · ${d.attempts} ${locale === "es" ? "intentos" : "attempts"}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Footer note */}
      <div className="px-4 py-2 border-t border-border text-2xs text-ink-subtle text-center">
        {locale === "es"
          ? "Webhooks se activan al escalar alertas o en alertas críticas/altas nuevas."
          : "Webhooks fire on alert escalation or new critical/high alerts."}
      </div>
    </aside>
  );
}
