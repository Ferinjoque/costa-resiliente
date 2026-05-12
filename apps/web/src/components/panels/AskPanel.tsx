"use client";

import { Search, Send, Loader2 } from "lucide-react";
import { useState } from "react";
import { useUIStore } from "@/store/ui";

export function AskPanel() {
  const { activePanel } = useUIStore();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  if (activePanel !== "ask") return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/v1/copilot/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, operator_id: "demo" }),
      });
      const data = await res.json();
      setAnswer(data.answer);
    } catch {
      setAnswer("Error al conectar con el servidor. Inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside
      className="absolute top-4 right-4 bottom-4 w-[calc(100vw-4.5rem-2rem)] sm:w-80 max-w-sm bg-surface-raised border border-slate-700 rounded-xl shadow-xl z-20 flex flex-col"
      aria-label="Panel de consulta"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <Search size={15} className="text-costa-500" />
        <h2 className="text-sm font-semibold text-white">Consultar</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {answer ? (
          <div className="bg-surface-panel rounded-lg p-3">
            <p className="text-sm text-white leading-relaxed">{answer}</p>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center mt-8">
            Haz una pregunta en español sobre la situación actual en Lima.
            <br />
            <br />
            Ej: "¿Cuántas alertas activas hay en Lurigancho?" o "¿Qué quebradas
            tienen riesgo alto?"
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Consulta en español…"
            aria-label="Consulta en español"
            disabled={loading}
            className="flex-1 bg-surface-panel border border-slate-600 text-white text-sm rounded-lg px-3 py-2 placeholder:text-slate-500 focus:outline-none focus:border-costa-500 focus-visible:ring-2 focus-visible:ring-costa-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-costa-700 hover:bg-costa-500 disabled:opacity-40 text-white rounded-lg px-3 py-2 transition-colors"
            aria-label="Enviar consulta"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </form>
    </aside>
  );
}
