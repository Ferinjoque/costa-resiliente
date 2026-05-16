"use client";

import { Map, Bell, Search, ClipboardList, Info, Languages, Link2, BarChart3 } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAlerts } from "@/lib/queries";
import { clsx } from "clsx";
import type { Locale } from "@/store/ui";

const NAV_ITEMS = [
  { id: "map",       label: { es: "Mapa",      en: "Map" },      icon: Map },
  { id: "alerts",    label: { es: "Alertas",   en: "Alerts" },   icon: Bell },
  { id: "dashboard", label: { es: "Datos",     en: "Data" },     icon: BarChart3 },
  { id: "ask",       label: { es: "Consultar", en: "Ask" },      icon: Search },
  { id: "log",       label: { es: "Registro",  en: "Log" },      icon: ClipboardList },
] as const;

type PanelId = (typeof NAV_ITEMS)[number]["id"] | "sources" | "share";

function NavButton({
  id,
  label,
  icon: Icon,
  active,
  onClick,
  mobile,
  className: extraClass,
}: {
  id: string;
  label: string;
  icon: typeof Map;
  active: boolean;
  onClick: () => void;
  mobile?: boolean;
  className?: string;
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
          ? "flex-col gap-0.5 h-full text-[10px] w-full"
          : "w-10 h-10",
        active ? "bg-costa-700 text-white" : "text-slate-400 hover:text-white",
        extraClass,
      )}
    >
      <Icon size={mobile ? 20 : 18} aria-hidden="true" />
      {mobile && <span className="leading-none">{label}</span>}
    </button>
  );
}

export function LeftRail() {
  const { activePanel, setActivePanel, locale, setLocale } = useUIStore();
  const { data: alerts = [] } = useAlerts();
  const activeAlertCount = alerts.filter((a) => a.status === "active").length;

  const handleNav = (id: PanelId) => setActivePanel(id);
  const toggleLocale = () => setLocale(locale === "es" ? "en" : "es");

  return (
    <>
      {/* ── Desktop: vertical left rail ──────────────────────────────────── */}
      <nav
        className="hidden sm:flex flex-col items-center bg-surface-raised border-r border-slate-700 w-14 py-3 gap-1 z-10 shrink-0"
        aria-label={locale === "es" ? "Navegación principal" : "Main navigation"}
      >
        {/* Logo */}
        <div
          className="mb-4 w-8 h-8 rounded bg-costa-500 flex items-center justify-center text-white font-bold text-xs select-none"
          aria-hidden="true"
        >
          CR
        </div>

        {NAV_ITEMS.map(({ id, label, icon }) => (
          <div key={id} className="relative">
            <NavButton
              id={id}
              label={label[locale]}
              icon={icon}
              active={activePanel === id}
              onClick={() => handleNav(id)}
            />
            {id === "alerts" && activeAlertCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 pointer-events-none"
                aria-label={`${activeAlertCount} ${locale === "es" ? "alertas activas" : "active alerts"}`}
              >
                {activeAlertCount > 9 ? "9+" : activeAlertCount}
              </span>
            )}
          </div>
        ))}

        <div className="mt-auto flex flex-col gap-1">
          {/* Share */}
          <button
            onClick={() => handleNav("share")}
            aria-label={locale === "es" ? "Compartir escenario" : "Share scenario"}
            aria-pressed={activePanel === "share"}
            title={locale === "es" ? "Compartir" : "Share"}
            className={clsx(
              "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
              "hover:bg-surface-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-costa-500",
              activePanel === "share" ? "bg-costa-700 text-white" : "text-slate-400 hover:text-white",
            )}
          >
            <Link2 size={18} aria-hidden="true" />
          </button>

          {/* About this data */}
          <button
            onClick={() => handleNav("sources")}
            aria-label={locale === "es" ? "Sobre los datos" : "About this data"}
            aria-pressed={activePanel === "sources"}
            title={locale === "es" ? "Sobre los datos" : "About this data"}
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
        aria-label={locale === "es" ? "Navegación principal" : "Main navigation"}
      >
        {NAV_ITEMS.map(({ id, label, icon }) => (
          <div key={id} className="relative flex-1 h-full">
            <NavButton
              id={id}
              label={label[locale]}
              icon={icon}
              active={activePanel === id}
              onClick={() => handleNav(id)}
              mobile
            />
            {id === "alerts" && activeAlertCount > 0 && (
              <span
                className="absolute top-1 right-2 min-w-[15px] h-[15px] bg-red-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 pointer-events-none"
                aria-hidden="true"
              >
                {activeAlertCount > 9 ? "9+" : activeAlertCount}
              </span>
            )}
          </div>
        ))}
        <button
          onClick={() => handleNav("sources")}
          aria-label={locale === "es" ? "Sobre los datos" : "About data"}
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
