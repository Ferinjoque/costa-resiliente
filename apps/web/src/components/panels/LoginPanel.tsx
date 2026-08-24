"use client";

import { useState, useEffect, useRef } from "react";
import { Shield, Eye, EyeOff, LogIn, LogOut } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { clsx } from "clsx";

const ROLE_LABEL: Record<string, { es: string; en: string; badge: string }> = {
  coen: { es: "Nivel nacional",   en: "National level",   badge: "COEN" },
  coer: { es: "Regional, Lima",   en: "Regional, Lima",   badge: "COER" },
  coel: { es: "Nivel distrital",  en: "District level",   badge: "COEL" },
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

      {/* Centering wrapper: no translate hack so animation works cleanly */}
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
          {/* Header: mark and text share one row so the subtitle hangs off the
              title rather than the panel edge, and both lines stay optically
              centred against the mark. */}
          <div className="px-6 pt-6 pb-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-danger flex items-center justify-center shrink-0">
                <span className="text-surface text-[11px] font-bold tracking-wide leading-none">CR</span>
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink leading-tight">Costa Resiliente</p>
                <p className="text-xs text-ink-subtle leading-tight mt-1">
                  {locale === "es" ? "Acceso para operadores SINAGERD" : "SINAGERD operator access"}
                </p>
              </div>
            </div>
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
  const [confirmingLogout, setConfirmingLogout] = useState(false);

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

  const roleInfo = ROLE_LABEL[operator.role]
    ?? { es: operator.role, en: operator.role, badge: operator.role.toUpperCase() };
  const es = locale === "es";

  // Signing out mid-shift drops the operator's ability to acknowledge or
  // escalate anything, so it asks first. Confirming happens in place rather than
  // through a browser dialog, which keeps the console self-contained.
  if (confirmingLogout) {
    return (
      <div className="px-3 py-2 border-t border-border-subtle mt-auto">
        <div className="px-3 py-2.5 rounded-xl bg-surface-hover border border-border">
          <p className="text-2xs text-ink-muted leading-snug mb-2">
            {es
              ? "Cerrar sesión detiene tu acceso a alertas y bitácora."
              : "Signing out ends your access to alerts and the decision log."}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setConfirmingLogout(false)}
              className="flex-1 px-2 py-1.5 rounded-lg text-2xs font-medium text-ink-muted hover:bg-surface hover:text-ink border border-border transition-colors"
            >
              {es ? "Cancelar" : "Cancel"}
            </button>
            <button
              onClick={() => {
                setConfirmingLogout(false);
                logout();
              }}
              className="flex-1 px-2 py-1.5 rounded-lg text-2xs font-semibold text-surface bg-danger hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              {es ? "Salir" : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-border-subtle mt-auto">
      <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-surface-hover">
        <div className="w-7 h-7 rounded-full bg-accent/12 flex items-center justify-center shrink-0">
          <span className="text-2xs font-bold text-accent leading-none">{roleInfo.badge}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-ink truncate leading-tight">{operator.username}</p>
          <p className="text-2xs text-ink-subtle truncate leading-tight mt-0.5">
            {es ? roleInfo.es : roleInfo.en}
          </p>
        </div>
        <button
          onClick={() => setConfirmingLogout(true)}
          className="p-1.5 -mr-0.5 rounded-lg text-ink-subtle hover:text-danger hover:bg-surface transition-colors shrink-0"
          title={es ? "Cerrar sesión" : "Sign out"}
          aria-label={es ? "Cerrar sesión" : "Sign out"}
        >
          <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
