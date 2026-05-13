"use client";

import { Map, Bell, Search, ClipboardList, Info, Languages } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { clsx } from "clsx";
import type { Locale } from "@/store/ui";

const NAV_ITEMS = [
  { id: "map",     label: "Mapa",      icon: Map },
  { id: "alerts",  label: "Alertas",   icon: Bell },
  { id: "ask",     label: "Consultar", icon: Search },
  { id: "log",     label: "Registro",  icon: ClipboardList },
] as const;

type PanelId = (typeof NAV_ITEMS)[number]["id"] | "sources";

function NavButton({
  id,
  label,
  icon: Icon,
  active,
  onClick,
  mobile,
}: {
  id: string;
  label: string;
  icon: typeof Map;
  active: boolean;
  onClick: () => void;
  mobile?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={clsx(
        "flex items-center justify-center rounded-lg transition-colors",
        "hover:bg-surface-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-costa-500",
        mobile
          ? "flex-col gap-0.5 flex-1 h-full text-[10px]"
          : "w-10 h-10",
        active ? "bg-costa-700 text-white" : "text-slate-400 hover:text-white",
      )}
    >
      <Icon size={mobile ? 20 : 18} aria-hidden="true" />
      {mobile && <span className="leading-none">{label}</span>}
    </button>
  );
}

export function LeftRail() {
  const { activePanel, setActivePanel, locale, setLocale } = useUIStore();

  const handleNav = (id: PanelId) => setActivePanel(id);
  const toggleLocale = () => setLocale(locale === "es" ? "en" : "es");

  return (
    <>
      {/* ── Desktop: vertical left rail ──────────────────────────────────── */}
      <nav
        className="hidden sm:flex flex-col items-center bg-surface-raised border-r border-slate-700 w-14 py-3 gap-1 z-10 shrink-0"
        aria-label="Navegación principal"
      >
        {/* Logo */}
        <div
          className="mb-4 w-8 h-8 rounded bg-costa-500 flex items-center justify-center text-white font-bold text-xs select-none"
          aria-hidden="true"
        >
          CR
        </div>

        {NAV_ITEMS.map(({ id, label, icon }) => (
          <NavButton
            key={id}
            id={id}
            label={label}
            icon={icon}
            active={activePanel === id}
            onClick={() => handleNav(id)}
          />
        ))}

        <div className="mt-auto flex flex-col gap-1">
          {/* About this data */}
          <button
            onClick={() => handleNav("sources")}
            aria-label="Sobre los datos"
            aria-pressed={activePanel === "sources"}
            title="Sobre los datos"
            className={clsx(
              "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
              "hover:bg-surface-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-costa-500",
              activePanel === "sources" ? "bg-costa-700 text-white" : "text-slate-400 hover:text-white",
            )}
          >
            <Info size={18} aria-hidden="true" />
          </button>

          {/* Language toggle */}
          <button
            onClick={toggleLocale}
            aria-label={locale === "es" ? "Switch to English" : "Cambiar a Español"}
            title={locale === "es" ? "EN" : "ES"}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-surface-panel transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-costa-500"
          >
            <Languages size={18} aria-hidden="true" />
          </button>
        </div>
      </nav>

      {/* ── Mobile: horizontal bottom tab bar ────────────────────────────── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 h-14 bg-surface-raised border-t border-slate-700 flex items-stretch z-30 safe-area-inset-bottom"
        aria-label="Navegación principal"
      >
        {NAV_ITEMS.map(({ id, label, icon }) => (
          <NavButton
            key={id}
            id={id}
            label={label}
            icon={icon}
            active={activePanel === id}
            onClick={() => handleNav(id)}
            mobile
          />
        ))}
        <button
          onClick={() => handleNav("sources")}
          aria-label="Sobre los datos"
          aria-pressed={activePanel === "sources"}
          className={clsx(
            "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] transition-colors rounded-lg",
            activePanel === "sources" ? "bg-costa-700 text-white" : "text-slate-400 hover:text-white hover:bg-surface-panel",
          )}
        >
          <Info size={20} aria-hidden="true" />
          <span className="leading-none">Info</span>
        </button>
      </nav>
    </>
  );
}
