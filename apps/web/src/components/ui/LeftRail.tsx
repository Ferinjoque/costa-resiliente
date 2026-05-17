"use client";

import {
  Map as MapIcon,
  Bell,
  Radio,
  BarChart3,
  MessageSquare,
  ClipboardList,
  Link2,
  Database,
  HelpCircle,
  Globe2,
} from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAlerts, useSocialSignals } from "@/lib/queries";
import { clsx } from "clsx";
import { Badge } from "@/components/ui/primitives";

// ─── Felt-style sidebar ───────────────────────────────────────────────────────
// Light cream panel on the left. The map is to the right. Solid, no glass.
// Inspiration: felt.com, Mapbox Studio, Linear sidebar.

type PanelId = "map" | "alerts" | "social" | "dashboard" | "ask" | "log"
             | "sources" | "share";

interface NavItem {
  id: Exclude<PanelId, "sources" | "share">;
  label: { es: string; en: string };
  shortcut: string;
  Icon: typeof MapIcon;
}

const NAV: NavItem[] = [
  { id: "map",       label: { es: "Mapa",      en: "Map"    }, shortcut: "M", Icon: MapIcon      },
  { id: "alerts",    label: { es: "Alertas",   en: "Alerts" }, shortcut: "A", Icon: Bell         },
  { id: "social",    label: { es: "Social",    en: "Social" }, shortcut: "S", Icon: Radio        },
  { id: "dashboard", label: { es: "Resumen",   en: "Summary"}, shortcut: "D", Icon: BarChart3    },
  { id: "ask",       label: { es: "Consultar", en: "Ask"    }, shortcut: "C", Icon: MessageSquare},
  { id: "log",       label: { es: "Registro",  en: "Log"    }, shortcut: "L", Icon: ClipboardList},
];

export function LeftRail() {
  const { activePanel, setActivePanel, locale, setLocale, setTutorialOpen } = useUIStore();
  const { data: alerts = [] } = useAlerts();
  const { data: socialData } = useSocialSignals(48);

  const alertBadge = alerts.filter((a) => a.status === "active").length;
  const socialBadge = (socialData?.features ?? []).filter(
    (f) => f.properties.triage_label === "needs_help" || f.properties.triage_label === "road_blocked",
  ).length;

  const toggleLocale = () => setLocale(locale === "es" ? "en" : "es");

  return (
    <>
      {/* ── Desktop: left sidebar ──────────────────────────────────────── */}
      <aside
        className="hidden sm:flex flex-col bg-surface border-r border-border-strong w-[220px] shrink-0 z-20"
        style={{ boxShadow: "1px 0 0 0 oklch(88% 0.007 80)" }}
        aria-label={locale === "es" ? "Navegación principal" : "Main navigation"}
      >
        {/* Brand mark */}
        <div className="px-5 pt-5 pb-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            {/* Logo mark — simple circle with initial */}
            <div className="w-7 h-7 rounded-full bg-danger flex items-center justify-center shrink-0">
              <span className="text-surface text-xs font-bold leading-none">CR</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink tracking-tight leading-none">
                Costa Resiliente
              </p>
              <p className="text-2xs text-ink-subtle mt-0.5">Lima Metropolitana</p>
            </div>
          </div>
        </div>

        {/* Primary nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto" aria-label="Primary navigation">
          <ul className="space-y-0.5" role="list">
            {NAV.map(({ id, label, shortcut, Icon }) => {
              const active = activePanel === id;
              const badge = id === "alerts" ? alertBadge : id === "social" ? socialBadge : 0;
              return (
                <li key={id}>
                  <button
                    id={`driver-nav-${id}`}
                    onClick={() => setActivePanel(id)}
                    aria-label={`${label[locale]} [${shortcut}]`}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors text-left",
                      active
                        ? "bg-surface-hover text-ink font-medium"
                        : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                    )}
                  >
                    {/* Active indicator */}
                    <span
                      className={clsx(
                        "absolute left-2 w-0.5 h-5 rounded-full transition-all",
                        active ? "bg-accent opacity-100" : "opacity-0",
                      )}
                      aria-hidden="true"
                    />
                    <Icon
                      size={16}
                      strokeWidth={active ? 2 : 1.75}
                      className={clsx(
                        "shrink-0 transition-colors",
                        active ? "text-ink" : "text-ink-subtle",
                      )}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate">{label[locale]}</span>
                    {badge > 0 && <Badge count={badge} variant="danger" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Secondary nav */}
        <div className="px-2 pb-3 border-t border-border-subtle pt-2">
          <SecBtn
            Icon={Link2}
            label={locale === "es" ? "Compartir" : "Share"}
            active={activePanel === "share"}
            onClick={() => setActivePanel("share")}
          />
          <SecBtn
            Icon={Database}
            label={locale === "es" ? "Fuentes de datos" : "Data sources"}
            active={activePanel === "sources"}
            onClick={() => setActivePanel("sources")}
          />
          <SecBtn
            Icon={HelpCircle}
            label={locale === "es" ? "Tutorial" : "Tutorial"}
            active={false}
            onClick={() => setTutorialOpen(true)}
          />
          <SecBtn
            Icon={Globe2}
            label={locale === "es" ? "English" : "Español"}
            active={false}
            onClick={toggleLocale}
          />
        </div>
      </aside>

      {/* ── Mobile: bottom tab bar ─────────────────────────────────────── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 h-14 bg-surface border-t border-border-strong flex items-stretch z-30"
        style={{ boxShadow: "0 -1px 0 oklch(88% 0.007 80)" }}
        aria-label={locale === "es" ? "Navegación" : "Navigation"}
      >
        {NAV.slice(0, 5).map(({ id, label, Icon }) => {
          const active = activePanel === id;
          const badge = id === "alerts" ? alertBadge : id === "social" ? socialBadge : 0;
          return (
            <button
              key={id}
              onClick={() => setActivePanel(id)}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors",
                active ? "text-ink" : "text-ink-muted",
              )}
            >
              {/* Top indicator */}
              <span
                className={clsx(
                  "absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-b-full transition-all",
                  active ? "w-8 bg-accent" : "w-0",
                )}
                aria-hidden="true"
              />
              <Icon size={18} strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
              <span className="text-2xs font-medium">{label[locale]}</span>
              {badge > 0 && (
                <span className="absolute top-1 right-3">
                  <Badge count={badge} variant="danger" />
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}

function SecBtn({
  Icon,
  label,
  active,
  onClick,
}: {
  Icon: typeof HelpCircle;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-3 px-3 py-1.5 rounded-xl text-xs transition-colors",
        active
          ? "bg-surface-hover text-ink font-medium"
          : "text-ink-subtle hover:bg-surface-hover hover:text-ink-muted",
      )}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
