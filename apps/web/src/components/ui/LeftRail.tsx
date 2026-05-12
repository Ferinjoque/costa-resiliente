"use client";

import { Map, Bell, Search, ClipboardList, Settings } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { clsx } from "clsx";

const NAV_ITEMS = [
  { id: "map",      label: "Mapa",          icon: Map },
  { id: "alerts",   label: "Alertas",       icon: Bell },
  { id: "ask",      label: "Consultar",     icon: Search },
  { id: "log",      label: "Registro",      icon: ClipboardList },
] as const;

type PanelId = (typeof NAV_ITEMS)[number]["id"];

export function LeftRail() {
  const { activePanel, setActivePanel } = useUIStore();

  return (
    <nav
      className="relative flex flex-col items-center bg-surface-raised border-r border-slate-700 w-14 py-3 sm:py-4 gap-1 z-10"
      aria-label="Navegación principal"
    >
      {/* Logo */}
      <div className="mb-4 w-8 h-8 rounded bg-costa-500 flex items-center justify-center text-white font-bold text-xs">
        CR
      </div>

      {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActivePanel(id as PanelId)}
          aria-label={label}
          aria-pressed={activePanel === id}
          className={clsx(
            "w-10 h-10 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center transition-colors",
            "hover:bg-surface-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-costa-500",
            activePanel === id
              ? "bg-costa-700 text-white"
              : "text-slate-400 hover:text-white"
          )}
          title={label}
        >
          <Icon size={18} />
        </button>
      ))}

      <div className="mt-auto">
        <button
          aria-label="Configuración"
          className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-surface-panel transition-colors"
        >
          <Settings size={18} />
        </button>
      </div>
    </nav>
  );
}
