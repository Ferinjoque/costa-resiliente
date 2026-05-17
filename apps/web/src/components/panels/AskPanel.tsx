"use client";

import { Search, Send, Loader2, Sparkles, RefreshCw, Database } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useUIStore } from "@/store/ui";
import { DEMO_COPILOT_RESPONSES } from "@/lib/demoData";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Render basic markdown inline: **bold** and numbered lists */
function MarkdownLine({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
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
  { keys: ["evacu", "prioridad", "priority", "evacuation", "primero", "first"], demo: "¿Qué distritos debo evacuar primero?" },
  { keys: ["jicamarca", "umbral", "threshold", "precipitación necesaria", "activar huayco"], demo: "¿Cuánta precipitación es necesaria para activar un huayco en Jicamarca?" },
  { keys: ["riesgo", "distrito", "risk", "district", "mayor riesgo", "which district", "highest risk"], demo: "¿Cuáles son los distritos en mayor riesgo ahora?" },
  { keys: ["huayco", "quebrada", "landslide", "desliz", "quebradas"], demo: "¿Qué quebradas tienen riesgo alto de huayco?" },
  { keys: ["lluvia", "rain", "rímac", "rimac", "precipit", "72h", "72 h", "rainfall", "cuánta lluvia", "acumulada"], demo: "¿Cuánta lluvia acumulada hubo en el Rímac en las últimas 72h?" },
  { keys: ["personas", "people", "población", "population", "afectad", "zona inundad", "cuántas personas"], demo: "¿Cuántas personas están en zona de inundación activa?" },
  { keys: ["infraestructura", "infrastructure", "hospital", "escuela", "puente", "bridge", "critical infra"], demo: "¿Qué infraestructura crítica está en zona inundada?" },
  { keys: ["nivel", "río", "river", "chosica", "caudal", "flow", "rimac level", "estación"], demo: "¿Cuál es el nivel del río Rímac en Chosica?" },
];

function findDemoResponse(query: string): string | null {
  const q = query.toLowerCase();
  const key = Object.keys(DEMO_COPILOT_RESPONSES).find((k) => k.toLowerCase() === q);
  if (key) return key;
  for (const { keys, demo } of KEYWORD_ROUTES) {
    if (keys.some((kw) => q.includes(kw.toLowerCase()))) return demo;
  }
  return null;
}

const SUGGESTIONS: { es: string; en: string }[] = [
  { es: "¿Cuáles son las alertas activas ahora?", en: "What are the active alerts right now?" },
  { es: "¿Qué distritos debo evacuar primero?", en: "Which districts should I evacuate first?" },
  { es: "¿Cuáles son los distritos en mayor riesgo ahora?", en: "Which districts have the highest risk right now?" },
  { es: "¿Cuántas personas están en zona de inundación activa?", en: "How many people are in active flood zones?" },
  { es: "¿Qué infraestructura crítica está en zona inundada?", en: "What critical infrastructure is in flooded areas?" },
  { es: "¿Cuál es el nivel del río Rímac en Chosica?", en: "What is the Rímac river level at Chosica?" },
];

const UI: Record<"es" | "en", {
  title: string; model: string; placeholder: string; queryLabel: string;
  responseLabel: string; newQuery: string; hint: string; send: string;
}> = {
  es: {
    title: "Copiloto",
    model: "Gemma 3",
    placeholder: "Consulta en español…",
    queryLabel: "Consulta",
    responseLabel: "Respuesta",
    newQuery: "Nueva consulta",
    hint: "Haz una pregunta sobre la situación actual en Lima.",
    send: "Enviar",
  },
  en: {
    title: "Copilot",
    model: "Gemma 3",
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
    try {
      const res = await fetch(`${BASE}/api/v1/copilot/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, operator_id: "demo" }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json();
      setAnswer(data.answer ?? (locale === "es" ? "Sin respuesta." : "No response."));
      if (data.intent && data.confidence) {
        setSources([
          { label: locale === "es" ? "Intención" : "Intent", value: data.intent.replace(/_/g, " ") },
          { label: locale === "es" ? "Confianza" : "Confidence", value: `${(data.confidence * 100).toFixed(0)}%` },
          ...(data.query_plan ? [{ label: locale === "es" ? "Plan" : "Plan", value: data.query_plan.replace(/_/g, " ") }] : []),
        ]);
        if (Array.isArray(data.sources)) setDataRows(data.sources.slice(0, 5));
      }
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
        "fixed bottom-14 left-0 right-0 h-[62vh] rounded-t-2xl",
        "sm:absolute sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:h-auto sm:w-80 sm:max-w-sm sm:rounded-xl",
        "bg-surface-raised border border-slate-700 shadow-xl z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={ui.title}
    >
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-slate-600" />
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <Search size={15} className="text-costa-500" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">{ui.title}</h2>
        <span className="ml-auto text-[10px] text-costa-400 flex items-center gap-1">
          <Sparkles size={10} aria-hidden="true" /> {ui.model}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3" aria-live="polite" aria-atomic="true">
        {answer ? (
          <>
            <div className="bg-surface-panel/60 rounded-lg px-3 py-2">
              <p className="text-[11px] text-slate-400 mb-1">{ui.queryLabel}</p>
              <p className="text-xs text-slate-200 leading-snug">{lastQuery}</p>
            </div>
            <div className="bg-costa-900/30 border border-costa-700/40 rounded-lg px-3 py-2" role="region" aria-label={ui.responseLabel}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-costa-400">{ui.responseLabel}</p>
                {isDemo && (
                  <span className="text-[9px] bg-slate-700 text-slate-400 border border-slate-600 px-1 rounded">DEMO</span>
                )}
              </div>
              <div className="text-sm text-slate-200 leading-relaxed">
                <MarkdownText text={displayedAnswer ?? ""} />
                {displayedAnswer !== null && displayedAnswer.length < (answer?.length ?? 0) && (
                  <span className="inline-block w-0.5 h-4 bg-costa-400 ml-0.5 animate-pulse align-text-bottom" aria-hidden="true" />
                )}
              </div>
              {sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-costa-700/30 flex flex-wrap gap-1.5">
                  {sources.map((s) => (
                    <span key={s.label} className="text-[10px] bg-surface-panel rounded px-1.5 py-0.5 text-slate-400">
                      {s.label}: <span className="text-slate-300">{s.value}</span>
                    </span>
                  ))}
                </div>
              )}
              {dataRows.length > 0 && (
                <div className="mt-2 pt-2 border-t border-costa-700/30">
                  <p className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
                    <Database size={9} aria-hidden="true" /> {locale === "es" ? "Datos de origen (PostGIS)" : "Source data (PostGIS)"}
                  </p>
                  <div className="space-y-1">
                    {dataRows.map((row, i) => (
                      <div key={i} className="text-[10px] bg-surface-panel/50 rounded px-2 py-1 text-slate-400 font-mono truncate">
                        {Object.entries(row).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => { setAnswer(null); setDisplayedAnswer(null); setSources([]); setDataRows([]); setQuery(""); setIsDemo(false); }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-costa-400 underline underline-offset-2 transition-colors"
            >
              <RefreshCw size={11} aria-hidden="true" />
              {ui.newQuery}
            </button>
          </>
        ) : (
          <>
            <p className="text-[11px] text-slate-500 text-center pt-2">{ui.hint}</p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.es}
                  onClick={() => { setQuery(s.es); submit(s.es); }}
                  disabled={loading}
                  className="w-full text-left text-xs text-slate-300 bg-surface-panel hover:bg-costa-900/40 hover:text-costa-200 border border-slate-700 hover:border-costa-700/50 rounded-lg px-3 py-2 transition-colors disabled:opacity-40"
                >
                  {locale === "es" ? s.es : s.en}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ui.placeholder}
            aria-label={ui.placeholder}
            disabled={loading}
            className="flex-1 bg-surface-panel border border-slate-600 text-white text-sm rounded-lg px-3 py-2 placeholder:text-slate-400 focus:outline-none focus:border-costa-500 focus-visible:ring-2 focus-visible:ring-costa-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-costa-700 hover:bg-costa-500 disabled:opacity-40 text-white rounded-lg px-3 py-2 transition-colors"
            aria-label={ui.send}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </form>
    </aside>
  );
}
