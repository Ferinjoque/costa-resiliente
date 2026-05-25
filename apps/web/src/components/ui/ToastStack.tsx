"use client";

import { useEffect } from "react";
import { Radio, X, CheckCircle, Info, AlertTriangle, XCircle } from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
import type { LiveToast as LiveToastType } from "@/store/ui";

const LABEL_ES: Record<string, string> = {
  needs_help:            "Ayuda urgente",
  road_blocked:          "Vía bloqueada",
  huayco_observation:    "Avistamiento de huayco",
  flood_observation:     "Avistamiento de inundación",
  infrastructure_damage: "Daño en infraestructura",
  weather_observation:   "Observación meteorológica",
};

const SOURCE_COLOR: Record<string, string> = {
  bluesky:  "text-costa-400",
  telegram: "text-costa-400",
  reddit:   "text-severity-high",
};

function Toast({ toast }: { toast: LiveToastType }) {
  const { removeToast, locale } = useUIStore();
  const { id, source, label, district, message, variant } = toast;

  useEffect(() => {
    const duration = variant ? 4_000 : 6_000;
    const t = setTimeout(() => removeToast(id), duration);
    return () => clearTimeout(t);
  }, [id, removeToast, variant]);

  // General action confirmation variant
  if (message) {
    const Icon =
      variant === "success" ? CheckCircle :
      variant === "warn"    ? AlertTriangle :
      variant === "danger"  ? XCircle : Info;
    const iconClass =
      variant === "success" ? "text-ok-muted" :
      variant === "warn"    ? "text-warn-muted" :
      variant === "danger"  ? "text-danger" : "text-accent";
    return (
      <div
        className={clsx(
          "flex items-center gap-2.5 bg-surface border rounded-xl px-3 py-2.5 shadow-2xl w-64 text-xs animate-slide-in-right",
          variant === "success" ? "border-ok/30" :
          variant === "warn"    ? "border-warn/30" :
          variant === "danger"  ? "border-danger/40" : "border-border",
        )}
        role={variant === "danger" ? "alert" : "status"}
        aria-live={variant === "danger" ? "assertive" : "polite"}
      >
        <Icon size={14} className={clsx("shrink-0", iconClass)} aria-hidden="true" />
        <p className="flex-1 text-ink font-medium leading-snug">{message}</p>
        <button onClick={() => removeToast(id)} className="shrink-0 text-ink-subtle hover:text-ink transition-colors" aria-label="Cerrar">
          <X size={11} />
        </button>
      </div>
    );
  }

  // Social signal variant (original)
  const labelText = locale === "es" ? (LABEL_ES[label ?? ""] ?? label) : (label ?? "").replace(/_/g, " ");
  return (
    <div
      className="flex items-start gap-2 bg-surface border border-border rounded-xl px-3 py-2 shadow-2xl w-64 text-xs animate-slide-in-right"
      role="status"
      aria-live="polite"
    >
      <Radio size={13} className="text-costa-400 mt-0.5 shrink-0 animate-pulse" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-paper font-medium leading-snug truncate">{labelText}</p>
        <p className="text-ink-subtle mt-0.5 truncate">
          <span className={SOURCE_COLOR[source ?? ""] ?? "text-ink-subtle"}>{source}</span>
          {" · "}{district}
        </p>
      </div>
      <button onClick={() => removeToast(id)} className="shrink-0 text-ink-subtle hover:text-paper transition-colors mt-0.5" aria-label="Cerrar notificación">
        <X size={11} />
      </button>
    </div>
  );
}

export function ToastStack() {
  const { toasts } = useUIStore();

  if (!toasts.length) return null;

  return (
    <div
      className="fixed bottom-20 right-3 sm:bottom-12 sm:right-4 z-50 flex flex-col gap-2 pointer-events-none"
      aria-label="Notificaciones en vivo"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} />
        </div>
      ))}
    </div>
  );
}
