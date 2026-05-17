"use client";

import { MessageSquare, Send, Loader2, Sparkles, RefreshCw, Database } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useUIStore } from "@/store/ui";
import { DEMO_COPILOT_RESPONSES } from "@/lib/demoData";
import {
  Panel,
  PanelHeader,
  PanelTitle,
  Button,
} from "@/components/ui/primitives";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Render basic markdown inline: **bold** and numbered lists */
function MarkdownLine({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => (
        <div key={i} className={line.startsWith("•") || line.match(/^\d+\./) ? "pl-1" : ""}>
          <MarkdownLine text={line} />
        </div>
      ))}
    </div>
  );
}

// Keyword → demo response key mapping for fuzzy fallback
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
];

function findDemoResponse(query: string): string | null {
  const q = query.toLowerCase().trim();
  // Exact match (handles both Spanish and English keys)
  const key = Object.keys(DEMO_COPILOT_RESPONSES).find((k) => k.toLowerCase().trim() === q);
  if (key) return key;
  // Fuzzy keyword routing → falls back to Spanish demo key
  for (const { keys, demo } of KEYWORD_ROUTES) {
    if (keys.some((kw) => q.includes(kw.toLowerCase()))) return demo;
  }
  return null;
}

const SUGGESTIONS: { es: string; en: string }[] = [
  { es: "¿Cuáles son las alertas activas ahora?", en: "What are the active alerts right now?" },
  { es: "¿Qué distritos debo evacuar primero?", en: "Which districts should I evacuate first?" },
  { es: "¿Cuáles son los distritos en mayor riesgo ahora?", en: "Which districts have the highest risk right now?" },
  { es: "¿Cuál es el pronóstico para las próximas 24 horas?", en: "What is the forecast for the next 24 hours?" },
  { es: "¿Qué rutas de evacuación están bloqueadas?", en: "Which evacuation routes are blocked?" },
  { es: "¿Cuántas señales sociales urgentes hay ahora?", en: "How many urgent social signals are there now?" },
  { es: "¿Qué estaciones hidrológicas están en alerta?", en: "Which hydrological stations are on alert?" },
  { es: "¿Cuántas personas están en zona de inundación activa?", en: "How many people are in active flood zones?" },
];

const UI: Record<"es" | "en", {
  title: string; model: string; placeholder: string; queryLabel: string;
  responseLabel: string; newQuery: string; hint: string; send: string;
}> = {
  es: {
    title: "Copiloto",
    model: "Qwen 2.5",
    placeholder: "Consulta en español…",
    queryLabel: "Consulta",
    responseLabel: "Respuesta",
    newQuery: "Nueva consulta",
    hint: "Haz una pregunta sobre la situación actual en Lima.",
    send: "Enviar",
  },
  en: {
    title: "Copilot",
    model: "Qwen 2.5",
    placeholder: "Ask about the current situation…",
    queryLabel: "Query",
    responseLabel: "Response",
    newQuery: "New query",
    hint: "Ask a question about Lima's current situation.",
    send: "Send",
  },
};

