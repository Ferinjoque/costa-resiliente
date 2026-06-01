"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/store/ui";
import { alertsStreamUrl } from "@/lib/api";

const HEARTBEAT_TIMEOUT_MS = 30_000;
const RECONNECT_DELAY_MS = 10_000;

/**
 * Mounts a persistent SSE connection to /api/v1/alerts/stream.
 * Lives at the app-shell level so the map keeps refreshing even when
 * AlertsPanel is closed. Updates the TanStack Query cache on each push.
 *
 * Heartbeat guard: if no event arrives within HEARTBEAT_TIMEOUT_MS, the
 * connection is treated as a zombie, closed, and reconnected after
 * RECONNECT_DELAY_MS. This prevents stale "connected" state on network
 * degradation where the TCP connection stays open but data stops flowing.
 */
export function useAlertStream() {
  const qc = useQueryClient();
  const setConnected = useUIStore((s) => s.setAlertStreamConnected);
  const esRef = useRef<EventSource | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (esRef.current) return;

    function resetHeartbeat(es: EventSource) {
      if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
      heartbeatRef.current = setTimeout(() => {
        setConnected(false);
        es.close();
        esRef.current = null;
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }, HEARTBEAT_TIMEOUT_MS);
    }

    function connect() {
      const es = new EventSource(alertsStreamUrl());
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        resetHeartbeat(es);
      };

      es.onmessage = (evt) => {
        try {
          JSON.parse(evt.data); // validate frame
          // Heartbeat only resets on valid frames — malformed frames must not
          // mask a broken backend; the 30s heartbeat timeout will force reconnect.
          resetHeartbeat(es);
          // Invalidate so the full list (all statuses) refetches from the API.
          // Never use setQueryData here — SSE only carries active alerts and
          // would silently overwrite the panel's full history view.
          qc.invalidateQueries({ queryKey: ["alerts"] });
          qc.invalidateQueries({ queryKey: ["district-risk-summary"] });
          // flood-exposure is derived from polygon geometry, not alert counts —
          // no need to invalidate on every 10-second SSE heartbeat.
        } catch {
          // malformed frame — heartbeat not extended; reconnect will trigger after HEARTBEAT_TIMEOUT_MS
        }
      };

      es.onerror = () => {
        // Guard: ignore if a newer connection has already been established.
        // Without this, a rapid reconnect could leave alertStreamConnected=false
        // while the new SSE is actually live (stale error from old connection).
        if (esRef.current !== es) return;
        if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
        setConnected(false);
        es.close();
        esRef.current = null;
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [qc, setConnected]);
}
