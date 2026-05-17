"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/store/ui";
import { alertsStreamUrl } from "@/lib/api";

/**
 * Mounts a persistent SSE connection to /api/v1/alerts/stream.
 * Lives at the app-shell level so the map keeps refreshing even when
 * AlertsPanel is closed. Updates the TanStack Query cache on each push.
 */
export function useAlertStream() {
  const qc = useQueryClient();
  const setConnected = useUIStore((s) => s.setAlertStreamConnected);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (esRef.current) return;

    const es = new EventSource(alertsStreamUrl());
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (evt) => {
      try {
        const fresh = JSON.parse(evt.data);
        qc.setQueryData(["alerts", undefined], fresh);
        qc.invalidateQueries({ queryKey: ["district-risk-summary"] });
        qc.invalidateQueries({ queryKey: ["flood-exposure"] });
      } catch {
        // malformed frame — ignore
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      // Reconnect after 10s
      setTimeout(() => {
        if (esRef.current === null) {
          const next = new EventSource(alertsStreamUrl());
          esRef.current = next;
          next.onopen = () => setConnected(true);
          next.onmessage = es.onmessage;
          next.onerror = es.onerror;
        }
      }, 10_000);
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [qc, setConnected]);
}
