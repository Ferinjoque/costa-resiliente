"use client";

import { Bell, CheckCircle, AlertTriangle, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
import { useAlerts } from "@/lib/queries";
import { actOnAlert } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import type { Alert } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

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


function AlertRow({ alert }: { alert: Alert }) {
  const qc = useQueryClient();
  const Icon = TYPE_ICON[alert.type] ?? Bell;

  async function handleAck() {
    try {
      await actOnAlert(alert.id, "acknowledge", OPERATOR_ID);
      qc.invalidateQueries({ queryKey: ["alerts"] });
    } catch {
      // best-effort
    }
  }

  return (
    <li className="px-4 py-3 hover:bg-surface-panel transition-colors">
      <div className="flex items-start gap-2">
        <span
          className={clsx("mt-1 h-2 w-2 rounded-full shrink-0", SEVERITY_DOT[alert.severity] ?? "bg-slate-400")}
          aria-label={`Severidad: ${alert.severity}`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{alert.title}</p>
          <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5">
            <Icon size={11} />
            <span className="capitalize">{alert.type.replace("_", " ")}</span>
            <span>·</span>
            <span>{timeAgo(alert.created_at)}</span>
          </p>
        </div>
        {alert.status === "active" ? (
          <button
            onClick={handleAck}
            className="shrink-0 text-slate-400 hover:text-green-400 transition-colors"
            aria-label="Reconocer alerta"
            title="Reconocer"
          >
            <CheckCircle size={15} />
          </button>
        ) : (
          <span className="text-xs text-slate-400 shrink-0 capitalize">{alert.status}</span>
        )}
      </div>
    </li>
  );
}

export function AlertsPanel() {
  const { activePanel } = useUIStore();
  const { data: alerts = [], isLoading, isError, dataUpdatedAt } = useAlerts();

  if (activePanel !== "alerts") return null;

  const activeCount = alerts.filter((a) => a.status === "active").length;

  return (
    <aside
      className={[
        // Mobile: bottom sheet above the tab bar
        "fixed bottom-14 left-0 right-0 h-[62vh] rounded-t-2xl",
        // Desktop: right panel
        "sm:absolute sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:h-auto sm:w-80 sm:max-w-sm sm:rounded-xl",
        // Common
        "bg-surface-raised border border-slate-700 shadow-xl z-20 flex flex-col",
      ].join(" ")}
      aria-label="Feed de alertas"
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-slate-600" />
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <Bell size={15} className="text-costa-500" />
        <h2 className="text-sm font-semibold text-white">Alertas</h2>
        {activeCount > 0 && (
          <span className="ml-auto bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">
            {activeCount}
          </span>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto divide-y divide-slate-700/50">
        {isLoading && (
          <li className="px-4 py-8 text-xs text-slate-400 text-center">Cargando alertas…</li>
        )}
        {isError && (
          <li className="px-4 py-8 text-xs text-red-400 text-center">Error al cargar alertas</li>
        )}
        {!isLoading && !isError && alerts.length === 0 && (
          <li className="px-4 py-8 text-xs text-slate-400 text-center">
            No hay alertas activas
          </li>
        )}
        {alerts.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </ul>

      <div className="px-4 py-2 border-t border-slate-700 text-xs text-slate-400 text-center">
        {dataUpdatedAt ? `Actualizado ${timeAgo(new Date(dataUpdatedAt).toISOString())}` : "Actualización cada 30 s"}
      </div>
    </aside>
  );
}
