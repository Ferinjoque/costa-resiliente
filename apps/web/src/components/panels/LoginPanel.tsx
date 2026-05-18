"use client";

import { useState, useEffect } from "react";
import { Shield, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";

const ROLE_LABEL: Record<string, { es: string; badge: string }> = {
  coen:  { es: "COEN — Nacional",         badge: "COEN"  },
  coer:  { es: "COER Lima — Regional",     badge: "COER"  },
  coel:  { es: "COEL — Distrital",         badge: "COEL"  },
};

const DEMO_HINTS = [
  { username: "coer_lima", role: "COER",  note: "Lima Metropolitana" },
  { username: "coen_lima", role: "COEN",  note: "Nacional" },
  { username: "coel_sjl",  role: "COEL",  note: "San Juan de Lurigancho" },
];

export function LoginPanel() {
  const { operator, token, login, hydrate } = useAuthStore();
  const { locale } = useUIStore();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!open) {
    if (operator) return null; // logged in — chip shown in LeftRail, not here
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex fixed top-3 right-3 z-40 items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-xs text-ink-muted hover:text-ink hover:border-border-strong transition-colors shadow-sm"
        aria-label={locale === "es" ? "Iniciar sesión" : "Log in"}
      >
        <Shield size={12} aria-hidden="true" />
        {locale === "es" ? "Iniciar sesión" : "Log in"}
      </button>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password.trim()) {
      setError(locale === "es" ? "Completa todos los campos." : "Fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
      setOpen(false);
      setUsername("");
      setPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg.includes("401") || msg.toLowerCase().includes("usuario")
          ? locale === "es" ? "Usuario o contraseña incorrectos." : "Invalid username or password."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(u: string) {
    setUsername(u);
    setPassword("demo1234");
    setError(null);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-ink/30"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={locale === "es" ? "Acceso de operadores" : "Operator login"}
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] bg-surface rounded-2xl shadow-panel border border-border-strong overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-danger flex items-center justify-center shrink-0">
              <span className="text-surface text-xs font-bold leading-none">CR</span>
            </div>
            <p className="text-sm font-semibold text-ink">Costa Resiliente</p>
          </div>
          <p className="text-xs text-ink-subtle">
            {locale === "es" ? "Acceso para operadores SINAGERD" : "SINAGERD operator access"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs text-ink-muted mb-1" htmlFor="cr-username">
              {locale === "es" ? "Usuario" : "Username"}
            </label>
            <input
              id="cr-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-surface border border-border rounded-xl text-sm text-ink px-3 py-2 focus:outline-none focus:border-border-strong"
              placeholder="coer_lima"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-muted mb-1" htmlFor="cr-password">
              {locale === "es" ? "Contraseña" : "Password"}
            </label>
            <div className="relative">
              <input
                id="cr-password"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl text-sm text-ink px-3 py-2 pr-9 focus:outline-none focus:border-border-strong"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink transition-colors"
                aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink text-surface rounded-xl py-2 text-sm font-medium hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {loading
              ? (locale === "es" ? "Verificando…" : "Verifying…")
              : (locale === "es" ? "Ingresar" : "Log in")}
          </button>
        </form>

        {/* Demo accounts */}
        <div className="px-6 pb-5">
          <p className="text-2xs text-ink-subtle mb-2">
            {locale === "es" ? "Cuentas de demostración (contraseña: demo1234):" : "Demo accounts (password: demo1234):"}
          </p>
          <div className="flex flex-col gap-1">
            {DEMO_HINTS.map(({ username: u, role, note }) => (
              <button
                key={u}
                type="button"
                onClick={() => fillDemo(u)}
                className="flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-hover transition-colors group"
              >
                <span className="text-2xs font-mono font-semibold text-accent w-10 shrink-0">{role}</span>
                <span className="text-2xs text-ink font-mono">{u}</span>
                <span className="text-2xs text-ink-subtle ml-auto">{note}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Small chip shown in LeftRail when logged in ──────────────────────────────

export function OperatorChip() {
  const { operator, logout } = useAuthStore();
  const { locale } = useUIStore();

  if (!operator) return null;

  const roleInfo = ROLE_LABEL[operator.role] ?? { es: operator.role, badge: operator.role.toUpperCase() };

  return (
    <div className="px-3 py-2 border-t border-border-subtle mt-auto">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-surface-hover">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-ink truncate">{operator.username}</p>
          <p className="text-2xs text-ink-subtle">{roleInfo.es}</p>
        </div>
        <span className="text-2xs font-bold text-accent shrink-0">{roleInfo.badge}</span>
        <button
          onClick={logout}
          className="text-2xs text-ink-subtle hover:text-danger transition-colors shrink-0"
          title={locale === "es" ? "Cerrar sesión" : "Log out"}
          aria-label={locale === "es" ? "Cerrar sesión" : "Log out"}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
