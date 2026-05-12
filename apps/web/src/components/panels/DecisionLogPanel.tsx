"use client";

import { ClipboardList, Download } from "lucide-react";
import { useUIStore } from "@/store/ui";

export function DecisionLogPanel() {
  const { activePanel } = useUIStore();
  if (activePanel !== "log") return null;

  return (
    <aside
      className="absolute top-4 right-4 bottom-4 w-80 bg-surface-raised border border-slate-700 rounded-xl shadow-xl z-20 flex flex-col"
      aria-label="Registro de decisiones"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <ClipboardList size={15} className="text-costa-500" />
        <h2 className="text-sm font-semibold text-white">Registro</h2>
        <button
          className="ml-auto text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs"
          aria-label="Exportar registro a CSV"
        >
          <Download size={13} /> CSV
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs text-slate-500 text-center mt-8">
          El registro de decisiones de operadores aparecerá aquí.
          <br />
          <br />
          Cada consulta, reconocimiento y escalada queda registrada de forma
          inmutable para exportación EDAN-Perú.
        </p>
      </div>

      <div className="px-4 py-2 border-t border-slate-700 text-xs text-slate-500 text-center">
        Registro append-only · Sprints 5–6
      </div>
    </aside>
  );
}
