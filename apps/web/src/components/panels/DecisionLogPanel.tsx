"use client";

import { ClipboardList, Download, X } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useDecisionLog } from "@/lib/queries";
import { useApiHealth } from "@/lib/queries";
import type { DecisionLogEntry } from "@/lib/api";
import {
  PanelHeader,
  PanelTitle,
  Button,
  Pill,
  EmptyState,
} from "@/components/ui/primitives";
import type { ComponentProps } from "react";

// ─── Business logic helpers ───────────────────────────────────────────────────

function downloadCsv(entries: DecisionLogEntry[]) {
  const header = "id,logged_at,operator_id,action_type,alert_id,payload\n";
  const rows = entries.map((e) =>
    [e.id, e.logged_at, e.operator_id, e.action_type, e.alert_id ?? "", JSON.stringify(e.payload)].join(",")
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `costa_resiliente_decision_log_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function timeStamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_LABELS: Record<string, { es: string; en: string }> = {
  query:                  { es: "Consulta",            en: "Query" },
  alert_acknowledge:      { es: "Reconoció alerta",    en: "Alert acknowledged" },
  alert_escalate:         { es: "Escaló alerta",       en: "Alert escalated" },
  alert_false_positive:   { es: "Falso positivo",      en: "False positive" },
  alert_close:            { es: "Cerró alerta",        en: "Alert closed" },
  map_pin:                { es: "Pin en mapa",         en: "Map pin" },
  export:                 { es: "Exportó datos",       en: "Data exported" },
  social_signal_received: { es: "Señal social (auto)", en: "Social signal (auto)" },
  resource_dispatch:      { es: "Despacho recurso",    en: "Resource dispatched" },
  protocol_step:          { es: "Paso protocolo",      en: "Protocol step" },
};

/** Map action_type to a Pill variant for visual encoding. */
function pillVariantFor(actionType: string): ComponentProps<typeof Pill>["variant"] {
  if (actionType === "alert_escalate") return "danger";
  if (actionType === "resource_dispatch") return "warn";
  if (actionType === "alert_acknowledge" || actionType === "alert_close") return "accent";
  return "default";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DecisionLogPanel() {
  const { activePanel, setActivePanel, locale } = useUIStore();
  const { data: entries = [], isLoading, isError } = useDecisionLog(100);
  const { data: health, isError: apiDown } = useApiHealth();
  const online = health?.status === "ok" && !apiDown;

  if (activePanel !== "log") return null;

  const panelTitle   = locale === "es" ? "Registro" : "Decision Log";
  const exportLabel  = locale === "es" ? "Exportar registro a CSV" : "Export log to CSV";
  const loadingText  = locale === "es" ? "Cargando registro…" : "Loading log…";
  const errorText    = locale === "es" ? "Error al cargar registro" : "Failed to load log";
  const emptyTitle   = locale === "es" ? "Sin entradas aún" : "No entries yet";
  const emptyBody    = locale === "es"
    ? "El registro de decisiones aparecerá aquí. Cada consulta, reconocimiento y escalada queda registrada de forma inmutable para exportación EDAN-Perú."
    : "Decision log entries will appear here. Every query, acknowledgement, and escalation is recorded immutably for EDAN-Peru export.";
  const footerText   = locale === "es" ? "Registro append-only · Exportación EDAN-Perú" : "Append-only log · EDAN-Peru export";

  return (
    <aside
      className={[
        // Mobile: slide-up sheet
        "fixed bottom-14 left-0 right-0 h-[62vh] rounded-t-2xl",
        // Desktop: fixed sidebar panel
        "sm:absolute sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:h-auto sm:w-80 sm:max-w-sm sm:rounded-2xl",
        // Felt-style cream surface — NO glass/blur
        "bg-surface border-l border-border-strong shadow-panel z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={locale === "es" ? "Registro de decisiones" : "Decision log"}
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-border-strong" />
      </div>

      {/* Header */}
      <PanelHeader>
        <ClipboardList size={15} className="text-accent shrink-0" aria-hidden="true" />
        <PanelTitle>{panelTitle}</PanelTitle>

        {/* Export CSV — live API link when online, local CSV generation when offline */}
        {online ? (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/alerts/decision-log/export`}
            download
            className="ml-auto text-ink-muted hover:text-ink transition-colors flex items-center gap-1 text-xs rounded focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            aria-label={exportLabel}
          >
            <Download size={13} /> CSV
          </a>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => downloadCsv(entries)}
            aria-label={exportLabel}
            className="ml-auto gap-1"
          >
            <Download size={13} /> CSV
          </Button>
        )}

        {/* Close */}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setActivePanel("map")}
          aria-label={locale === "es" ? "Cerrar panel" : "Close panel"}
          className="p-1"
        >
          <X size={15} aria-hidden="true" />
        </Button>
      </PanelHeader>

      {/* Log list */}
      <ul
        className="flex-1 overflow-y-auto divide-y divide-border"
        role="list"
        aria-label={locale === "es" ? "Entradas del registro de decisiones" : "Decision log entries"}
        aria-live="polite"
        aria-busy={isLoading}
      >
        {isLoading && (
          <li className="px-4 py-8 text-xs text-ink-subtle text-center" aria-live="polite">
            {loadingText}
          </li>
        )}

        {isError && (
          <li className="px-4 py-8 text-xs text-danger text-center" role="alert">
            {errorText}
          </li>
        )}

        {!isLoading && !isError && entries.length === 0 && (
          <li>
            <EmptyState
              icon={<ClipboardList size={18} />}
              title={emptyTitle}
              body={emptyBody}
            />
          </li>
        )}

        {entries.map((entry) => {
          const actionEntry = ACTION_LABELS[entry.action_type];
          const label = actionEntry ? actionEntry[locale] : entry.action_type.replace(/_/g, " ");
          const preview = entry.payload?.query
            ? String(entry.payload.query).slice(0, 60)
            : entry.payload?.note
              ? String(entry.payload.note).slice(0, 60)
              : entry.payload?.resource_name
                ? String(entry.payload.resource_name)
                : entry.payload?.label
                  ? String(entry.payload.label).slice(0, 60)
                  : entry.payload?.district && entry.payload?.source
                    ? `${entry.payload.source} · ${entry.payload.district}`
                    : null;

          return (
            <li
              key={entry.id}
              className="px-4 py-3 border-b border-border hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {/* Action label + pill */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-xs font-medium text-ink truncate">{label}</p>
                    <Pill variant={pillVariantFor(entry.action_type)} className="shrink-0">
                      {entry.action_type.replace(/_/g, " ")}
                    </Pill>
                  </div>

                  {/* Payload preview */}
                  {preview && (
                    <p className="text-xs text-ink-muted truncate">{preview}</p>
                  )}

                  {/* Operator + timestamp */}
                  <p className="text-xs font-mono tabular-nums text-ink-subtle mt-0.5">
                    {entry.operator_id} · {timeStamp(entry.logged_at)}
                  </p>
                </div>

                {/* Alert ID badge */}
                {entry.alert_id && (
                  <span className="shrink-0 text-xs font-mono tabular-nums text-ink-subtle">
                    #{entry.alert_id}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border text-xs text-ink-subtle text-center">
        {footerText}
      </div>
    </aside>
  );
}
