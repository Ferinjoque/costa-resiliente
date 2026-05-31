"use client";

import {
  AlertTriangle,
  CheckCircle,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Download,
  MapPin,
  MessageSquare,
  Radio,
  RefreshCw,
  Truck,
  X,
  XCircle,
  FileText,
} from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useDecisionLog, useApiHealth } from "@/lib/queries";
import type { DecisionLogEntry } from "@/lib/api";
import { downloadAuthenticatedFile } from "@/lib/api";
import {
  PanelHeader,
  PanelTitle,
  Button,
  Pill,
  EmptyState,
} from "@/components/ui/primitives";
import type { ComponentProps } from "react";

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(entries: DecisionLogEntry[], isDemo = false) {
  const COLS = ["id", "logged_at", "operator_id", "action_type", "alert_id", "session_id", "payload"];
  const header = COLS.join(",") + "\n";
  const rows = entries
    .map((e) => {
      let payloadStr: string;
      try { payloadStr = JSON.stringify(e.payload); } catch { payloadStr = "{}"; }
      return [
        e.id,
        e.logged_at,
        csvEscape(e.operator_id),
        csvEscape(e.action_type),
        e.alert_id ?? "",
        csvEscape(e.session_id ?? ""),
        csvEscape(payloadStr),
      ].join(",");
    })
    .join("\n");
  // UTF-8 BOM (﻿) ensures Excel opens accented characters correctly
  const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const prefix = isDemo ? "DEMO_" : "";
  a.download = `${prefix}costa_resiliente_decision_log_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function relativeTime(iso: string, locale: "es" | "en"): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return locale === "es" ? "hace un momento" : "just now";
  if (diffMin < 60) return locale === "es" ? `hace ${diffMin} min` : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return locale === "es" ? `hace ${diffHr}h` : `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return locale === "es" ? `hace ${diffDays}d` : `${diffDays}d ago`;
}

function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_META: Record<
  string,
  { es: string; en: string; icon: React.ElementType; variant: ComponentProps<typeof Pill>["variant"] }
> = {
  query:                  { es: "Consulta IA",         en: "AI query",          icon: MessageSquare, variant: "default"  },
  alert_acknowledge:      { es: "Alerta reconocida",   en: "Alert acknowledged",icon: CheckCircle,   variant: "accent"   },
  alert_escalate:         { es: "Alerta escalada",     en: "Alert escalated",   icon: AlertTriangle, variant: "danger"   },
  alert_false_positive:   { es: "Falso positivo",      en: "False positive",    icon: XCircle,       variant: "default"  },
  alert_close:            { es: "Alerta cerrada",      en: "Alert closed",      icon: CheckSquare,   variant: "accent"   },
  map_pin:                { es: "Pin en mapa",         en: "Map pin",           icon: MapPin,        variant: "default"  },
  export:                 { es: "Datos exportados",    en: "Data exported",     icon: Download,      variant: "default"  },
  social_signal_received: { es: "Señal social (auto)", en: "Social signal",     icon: Radio,         variant: "default"  },
  resource_dispatch:      { es: "Despacho recurso",    en: "Resource dispatch", icon: Truck,         variant: "warn"     },
  protocol_step:          { es: "Paso de protocolo",   en: "Protocol step",     icon: ChevronRight,  variant: "default"  },
  field_report:           { es: "Reporte de campo",    en: "Field report",      icon: FileText,      variant: "accent"   },
};