export function AskPanel() {
  const { activePanel, locale } = useUIStore();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [displayedAnswer, setDisplayedAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<{ label: string; value: string }[]>([]);
  const [dataRows, setDataRows] = useState<Array<Record<string, unknown>>>([]);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isRedacted, setIsRedacted] = useState(false);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ui = UI[locale];

  // Typewriter effect for demo responses
  useEffect(() => {
    if (typewriterRef.current) clearInterval(typewriterRef.current);
    if (!answer) { setDisplayedAnswer(null); return; }
    if (!isDemo) { setDisplayedAnswer(answer); return; }
    setDisplayedAnswer("");
    let i = 0;
    // Reveal ~4 chars per tick at 12ms → smooth but fast enough not to bore
    typewriterRef.current = setInterval(() => {
      i += 4;
      setDisplayedAnswer(answer.slice(0, i));
      if (i >= answer.length) {
        clearInterval(typewriterRef.current!);
        typewriterRef.current = null;
        setDisplayedAnswer(answer);
      }
    }, 12);
    return () => { if (typewriterRef.current) clearInterval(typewriterRef.current); };
  }, [answer, isDemo]);

  if (activePanel !== "ask") return null;

  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setAnswer(null);
    setSources([]);
    setDataRows([]);
    setLastQuery(trimmed);
    setIsDemo(false);
    setIsRedacted(false);
    try {
      const res = await fetch(`${BASE}/api/v1/copilot/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, operator_id: "demo" }),
        signal: AbortSignal.timeout(55_000),  // 55s — model inference can take 30–45s on CPU
      });
      if (res.status === 400) {
        const err = await res.json();
        setAnswer(err.detail ?? (locale === "es" ? "Consulta no permitida." : "Query not allowed."));
        return;
      }
      const data = await res.json();
      setAnswer(data.answer ?? (locale === "es" ? "Sin respuesta." : "No response."));
      setIsRedacted(!!data.redacted);
      // Build metadata chips from new agentic response shape
      const chips: { label: string; value: string }[] = [];
      if (data.confidence != null)
        chips.push({ label: locale === "es" ? "Confianza" : "Confidence", value: `${(data.confidence * 100).toFixed(0)}%` });
      if (Array.isArray(data.tool_calls) && data.tool_calls.length > 0) {
        const toolNames = data.tool_calls.map((t: { tool: string }) => t.tool.replace(/_/g, " ")).join(", ");
        chips.push({ label: locale === "es" ? "Herramientas" : "Tools", value: toolNames });
      }
      setSources(chips);
      if (Array.isArray(data.sources)) setDataRows(data.sources.slice(0, 5));
    } catch {
      // Fuzzy match → demo response, fall back to generic error
      const demoKey = findDemoResponse(trimmed);
      const demo = demoKey ? DEMO_COPILOT_RESPONSES[demoKey] : null;
      if (demo) {
        setIsDemo(true);
        setAnswer(demo.answer);
        setSources([
          { label: locale === "es" ? "Intención" : "Intent", value: demo.intent.replace(/_/g, " ") },
          { label: locale === "es" ? "Confianza" : "Confidence", value: `${(demo.confidence * 100).toFixed(0)}%` },
          { label: locale === "es" ? "Plan" : "Plan", value: demo.query_plan.replace(/_/g, " ") },
        ]);
        setDataRows(demo.sources.slice(0, 5));
      } else {
        setAnswer(locale === "es"
          ? "Error al conectar con el servidor. Prueba una de las consultas sugeridas."
          : "Connection error. Try one of the suggested queries.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(query);
  };

  return (
    <aside
      className={[
        // Mobile: slide-up sheet
        "fixed bottom-14 left-0 right-0 h-[62vh] rounded-t-2xl",
        // Desktop: fixed sidebar panel
        "sm:absolute sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:h-auto sm:w-80 sm:max-w-sm sm:rounded-2xl",
        // Felt-style cream surface — NO glass/blur
        "bg-surface border-l border-border-strong shadow-panel z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={ui.title}
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-border-strong" />
      </div>

      {/* Header */}
      <PanelHeader>
        <MessageSquare size={15} className="text-accent shrink-0" aria-hidden="true" />
        <PanelTitle>{ui.title}</PanelTitle>
        <span className="text-[10px] text-ink-subtle flex items-center gap-1 shrink-0">
          <Sparkles size={10} aria-hidden="true" /> {ui.model}
        </span>
      </PanelHeader>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" aria-live="polite" aria-atomic="true">
        {answer ? (
          <>
            {/* Echo of the submitted query */}
            <div className="bg-surface-sunken rounded-xl px-3 py-2">
              <p className="text-[11px] text-ink-subtle mb-1">{ui.queryLabel}</p>
              <p className="text-xs text-ink leading-snug">{lastQuery}</p>
            </div>

            {/* Copilot response */}
            <div
              className="bg-surface-sunken rounded-xl px-4 py-3"
              role="region"
              aria-label={ui.responseLabel}
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] text-ink-muted">{ui.responseLabel}</p>
                <div className="flex items-center gap-1">
                  {isRedacted && (
                    <span className="text-[10px] bg-danger/10 border border-danger/30 text-danger px-1.5 py-0.5 rounded-md font-mono">
                      {locale === "es" ? "SANITIZADO" : "SANITIZED"}
                    </span>
                  )}
                  {isDemo && (
                    <span className="text-[10px] bg-surface border border-border text-ink-subtle px-1.5 py-0.5 rounded-md font-mono">
                      DEMO
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm text-ink leading-relaxed">
                <MarkdownText text={displayedAnswer ?? ""} />
                {displayedAnswer !== null && displayedAnswer.length < (answer?.length ?? 0) && (
                  <span
                    className="inline-block w-0.5 h-4 bg-accent ml-0.5 animate-pulse align-text-bottom"
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Metadata chips */}
              {sources.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-border flex flex-wrap gap-1.5">
                  {sources.map((s) => (
                    <span
                      key={s.label}
                      className="text-[10px] bg-surface border border-border rounded-md px-1.5 py-0.5 text-ink-muted"
                    >
                      {s.label}: <span className="text-ink">{s.value}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Source data rows */}
              {dataRows.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-border">
                  <p className="text-[10px] text-ink-subtle mb-1 flex items-center gap-1">
                    <Database size={9} aria-hidden="true" />
                    {locale === "es" ? "Datos de origen (PostGIS)" : "Source data (PostGIS)"}
                  </p>
                  <div className="space-y-1">
                    {dataRows.map((row, i) => (
                      <div
                        key={i}
                        className="text-[10px] bg-surface border border-border rounded-lg px-2 py-1 text-ink-muted font-mono truncate"
                      >
                        {Object.entries(row).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* New query link */}
            <button
              onClick={() => {
                setAnswer(null);
                setDisplayedAnswer(null);
                setSources([]);
                setDataRows([]);
                setQuery("");
                setIsDemo(false);
                setIsRedacted(false);
              }}
              className="flex items-center gap-1 text-xs text-ink-muted hover:text-accent underline underline-offset-2 transition-colors"
            >
              <RefreshCw size={11} aria-hidden="true" />
              {ui.newQuery}
            </button>
          </>
        ) : (
          <>
            {/* Hint */}
            <p className="text-[11px] text-ink-subtle text-center pt-2">{ui.hint}</p>

            {/* Suggestion chips */}
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => {
                const q = locale === "es" ? s.es : s.en;
                return (
                  <Button
                    key={s.es}
                    variant="secondary"
                    size="xs"
                    onClick={() => { setQuery(q); submit(q); }}
                    disabled={loading}
                    className="w-full justify-start text-left"
                  >
                    {q}
                  </Button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-border">
        <div className="flex gap-2">
          <textarea
            rows={1}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(query);
              }
            }}
            placeholder={ui.placeholder}
            aria-label={ui.placeholder}
            disabled={loading}
            className="flex-1 bg-surface-sunken border border-border rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none resize-none disabled:opacity-50"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={loading || !query.trim()}
            aria-label={ui.send}
            className="self-end"
          >
            {loading
              ? <Loader2 size={15} className="animate-spin text-ink-muted" />
              : <Send size={15} />
            }
          </Button>
        </div>
      </form>
    </aside>
  );
}
