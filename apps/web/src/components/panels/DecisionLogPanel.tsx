"use client";

import { ClipboardList, Download } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useDecisionLog } from "@/lib/queries";
import { useApiHealth } from "@/lib/queries";
import type { DecisionLogEntry } from "@/lib/api";

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
  query:               { es: "Consulta",          en: "Query" },
  alert_acknowledge:   { es: "Reconoció alerta",  en: "Alert acknowledged" },
  alert_escalate:      { es: "Escaló alerta",     en: "Alert escalated" },
  alert_false_positive:{ es: "Falso positivo",    en: "False positive" },
  alert_close:         { es: "Cerró alerta",      en: "Alert closed" },
  map_pin:             { es: "Pin en mapa",       en: "Map pin" },
  export:              { es: "Exportó datos",     en: "Data exported" },
};

export function DecisionLogPanel() {
  const { activePanel, locale } = useUIStore();
  const { data: entries = [], isLoading, isError } = useDecisionLog(100);
  const { data: health, isError: apiDown } = useApiHealth();
  const online = health?.status === "ok" && !apiDown;

  if (activePanel !== "log") return null;

  const panelTitle = locale === "es" ? "Registro" : "Decision Log";
  const exportLabel = locale === "es" ? "Exportar registro a CSV" : "Export log to CSV";
  const loadingText = locale === "es" ? "Cargando registro…" : "Loading log…";
  const errorText = locale === "es" ? "Error al cargar registro" : "Failed to load log";
  const emptyText = locale === "es"
    ? "El registro de decisiones aparecerá aquí. Cada consulta, reconocimiento y escalada queda registrada de forma inmutable para exportación EDAN-Perú."
    : "Decision log entries will appear here. Every query, acknowledgement, and escalation is recorded immutably for EDAN-Peru export.";
  const footerText = locale === "es" ? "Registro append-only · Exportación EDAN-Perú" : "Append-only log · EDAN-Peru export";

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[62vh] rounded-t-2xl",
        "sm:absolute sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:h-auto sm:w-80 sm:max-w-sm sm:rounded-xl",
        "bg-surface-raised border border-slate-700 shadow-xl z-20 flex flex-col",
      ].join(" ")}
      aria-label={locale === "es" ? "Registro de decisiones" : "Decision log"}
    >
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-slate-600" />
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <ClipboardList size={15} className="text-costa-500" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">{panelTitle}</h2>
        {online ? (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/alerts/decision-log/export`}
            download
            className="ml-auto text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs rounded focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none"
            aria-label={exportLabel}
          >
            <Download size={13} /> CSV
          </a>
        ) : (
          <button
            onClick={() => downloadCsv(entries)}
            className="ml-auto text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs rounded focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none"
            aria-label={exportLabel}
          >
            <Download size={13} /> CSV
          </button>
        )}
      </div>

      <ul
        className="flex-1 overflow-y-auto divide-y divide-slate-700/50"
        role="list"
        aria-label={locale === "es" ? "Entradas del registro de decisiones" : "Decision log entries"}
        aria-live="polite"
        aria-busy={isLoading}
      >
        {isLoading && (
          <li className="px-4 py-8 text-xs text-slate-400 text-center" aria-live="polite">{loadingText}</li>
        )}
        {isError && (
          <li className="px-4 py-8 text-xs text-red-400 text-center" role="alert">{errorText}</li>
        )}
        {!isLoading && !isError && entries.length === 0 && (
          <li className="px-4 py-8 text-xs text-slate-400 text-center">{emptyText}</li>
        )}
        {entries.map((entry) => {
          const actionEntry = ACTION_LABELS[entry.action_type];
          const label = actionEntry ? actionEntry[locale] : entry.action_type.replace(/_/g, " ");
          const preview = entry.payload?.query
            ? String(entry.payload.query).slice(0, 60)
            : entry.payload?.note
              ? String(entry.payload.note).slice(0, 60)
              : null;

          return (
            <li key={entry.id} className="px-4 py-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{label}</p>
                  {preview && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">{preview}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">
                    {entry.operator_id} · {timeStamp(entry.logged_at)}
                  </p>
                </div>
                {entry.alert_id && (
                  <span className="shrink-0 text-xs text-slate-400">
                    #{entry.alert_id}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="px-4 py-2 border-t border-slate-700 text-xs text-slate-400 text-center">
        {footerText}
      </div>
    </aside>
  );
}