function payloadPreview(entry: DecisionLogEntry): string | null {
  const p = entry.payload;
  if (!p) return null;
  if (typeof p.query === "string")         return p.query.slice(0, 80);
  if (typeof p.note === "string")          return p.note.slice(0, 80);
  if (typeof p.resource_name === "string") return p.resource_name.slice(0, 60);
  if (typeof p.label === "string")         return p.label.slice(0, 60);
  if (p.district && p.source)              return `${p.source} · ${p.district}`;
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DecisionLogPanel() {
  const { activePanel, setActivePanel, locale, addToast } = useUIStore();
  const { data: entries = [], isLoading, isError, dataUpdatedAt, refetch, isFetching } = useDecisionLog(100);
  const { data: health, isError: apiDown } = useApiHealth();
  const online = health?.status === "ok" && !apiDown;

  if (activePanel !== "log") return null;

  const lastUpdateStr = dataUpdatedAt
    ? relativeTime(new Date(dataUpdatedAt).toISOString(), locale)
    : null;

  const panelTitle  = locale === "es" ? "Registro" : "Decision Log";
  const exportLabel = locale === "es" ? "Exportar CSV" : "Export CSV";
  const loadingText = locale === "es" ? "Cargando registro…" : "Loading log…";
  const errorText   = locale === "es" ? "Error al cargar el registro" : "Failed to load log";
  const emptyTitle  = locale === "es" ? "Sin entradas aún" : "No entries yet";
  const emptyBody   = locale === "es"
    ? "El registro de decisiones aparecerá aquí. Cada consulta, reconocimiento y escalada queda registrada de forma inmutable para exportación."
    : "Decision log entries will appear here. Every query, acknowledgement, and escalation is recorded immutably for export.";

  const footerStatus = online
    ? (locale === "es" ? "En vivo · API conectada" : "Live · API connected")
    : (locale === "es" ? "Modo offline · datos locales" : "Offline · local data");

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[62vh] rounded-t-2xl",
        "sm:absolute sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:h-auto sm:w-80 sm:max-w-sm sm:rounded-2xl",
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
        {entries.length > 0 && (
          <span className="text-xs font-mono tabular-nums text-ink-subtle bg-surface-sunken rounded px-1.5 py-0.5 shrink-0">
            {entries.length}
          </span>
        )}

        {/* Refresh */}
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-ink-muted hover:text-ink transition-colors disabled:opacity-40 rounded focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          aria-label={locale === "es" ? "Actualizar" : "Refresh"}
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>

        {/* Export CSV */}
        <Button
          variant="ghost"
          size="xs"
          onClick={async () => {
            if (online) {
              const ok = await downloadAuthenticatedFile(
                "/api/v1/alerts/decision-log/export",
                `costa_resiliente_decision_log_${new Date().toISOString().slice(0, 10)}.csv`,
                "text/csv",
              );
              if (!ok) addToast({ message: locale === "es" ? "Error al exportar CSV — reintenta" : "CSV export failed — please retry", variant: "danger" });
            } else {
              // When offline and query errored, entries are demo/placeholder data.
              // Prefix filename to prevent accidental submission as official record.
              downloadCsv(entries, isError);
            }
          }}
          aria-label={exportLabel}
          className="gap-1"
        >
          <Download size={13} />
          <span className="hidden sm:inline">CSV</span>
        </Button>

        {/* Export PDF (EDAN-Perú report) */}
        {online && (
          <Button
            variant="ghost"
            size="xs"
            onClick={async () => {
              const ok = await downloadAuthenticatedFile(
                "/api/v1/alerts/decision-log/report",
                `costa_resiliente_report_${new Date().toISOString().slice(0, 10)}.pdf`,
                "application/pdf",
              );
              if (!ok) addToast({ message: locale === "es" ? "Error al exportar PDF — reintenta" : "PDF export failed — please retry", variant: "danger" });
            }}
            aria-label={locale === "es" ? "Exportar informe PDF" : "Export PDF report"}
            title={locale === "es" ? "Informe situacional EDAN-Perú (PDF)" : "EDAN-Perú situational report (PDF)"}
            className="gap-1"
          >
            <Download size={13} />
            <span className="hidden sm:inline">PDF</span>
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
        className="flex-1 overflow-y-auto"
        role="list"
        aria-label={locale === "es" ? "Entradas del registro" : "Log entries"}
        aria-live="polite"
        aria-busy={isLoading}
      >
        {isLoading && (
          <li className="px-4 py-10 text-xs text-ink-subtle text-center">
            {loadingText}
          </li>
        )}

        {isError && (
          <li className="px-4 py-8 flex flex-col items-center gap-3" role="alert">
            <div className="text-center space-y-1">
              <span className="text-xs text-danger font-medium block">{errorText}</span>
              {dataUpdatedAt ? (
                <span className="text-[11px] text-ink-muted block">
                  {locale === "es"
                    ? `Último registro: hace ${Math.floor((Date.now() - dataUpdatedAt) / 60_000)}min`
                    : `Last log entry: ${Math.floor((Date.now() - dataUpdatedAt) / 60_000)}min ago`}
                </span>
              ) : !online ? (
                <span className="text-[11px] text-ink-muted block">
                  {locale === "es" ? "API no disponible — revisa los servicios" : "API unavailable — check services"}
                </span>
              ) : null}
            </div>
            <button
              onClick={() => refetch()}
              className="text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              {locale === "es" ? "Reintentar" : "Retry"}
            </button>
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
          const meta = ACTION_META[entry.action_type];
          const Icon = meta?.icon ?? ChevronRight;
          const label = meta ? meta[locale] : entry.action_type.replace(/_/g, " ");
          const variant = meta?.variant ?? "default";
          const preview = payloadPreview(entry);

          return (
            <li
              key={entry.id}
              className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-start gap-2.5">
                {/* Action icon */}
                <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-surface-sunken flex items-center justify-center">
                  <Icon size={12} className="text-ink-muted" aria-hidden="true" />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Action label + alert badge */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Pill variant={variant} className="shrink-0 text-[10px] px-1.5 py-0.5 leading-none">
                      {label}
                    </Pill>
                    {entry.alert_id && (
                      <span className="text-[10px] font-mono text-ink-subtle shrink-0">
                        #{entry.alert_id}
                      </span>
                    )}
                  </div>

                  {/* Payload preview */}
                  {preview && (
                    <p className="text-xs text-ink-muted truncate mt-0.5">{preview}</p>
                  )}

                  {/* Operator · relative time · absolute time */}
                  <p className="text-[10px] font-mono tabular-nums text-ink-subtle mt-1 flex items-center gap-1">
                    <span className="font-sans not-mono">{entry.operator_id}</span>
                    <span aria-hidden="true">·</span>
                    <span title={absoluteTime(entry.logged_at)}>
                      {relativeTime(entry.logged_at, locale)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="opacity-60">{absoluteTime(entry.logged_at)}</span>
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={[
              "inline-block w-1.5 h-1.5 rounded-full",
              online ? "bg-ok" : "bg-border-strong",
            ].join(" ")}
            aria-hidden="true"
          />
          <span className="text-[10px] text-ink-subtle">{footerStatus}</span>
        </div>
        <span className="text-[10px] text-ink-subtle tabular-nums">
          {entries.length > 0 && `${entries.length} · `}
          {lastUpdateStr
            ? `${locale === "es" ? "act." : "upd."} ${lastUpdateStr}`
            : locale === "es" ? "sin datos" : "no data"}
        </span>
      </div>
    </aside>
  );
}
