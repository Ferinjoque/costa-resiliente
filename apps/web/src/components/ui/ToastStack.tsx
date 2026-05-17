"use client";

import { useEffect } from "react";
import { Radio, X } from "lucide-react";
import { useUIStore } from "@/store/ui";

const LABEL_ES: Record<string, string> = {
  needs_help:            "Ayuda urgente",
  road_blocked:          "Vía bloqueada",
  infrastructure_damage: "Daño en infraestructura",
  weather_observation:   "Observación meteorológica",
};

const SOURCE_COLOR: Record<string, string> = {
  bluesky:  "text-costa-400",
  telegram: "text-costa-400",
  reddit:   "text-severity-high",
};

function Toast({ id, source, label, district }: { id: string; source: string; label: string; district: string }) {
  const { removeToast, locale } = useUIStore();

  useEffect(() => {
    const t = setTimeout(() => removeToast(id), 6_000);
    return () => clearTimeout(t);
  }, [id, removeToast]);

  const labelText = locale === "es" ? (LABEL_ES[label] ?? label) : label.replace(/_/g, " ");

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
          <span className={SOURCE_COLOR[source] ?? "text-ink-subtle"}>{source}</span>
          {" · "}{district}
        </p>
      </div>
      <button
        onClick={() => removeToast(id)}
        className="shrink-0 text-ink-subtle hover:text-paper transition-colors mt-0.5"
        aria-label="Cerrar notificación"
      >
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
          <Toast id={t.id} source={t.source} label={t.label} district={t.district} />
        </div>
      ))}
    </div>
  );
}
