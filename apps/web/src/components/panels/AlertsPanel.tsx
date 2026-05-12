"use client";

import { Bell, CheckCircle, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";

const MOCK_ALERTS = [
  {
    id: 1,
    type: "flood",
    severity: "critical" as const,
    title: "Desborde detectado en Rímac km 38",
    district: "Lurigancho",
    time: "hace 12 min",
    status: "active",
  },
  {
    id: 2,
    type: "huayco",
    severity: "high" as const,
    title: "Huayco activo en Quebrada Pedregal",
    district: "Chosica",
    time: "hace 34 min",
    status: "active",
  },
  {
    id: 3,
    type: "social",
    severity: "medium" as const,
    title: "15 señales: piden ayuda en Comas",
    district: "Comas",
    time: "hace 1h",
    status: "acknowledged",
  },
];

export function AlertsPanel() {
  const { activePanel } = useUIStore();
  if (activePanel !== "alerts") return null;

  return (
    <aside
      className="absolute top-4 right-4 bottom-4 w-80 bg-surface-raised border border-slate-700 rounded-xl shadow-xl z-20 flex flex-col"
      aria-label="Feed de alertas"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <Bell size={15} className="text-costa-500" />
        <h2 className="text-sm font-semibold text-white">Alertas</h2>
        <span className="ml-auto bg-severity-critical text-white text-xs px-1.5 py-0.5 rounded-full">
          {MOCK_ALERTS.filter((a) => a.status === "active").length}
        </span>
      </div>

      <ul className="flex-1 overflow-y-auto divide-y divide-slate-700/50">
        {MOCK_ALERTS.map((alert) => (
          <li key={alert.id} className="px-4 py-3 hover:bg-surface-panel transition-colors">
            <div className="flex items-start gap-2">
              <span
                className="severity-dot mt-1"
                data-severity={alert.severity}
                aria-label={`Severidad: ${alert.severity}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{alert.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {alert.district} · {alert.time}
                </p>
              </div>
              {alert.status === "active" ? (
                <button
                  className="shrink-0 text-slate-400 hover:text-green-400 transition-colors"
                  aria-label="Reconocer alerta"
                >
                  <CheckCircle size={15} />
                </button>
              ) : (
                <AlertTriangle size={14} className="shrink-0 text-slate-600" />
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="px-4 py-2 border-t border-slate-700 text-xs text-slate-500 text-center">
        Datos de ejemplo — Sprint 4 activa feeds reales
      </div>
    </aside>
  );
}
