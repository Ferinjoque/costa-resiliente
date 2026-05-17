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
        JSON.parse(evt.data); // validate frame
        // Invalidate so the full list (all statuses) refetches from the API.
        // Never use setQueryData here — SSE only carries active alerts and
        // would silently overwrite the panel's full history view.
        qc.invalidateQueries({ queryKey: ["alerts"] });
        qc.invalidateQueries({ queryKey: ["district-risk-summary"] });
        // flood-exposure is derived from polygon geometry, not alert counts —
        // no need to invalidate on every 10-second SSE heartbeat.
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
