"use client";

import { ClipboardList, Download } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useDecisionLog } from "@/lib/queries";
import { decisionLogCsvUrl } from "@/lib/api";

function timeStamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_LABELS: Record<string, string> = {
  query: "Consulta",
  alert_acknowledge: "Reconoció alerta",
  alert_escalate: "Escaló alerta",
  alert_false_positive: "Falso positivo",
  alert_close: "Cerró alerta",
  map_pin: "Pin en mapa",
  export: "Exportó datos",
};

export function DecisionLogPanel() {
  const { activePanel } = useUIStore();
  const { data: entries = [], isLoading, isError } = useDecisionLog(100);

  if (activePanel !== "log") return null;

  return (
    <aside
      className="absolute top-4 right-4 bottom-4 w-80 bg-surface-raised border border-slate-700 rounded-xl shadow-xl z-20 flex flex-col"
      aria-label="Registro de decisiones"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <ClipboardList size={15} className="text-costa-500" />
        <h2 className="text-sm font-semibold text-white">Registro</h2>
        <a
          href={decisionLogCsvUrl()}
          download
          className="ml-auto text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs"
          aria-label="Exportar registro a CSV"
        >
          <Download size={13} /> CSV
        </a>
      </div>

      <ul className="flex-1 overflow-y-auto divide-y divide-slate-700/50">
        {isLoading && (
          <li className="px-4 py-8 text-xs text-slate-500 text-center">Cargando registro…</li>
        )}
        {isError && (
          <li className="px-4 py-8 text-xs text-red-400 text-center">Error al cargar registro</li>
        )}
        {!isLoading && !isError && entries.length === 0 && (
          <li className="px-4 py-8 text-xs text-slate-500 text-center">
            El registro de decisiones aparecerá aquí.
            <br />
            <br />
            Cada consulta, reconocimiento y escalada queda registrada de forma
            inmutable para exportación EDAN-Perú.
          </li>
        )}
        {entries.map((entry) => {
          const label = ACTION_LABELS[entry.action_type] ?? entry.action_type;
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
                  <p className="text-xs text-slate-600 mt-0.5">
                    {entry.operator_id} · {timeStamp(entry.logged_at)}
                  </p>
                </div>
                {entry.alert_id && (
                  <span className="shrink-0 text-xs text-slate-500">
                    #{entry.alert_id}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="px-4 py-2 border-t border-slate-700 text-xs text-slate-500 text-center">
        Registro append-only · Exportación EDAN-Perú
      </div>
    </aside>
  );
}
