"use client";

import { useState, useEffect, useRef } from "react";
import { Shield, Eye, EyeOff, LogIn } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { clsx } from "clsx";

const ROLE_LABEL: Record<string, { es: string; badge: string }> = {
  coen: { es: "COEN — Nacional",      badge: "COEN" },
  coer: { es: "COER Lima — Regional", badge: "COER" },
  coel: { es: "COEL — Distrital",     badge: "COEL" },
};

const DEMO_HINTS = [
  { username: "coer_lima", role: "COER", note: "Lima Metropolitana"    },
  { username: "coen_lima", role: "COEN", note: "Nacional"              },
  { username: "coel_sjl",  role: "COEL", note: "San Juan de Lurigancho"},
];

// ─── Modal ────────────────────────────────────────────────────────────────────

export function LoginPanel() {
  const { loginModalOpen, setLoginModalOpen, login, hydrate } = useAuthStore();
  const { locale } = useUIStore();

  const [visible, setVisible] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const closeTimerRef           = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { hydrate(); }, [hydrate]);

  // Animate in when store opens the modal
  useEffect(() => {
    if (loginModalOpen) {
      // tiny delay so the initial opacity-0 frame renders before transitioning
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [loginModalOpen]);

  function close() {
    setVisible(false);
    // wait for CSS transition to finish before unmounting
    closeTimerRef.current = setTimeout(() => {
      setLoginModalOpen(false);
      setUsername("");
      setPassword("");
      setShowPw(false);
      setError(null);
    }, 200);
  }

  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

  // Close on Escape
  useEffect(() => {
    if (!loginModalOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginModalOpen]);

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
      close();
    } catch (err: unknown) {
      const status = (err as { httpStatus?: number }).httpStatus;
      const msg = err instanceof Error ? err.message : String(err);
      if (status === 429) {
        setError(locale === "es"
          ? "Demasiados intentos. Espera 60 segundos."
          : "Too many login attempts. Wait 60 seconds.");
      } else if (status === 503) {
        setError(locale === "es"
          ? "Servicio no disponible. Reintenta en un momento."
          : "Service unavailable. Try again shortly.");
      } else if (!status && (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror") || msg.toLowerCase().includes("abort"))) {
        setError(locale === "es"
          ? "Sin conexión con el servidor."
          : "Cannot reach the server.");
      } else {
        setError(locale === "es"
          ? "Usuario o contraseña incorrectos."
          : "Invalid username or password.");
      }
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(u: string) {
    setUsername(u);
    setPassword("demo1234");
    setError(null);
  }

  if (!loginModalOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 z-40 bg-ink/30 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        )}
        onClick={close}
        aria-hidden="true"
      />

      {/* Centering wrapper — no translate hack so animation works cleanly */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={locale === "es" ? "Acceso de operadores" : "Operator login"}
          className={clsx(
            "pointer-events-auto w-[340px] bg-surface rounded-2xl shadow-panel border border-border-strong overflow-hidden",
            "transition-all duration-200 ease-out",
            visible
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-95 translate-y-3",
          )}
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
                autoFocus
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
              {locale === "es"
                ? "Cuentas de demostración:"
                : "Demo accounts:"}
            </p>
            <div className="flex flex-col gap-1">
              {DEMO_HINTS.map(({ username: u, role, note }) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => fillDemo(u)}
                  className="flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-hover transition-colors"
                >
                  <span className="text-2xs font-mono font-semibold text-accent w-10 shrink-0">{role}</span>
                  <span className="text-2xs text-ink font-mono">{u}</span>
                  <span className="text-2xs text-ink-subtle ml-auto">{note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Bottom-of-sidebar widget (login button OR operator chip) ─────────────────

export function OperatorChip() {
  const { operator, logout, setLoginModalOpen } = useAuthStore();
  const { locale } = useUIStore();

  if (!operator) {
    return (
      <div className="px-3 py-2 border-t border-border-subtle mt-auto">
        <button
          onClick={() => setLoginModalOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
        >
          <Shield size={15} strokeWidth={1.75} aria-hidden="true" />
          <span className="flex-1 text-left">
            {locale === "es" ? "Iniciar sesión" : "Log in"}
          </span>
          <LogIn size={13} className="opacity-40" aria-hidden="true" />
        </button>
      </div>
    );
  }

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
