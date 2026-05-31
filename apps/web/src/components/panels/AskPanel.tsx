"use client";

import {
  Send, Loader2, Sparkles, RefreshCw, Check,
  Info, X, Bot,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { DEMO_COPILOT_RESPONSES } from "@/lib/demoData";
import { clsx } from "clsx";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  displayed: string;
  isDemo?: boolean;
  isRedacted?: boolean;
  quickMode?: boolean;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className={line.startsWith("•") || /^\d+\./.test(line) ? "pl-1" : ""}>
            {parts.map((p, j) =>
              p.startsWith("**") && p.endsWith("**")
                ? <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong>
                : <span key={j}>{p}</span>
            )}
          </p>
        );
      })}
    </div>
  );
}

// ─── Thinking animation ───────────────────────────────────────────────────────

const THINKING_STEPS: Record<"es" | "en", string[]> = {
  es: [
    "Analizando tu consulta",
    "Consultando datos en tiempo real",
    "Revisando alertas y sensores",
    "Elaborando respuesta",
  ],
  en: [
    "Analyzing your query",
    "Querying real-time data",
    "Reviewing alerts and sensors",
    "Composing response",
  ],
};

function ThinkingBubble({ locale }: { locale: "es" | "en" }) {
  const [step, setStep] = useState(0);
  const steps = THINKING_STEPS[locale];

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 1300);
    const t2 = setTimeout(() => setStep(2), 3200);
    const t3 = setTimeout(() => setStep(3), 6500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="flex gap-2.5 items-start">
      <div className="w-6 h-6 rounded-full bg-accent-soft shrink-0 flex items-center justify-center mt-0.5 ring-1 ring-accent/20">
        <Bot size={11} className="text-accent" />
      </div>
      <div className="bg-surface-sunken rounded-2xl rounded-tl-sm px-4 py-3 space-y-2">
        {steps.slice(0, step + 1).map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {i < step ? (
              <Check size={11} className="text-ok-muted shrink-0" />
            ) : (
              <Loader2 size={11} className="animate-spin text-accent shrink-0" />
            )}
            <span className={i < step ? "text-ink-subtle" : "text-ink"}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Info popover ─────────────────────────────────────────────────────────────

function InfoPopover({ locale, onClose }: { locale: "es" | "en"; onClose: () => void }) {
  const es = locale === "es";
  return (
    <div className="absolute top-full right-0 mt-2 z-40 w-64 bg-surface border border-border-strong rounded-xl shadow-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">
          {es ? "Cómo funciona" : "How it works"}
        </p>
        <button onClick={onClose} className="p-0.5 rounded text-ink-subtle hover:text-ink transition-colors">
          <X size={13} />
        </button>
      </div>
      <div className="space-y-2 text-xs">
        {[
          [es ? "Modelo" : "Model",           "Qwen 2.5 · 7B-Instruct"],
          [es ? "Infraestructura" : "Infra",   es ? "Local · Docker" : "Local · Docker"],
          [es ? "Datos" : "Data",              "PostGIS · IMERG · ANA"],
          [es ? "SITREP" : "SITREP",           es ? "~3s · 4 herramientas paralelo" : "~3s · 4 tools parallel"],
          [es ? "Modo rápido" : "Quick mode",   es ? "~2s · sin LLM" : "~2s · no LLM"],
          [es ? "Modo completo" : "Full mode",   es ? "15–30s · CPU" : "15–30s · CPU"],
          [es ? "Privacidad" : "Privacy",      es ? "Sin datos externos" : "No third-party data"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="text-ink-subtle shrink-0">{k}</span>
            <span className="text-ink font-medium text-right font-mono text-[11px]">{v}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-ink-subtle border-t border-border pt-2.5 leading-relaxed">
        {es
          ? "Utiliza herramientas de análisis geoespacial en tiempo real. No tiene acceso a internet. Los resultados deben verificarse con fuentes oficiales."
          : "Uses real-time geospatial analysis tools. No internet access. Results should be verified against official sources."}
      </p>
    </div>
  );
}

// ─── Keyword routing for demo fallback ───────────────────────────────────────

const KEYWORD_ROUTES: Array<{ keys: string[]; demo: string }> = [
  { keys: ["alerta", "alert", "activ", "active alerts", "alertas activas"], demo: "¿Cuáles son las alertas activas ahora?" },
  { keys: ["evacu", "prioridad", "priority", "evacuation", "primero", "first", "shelter", "albergue"], demo: "¿Qué distritos debo evacuar primero?" },
  { keys: ["jicamarca", "umbral", "threshold", "precipitación necesaria", "activar huayco"], demo: "¿Cuánta precipitación es necesaria para activar un huayco en Jicamarca?" },
  { keys: ["riesgo", "distrito", "risk", "district", "mayor riesgo", "which district", "highest risk"], demo: "¿Cuáles son los distritos en mayor riesgo ahora?" },
  { keys: ["huayco", "quebrada", "landslide", "desliz", "quebradas"], demo: "¿Qué quebradas tienen riesgo alto de huayco?" },
  { keys: ["lluvia", "rain", "rímac", "rimac", "precipit", "72h", "72 h", "rainfall", "cuánta lluvia", "acumulada"], demo: "¿Cuánta lluvia acumulada hubo en el Rímac en las últimas 72h?" },
  { keys: ["personas", "people", "población", "population", "afectad", "zona inundad", "cuántas personas"], demo: "¿Cuántas personas están en zona de inundación activa?" },
  { keys: ["infraestructura", "infrastructure", "hospital", "escuela", "puente", "bridge", "critical infra", "vial", "road damage", "daños"], demo: "¿Qué daños hay en infraestructura vial?" },
  { keys: ["nivel", "río", "river", "chosica", "caudal", "flow", "rimac level"], demo: "¿Cuál es el nivel del río Rímac en Chosica?" },
  { keys: ["pronóstico", "forecast", "próximas", "next 24", "next hours", "pronostico"], demo: "¿Cuál es el pronóstico para las próximas 24 horas?" },
  { keys: ["chillón", "chillon", "carabayllo río", "chillon river"], demo: "¿Cuál es el estado del río Chillón?" },
  { keys: ["albergue", "shelter", "refugio", "evacuados", "displaced"], demo: "¿Dónde están los albergues más cercanos?" },
  { keys: ["1998", "histor", "comparar", "compare", "1997", "pasado", "anterior"], demo: "¿Cómo se compara con El Niño de 1998?" },
  { keys: ["social", "señales", "signals", "urgentes", "urgent", "bluesky", "telegram", "reddit"], demo: "¿Cuántas señales sociales urgentes hay ahora?" },
  { keys: ["ruta", "route", "bloqueada", "blocked road", "carretera", "vía cerrada", "camino"], demo: "¿Qué rutas de evacuación están bloqueadas?" },
  { keys: ["estación", "station", "hidrolog", "gage", "sensor", "todas las estacion", "all stations"], demo: "¿Qué estaciones hidrológicas están en alerta?" },
  { keys: ["san juan", "sjl", "lurigancho distrito", "150133"], demo: "¿Cuál es el riesgo en San Juan de Lurigancho?" },
  { keys: ["2017", "el niño costero", "evento 2017", "niño 2017", "que pasó", "what happened"], demo: "¿Qué pasó en el evento El Niño Costero 2017?" },
  { keys: ["recursos", "resources", "personal", "efectivos", "equipos", "deployed", "deployment"], demo: "¿Cuántos recursos de respuesta están desplegados?" },
  { keys: ["resumen completo", "sitrep", "sit rep", "situación general", "inicio de guardia",
           "relevo", "traspaso", "resumen general", "situation report", "full briefing"], demo: "Dame el resumen completo de la situación" },
];

function findDemoResponse(query: string): string | null {
  const q = query.toLowerCase().trim();
  const key = Object.keys(DEMO_COPILOT_RESPONSES).find((k) => k.toLowerCase().trim() === q);
  if (key) return key;
  for (const { keys, demo } of KEYWORD_ROUTES) {
    if (keys.some((kw) => q.includes(kw.toLowerCase()))) return demo;
  }
  return null;
}

const GREETING_WORDS = new Set([
  "hey", "hola", "hi", "hello", "hallo", "oi", "ola", "sup", "yo", "ok", "okay",
  "test", "prueba", "buenos días", "buenas", "good morning", "good afternoon",
]);

function isGreeting(q: string): boolean {
  const words = q.toLowerCase().trim().split(/\s+/);
  return words.length <= 3 && words.every((w) => GREETING_WORDS.has(w.replace(/[¿?!.,;:]/g, "")));
}

const GREETING_REPLY: Record<"es" | "en", string> = {
  es: "¡Hola! Soy el copiloto de Costa Resiliente. Puedo ayudarte con información sobre alertas activas, distritos en riesgo, niveles hidrológicos, pronóstico de lluvias, señales sociales y más.\n\n¿Qué deseas consultar?",
  en: "Hi! I'm the Costa Resiliente copilot. I can help with active alerts, at-risk districts, hydrological levels, rainfall forecasts, social signals, and more.\n\nWhat would you like to know?",
};

// ─── Suggestion chips ─────────────────────────────────────────────────────────

const SUGGESTIONS: { es: string; en: string }[] = [
  { es: "Dame el resumen completo de la situación",        en: "Situation report please" },
  { es: "¿Cuáles son las alertas activas ahora?",         en: "What are the active alerts right now?" },
  { es: "¿Qué distritos debo evacuar primero?",           en: "Which districts should I evacuate first?" },
  { es: "¿Cuáles son los distritos en mayor riesgo?",     en: "Which districts have the highest risk?" },
  { es: "¿Cuál es el pronóstico para las próximas 24h?",  en: "What is the 24-hour forecast?" },
  { es: "¿Cuántas personas están en zona de inundación?", en: "How many people are in active flood zones?" },
];

// ─── Main panel ───────────────────────────────────────────────────────────────

const LS_TOKEN = "cr_auth_token";

function getLocalToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_TOKEN);
}

export function AskPanel() {
  const { activePanel, locale } = useUIStore();
  const operator = useAuthStore((s) => s.operator);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel in-flight request and typewriter animation when navigating away
  useEffect(() => {
    if (activePanel !== "ask") {
      abortRef.current?.abort();
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
    }
  }, [activePanel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (activePanel === "ask") setTimeout(() => inputRef.current?.focus(), 120);
  }, [activePanel]);

  if (activePanel !== "ask") return null;

  const es = locale === "es";

  function animateMessage(fullContent: string, msgId: string) {
    if (typewriterRef.current) clearInterval(typewriterRef.current);
    let i = 0;
    typewriterRef.current = setInterval(() => {
      i += 5;
      setMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, displayed: fullContent.slice(0, i) } : m)
      );
      if (i >= fullContent.length) {
        clearInterval(typewriterRef.current!);
        typewriterRef.current = null;
        setMessages((prev) =>
          prev.map((m) => m.id === msgId ? { ...m, displayed: fullContent } : m)
        );
      }
    }, 10);
  }

  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setQuery("");
    setLoading(true);
    setShowInfo(false);
    setMessages((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), role: "user", content: trimmed, displayed: trimmed },
    ]);

    // Short-circuit greetings — don't waste model inference on them
    if (isGreeting(trimmed)) {
      const reply = GREETING_REPLY[locale];
      const asstId = Math.random().toString(36).slice(2);
      setMessages((prev) => [...prev, { id: asstId, role: "assistant", content: reply, displayed: "" }]);
      animateMessage(reply, asstId);
      setLoading(false);
      return;
    }

    // Cancel any previous in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = getLocalToken();
      const res = await fetch(`${BASE}/api/v1/copilot/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: trimmed,
          operator_id: operator?.username ?? "demo",
          district_ubigeo: operator?.district_ubigeo ?? undefined,
        }),
        signal: controller.signal,
      });
      let answerText: string;
      let isRedacted = false;
      let isQuickMode = false;
      if (res.status === 401) {
        useAuthStore.getState().logout();
        useAuthStore.getState().setLoginModalOpen(true);
        setLoading(false);
        return;
      } else if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After") ?? "60";
        answerText = es
          ? `Has enviado demasiadas consultas. Espera ${retryAfter} segundos e intenta de nuevo.`
          : `Too many queries. Wait ${retryAfter} seconds before trying again.`;
      } else if (res.status === 400) {
        const err = await res.json();
        answerText = err.detail ?? (es ? "Consulta no permitida." : "Query not allowed.");
      } else if (res.status === 503) {
        const err = await res.json().catch(() => ({}));
        answerText = (err as { detail?: string }).detail
          ?? (es
            ? "El asistente no respondió a tiempo. El modelo de IA está ocupado — reintenta en unos segundos."
            : "The assistant timed out. The AI model is busy — please retry in a few seconds.");
      } else if (!res.ok) {
        answerText = es
          ? `Error del servidor (${res.status}). Reintenta o usa una consulta diferente.`
          : `Server error (${res.status}). Retry or try a different query.`;
      } else {
        const data = await res.json();
        answerText = data.answer ?? (es ? "Sin respuesta." : "No response.");
        isRedacted = !!data.redacted;
        isQuickMode = !!data.quick_mode;
      }
      const asstId = Math.random().toString(36).slice(2);
      setMessages((prev) => [...prev, { id: asstId, role: "assistant", content: answerText, displayed: "", isRedacted, quickMode: isQuickMode }]);
      animateMessage(answerText, asstId);
    } catch (err: unknown) {
      // AbortError = user sent a new question or navigated away; don't show error
      if ((err as Error)?.name === "AbortError") {
        setLoading(false);
        return;
      }
      const demoKey = findDemoResponse(trimmed);
      const demo = demoKey ? DEMO_COPILOT_RESPONSES[demoKey] : null;
      const answerText = demo?.answer ?? (es
        ? "No pude conectar con el servidor. Intenta una de las consultas sugeridas."
        : "Could not reach the server. Try one of the suggested queries.");
      const asstId = Math.random().toString(36).slice(2);
      setMessages((prev) => [...prev, { id: asstId, role: "assistant", content: answerText, displayed: "", isDemo: !!demo }]);
      animateMessage(answerText, asstId);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    if (typewriterRef.current) clearInterval(typewriterRef.current);
    setMessages([]);
    setQuery("");
    setLoading(false);
  };

  const disclaimer = es
    ? "Las respuestas son generadas por IA y pueden contener errores. Verifica información crítica con fuentes oficiales."
    : "AI-generated responses may contain errors. Verify critical information with official sources.";

  return (
    <aside
      className={clsx(
        "fixed bottom-14 left-0 right-0 h-[68vh] rounded-t-2xl",
        "sm:absolute sm:top-0 sm:right-0 sm:bottom-0 sm:left-auto sm:h-full sm:w-[340px] sm:rounded-none",
        "sm:border-l sm:border-border-strong",
        "bg-surface shadow-panel z-20 flex flex-col panel-animate",
      )}
      aria-label={es ? "Consultar copiloto IA" : "AI copilot"}
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden="true">
        <div className="w-10 h-[3px] bg-border-strong rounded-full" />
      </div>

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border shrink-0">
        <div className="w-7 h-7 rounded-full bg-accent-soft flex items-center justify-center shrink-0 ring-1 ring-accent/20">
          <Bot size={14} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink leading-tight">
            {es ? "Copiloto" : "Copilot"}
          </p>
          <p className="text-[10px] text-ink-subtle">
            {es ? "Asistente de emergencias · Lima" : "Emergency assistant · Lima"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-surface-hover transition-colors"
              title={es ? "Nueva conversación" : "New conversation"}
              aria-label={es ? "Nueva conversación" : "New conversation"}
            >
              <RefreshCw size={13} />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowInfo((v) => !v)}
              className={clsx(
                "p-1.5 rounded-lg transition-colors",
                showInfo
                  ? "text-accent bg-accent-soft"
                  : "text-ink-subtle hover:text-ink hover:bg-surface-hover",
              )}
              aria-label={es ? "Información sobre el modelo" : "Model information"}
            >
              <Info size={14} />
            </button>
            {showInfo && <InfoPopover locale={locale} onClose={() => setShowInfo(false)} />}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="h-full flex flex-col">
            <div className="flex flex-col items-center justify-center flex-1 text-center gap-3 pb-4">
              <div className="w-11 h-11 rounded-full bg-accent-soft flex items-center justify-center ring-2 ring-accent/15">
                <Sparkles size={20} className="text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink mb-1">
                  {es ? "¿En qué puedo ayudarte?" : "How can I help you?"}
                </p>
                <p className="text-xs text-ink-subtle">
                  {es
                    ? "Pregunta sobre la situación actual en Lima"
                    : "Ask about Lima's current situation"}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => {
                const q = locale === "es" ? s.es : s.en;
                return (
                  <button
                    key={s.es}
                    onClick={() => submit(q)}
                    disabled={loading}
                    className="w-full text-left text-xs text-ink-muted bg-surface-sunken hover:bg-surface-hover hover:text-ink border border-border rounded-xl px-3 py-2.5 transition-colors disabled:opacity-40 leading-snug"
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Chat thread */
          <div className="space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={clsx(
                  "flex gap-2.5",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row items-start",
                )}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-accent-soft shrink-0 flex items-center justify-center mt-0.5 ring-1 ring-accent/20">
                    <Bot size={11} className="text-accent" />
                  </div>
                )}
                <div
                  className={clsx(
                    "max-w-[82%] rounded-2xl px-3.5 py-2.5",
                    msg.role === "user"
                      ? "bg-ink text-surface rounded-tr-sm text-sm leading-relaxed"
                      : "bg-surface-sunken rounded-tl-sm",
                  )}
                >
                  {msg.role === "user" ? (
                    <p>{msg.content}</p>
                  ) : (
                    <div className="text-sm text-ink leading-relaxed">
                      {/* Demo banner ABOVE the response to prevent operators acting on simulated data */}
                      {msg.isDemo && (
                        <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg bg-warn-soft border border-warn/30">
                          <span className="text-[10px] font-semibold text-warn uppercase tracking-wide">
                            {es ? "⚠ DEMO — Sin datos en vivo" : "⚠ DEMO — No live data"}
                          </span>
                        </div>
                      )}
                      <MarkdownText text={msg.displayed ?? ""} />
                      {(msg.displayed?.length ?? 0) < msg.content.length && (
                        <span
                          className="inline-block w-0.5 h-4 bg-accent ml-0.5 animate-pulse align-text-bottom"
                          aria-hidden="true"
                        />
                      )}
                      {msg.quickMode && (
                        <p className="text-[10px] text-accent mt-2 opacity-70 border-t border-border pt-1.5">
                          {es ? "Modo rápido · sin LLM · ~2s" : "Quick mode · no LLM · ~2s"}
                        </p>
                      )}
                      {msg.isRedacted && (
                        <p className="text-[10px] text-danger mt-2 opacity-80 border-t border-danger/20 pt-1.5">
                          {es ? "Contenido sensible anonimizado" : "Sensitive content anonymized"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && <ThinkingBubble locale={locale} />}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input + disclaimer */}
      <div className="border-t border-border px-4 pt-3 pb-3 shrink-0 bg-surface">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(query); }}
          className="flex gap-2 items-end"
        >
          <textarea
            ref={inputRef}
            rows={1}
            maxLength={2000}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(query);
              }
            }}
            placeholder={es ? "Escribe tu consulta…" : "Ask about the current situation…"}
            disabled={loading}
            className="flex-1 bg-surface-sunken border border-border rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none resize-none disabled:opacity-50 max-h-28 overflow-y-auto"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center shrink-0 hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-end"
            aria-label={es ? "Enviar" : "Send"}
          >
            <Send size={14} className="text-white translate-x-px" />
          </button>
        </form>
        <p className="text-[10px] text-ink-subtle mt-2 leading-tight text-center">
          ⚠ {disclaimer}
        </p>
      </div>
    </aside>
  );
}
