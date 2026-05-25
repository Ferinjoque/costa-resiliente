"use client";

import { useState } from "react";
import { CheckCheck, X, Sparkles, MapPin, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { usePendingProposals } from "@/lib/queries";
import { approveProposal, rejectProposal, RateLimitError } from "@/lib/api";
import type { AlertProposal } from "@/lib/api";
import type { LiveToast } from "@/store/ui";
import { Button, Pill, EmptyState } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/utils";

const SEV_LABEL: Record<string, { es: string; en: string; cls: string }> = {
  critical: { es: "EMERGENCIA", en: "EMERGENCY", cls: "bg-danger-soft text-danger border-danger/30" },
  high:     { es: "ALERTA",     en: "ALERT",     cls: "bg-warn-soft text-warn-muted border-warn/30" },
  medium:   { es: "AVISO",      en: "NOTICE",    cls: "bg-warn-soft/60 text-warn-muted border-warn/20" },
  low:      { es: "INFO",       en: "INFO",      cls: "bg-surface-sunken text-ink-muted border-border" },
};

const TYPE_LABEL: Record<string, { es: string; en: string }> = {
  flood:          { es: "Inundación SAR", en: "SAR Flood" },
  huayco:         { es: "Huayco",          en: "Huayco" },
  social_cluster: { es: "Señal social",    en: "Social signal" },
};

function ProposalRow({
  proposal,
  locale,
  operatorId,
  loggedIn,
  onAct,
}: {
  proposal: AlertProposal;
  locale: "es" | "en";
  operatorId: string;
  loggedIn: boolean;
  onAct: (id: number, kind: "approve" | "reject") => Promise<void>;
}) {
  const sev = SEV_LABEL[proposal.severity] ?? SEV_LABEL.medium;
  const typ = TYPE_LABEL[proposal.alert_type]?.[locale] ?? proposal.alert_type;
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  async function act(kind: "approve" | "reject") {
    setActing(kind);
    try {
      await onAct(proposal.id, kind);
    } finally {
      setActing(null);
    }
  }

  return (
    <li className="px-4 py-3 border-b border-border-subtle">
      <div className="flex items-start gap-2 mb-1.5 flex-wrap">
        <span
          className={clsx(
            "shrink-0 text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md border",
            sev.cls,
          )}
        >
          {locale === "es" ? sev.es : sev.en}
        </span>
        <span className="text-[10px] text-ink-subtle font-mono shrink-0">{typ}</span>
        {proposal.district_ubigeo && (
          <span className="flex items-center gap-0.5 text-[10px] text-ink-subtle">
            <MapPin size={9} aria-hidden="true" />
            {proposal.district_ubigeo}
          </span>
        )}
        <span className="ml-auto text-[10px] text-ink-subtle shrink-0">
          {timeAgo(proposal.created_at)}
        </span>
      </div>
      <p className="text-sm font-semibold text-ink leading-snug">{proposal.title}</p>
      <p className="mt-1 text-xs text-ink-muted leading-relaxed">{proposal.summary}</p>

      {proposal.source_refs && proposal.source_refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {proposal.source_refs.slice(0, 4).map((r, i) => (
            <Pill key={i}>{String(r.source ?? r.tool ?? `ref ${i + 1}`)}</Pill>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => act("reject")}
          disabled={acting !== null || !loggedIn}
          className="flex-1 justify-center"
          aria-label={locale === "es" ? "Rechazar propuesta" : "Reject proposal"}
        >
          <X size={11} aria-hidden="true" />
          {locale === "es" ? "Rechazar" : "Reject"}
        </Button>
        <Button
          variant="danger"
          size="xs"
          onClick={() => act("approve")}
          disabled={acting !== null || !loggedIn}
          className="flex-1 justify-center"
          aria-label={locale === "es" ? "Aprobar y publicar como alerta" : "Approve and publish as alert"}
        >
          <CheckCheck size={11} aria-hidden="true" />
          {locale === "es" ? "Aprobar" : "Approve"}
        </Button>
      </div>
    </li>
  );
}

export function ProposalsPanel() {
  const { activePanel, setActivePanel, locale, addToast } = useUIStore();
  const operator = useAuthStore((s) => s.operator);
  const operatorId = operator?.username ?? "demo";
  const qc = useQueryClient();
  const { data: proposals = [], isLoading, isError, refetch } = usePendingProposals();

  if (activePanel !== "proposals") return null;

  async function act(id: number, kind: "approve" | "reject") {
    const prev = qc.getQueryData<AlertProposal[]>(["pending-proposals"]);
    qc.setQueryData<AlertProposal[]>(["pending-proposals"], (old) =>
      old ? old.filter((p) => p.id !== id) : old,
    );
    try {
      if (kind === "approve") {
        await approveProposal(id, operatorId);
        addToast({
          message: locale === "es"
            ? "Propuesta aprobada — publicada como alerta"
            : "Proposal approved — published as alert",
          variant: "success",
        } as Omit<LiveToast, "id" | "at">);
        qc.invalidateQueries({ queryKey: ["alerts"] });
      } else {
        await rejectProposal(id, operatorId);
        addToast({
          message: locale === "es" ? "Propuesta rechazada" : "Proposal rejected",
          variant: "info",
        } as Omit<LiveToast, "id" | "at">);
      }
    } catch (e: unknown) {
      qc.setQueryData(["pending-proposals"], prev);
      const isRateLimit = e instanceof RateLimitError;
      addToast({
        message: isRateLimit
          ? (locale === "es"
              ? `Límite alcanzado. Espere ${(e as RateLimitError).retryAfter}s.`
              : `Rate limited. Wait ${(e as RateLimitError).retryAfter}s.`)
          : (locale === "es"
              ? "No se pudo registrar la revisión. Reintenta."
              : "Could not record the review. Retry."),
        variant: "danger",
      } as Omit<LiveToast, "id" | "at">);
    }
  }

  const critical = proposals.filter((p) => p.severity === "critical").length;
  const high = proposals.filter((p) => p.severity === "high").length;

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[70vh] rounded-t-2xl border-t border-border-strong",
        "sm:absolute sm:top-0 sm:right-0 sm:bottom-0 sm:left-auto sm:h-full sm:w-[360px]",
        "sm:rounded-none sm:border-t-0 sm:border-l sm:border-border-strong",
        "bg-surface shadow-panel z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={locale === "es" ? "Propuestas de IA" : "AI proposals"}
      role="complementary"
    >
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-10 h-[3px] rounded-full bg-border" />
      </div>

      <header className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <Sparkles size={13} className="text-accent shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-ink tracking-tight flex-1 truncate">
          {locale === "es" ? "Propuestas de IA" : "AI Proposals"}
        </span>
        <span className="text-[10px] text-ink-subtle font-mono">
          {proposals.length} {locale === "es" ? "pendiente" : "pending"}
          {proposals.length !== 1 && (locale === "es" ? "s" : "")}
        </span>
        <button
          onClick={() => setActivePanel("map")}
          aria-label={locale === "es" ? "Cerrar" : "Close"}
          className="text-ink-subtle hover:text-ink transition-colors"
        >
          <X size={14} />
        </button>
      </header>

      {!operator && (
        <div className="px-4 py-2.5 bg-warn-soft/40 border-b border-warn/20" role="status">
          <div className="flex items-start gap-2 text-xs text-warn-muted">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              {locale === "es"
                ? "Inicia sesión para aprobar propuestas. Cada aprobación se registra en el log de decisiones."
                : "Log in to approve proposals. Each approval is recorded in the decision log."}
            </p>
          </div>
        </div>
      )}

      {(critical > 0 || high > 0) && (
        <div className="px-4 py-2 bg-surface-sunken border-b border-border-subtle">
          <p className="text-[10px] text-ink-subtle uppercase tracking-widest font-bold">
            {locale === "es"
              ? `${critical} EMERGENCIA · ${high} ALERTA — revisión humana`
              : `${critical} EMERGENCY · ${high} ALERT — human review`}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="px-4 py-10 text-xs text-ink-muted text-center" aria-live="polite">
            {locale === "es" ? "Cargando propuestas…" : "Loading proposals…"}
          </div>
        )}
        {isError && (
          <div className="px-4 py-8 flex flex-col items-center gap-2" role="alert">
            <span className="text-xs text-danger text-center">
              {locale === "es" ? "No se pudieron cargar las propuestas." : "Could not load proposals."}
            </span>
            <button
              onClick={() => refetch()}
              className="text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              {locale === "es" ? "Reintentar" : "Retry"}
            </button>
          </div>
        )}
        {!isLoading && !isError && proposals.length === 0 && (
          <EmptyState
            icon={<CheckCheck size={20} />}
            title={locale === "es" ? "Sin propuestas pendientes" : "No pending proposals"}
            body={locale === "es"
              ? "El copiloto emitirá nuevas propuestas conforme detecte clusters de señales o nuevos polígonos SAR."
              : "The copilot will emit new proposals as it detects signal clusters or new SAR polygons."}
          />
        )}
        <ul role="list">
          {proposals.map((p) => (
            <ProposalRow
              key={p.id}
              proposal={p}
              locale={locale}
              operatorId={operatorId}
              loggedIn={!!operator}
              onAct={act}
            />
          ))}
        </ul>
      </div>

      <footer className="px-4 py-2.5 text-[10px] text-ink-subtle border-t border-border-subtle">
        {locale === "es"
          ? "Toda aprobación se registra en ops.decision_log."
          : "Every approval is logged to ops.decision_log."}
      </footer>
    </aside>
  );
}
