"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Short label shown in the fallback (e.g. "Alerts"). */
  label?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Isolates panel crashes so one broken component never takes down the
 * entire map view.  Critical for field operators who rely on other panels
 * staying alive during an incident.
 */
export class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  override componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error(
      `[PanelErrorBoundary] panel="${this.props.label ?? "unknown"}"`,
      error,
      info.componentStack,
    );
  }

  override render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-3 p-6 text-center h-full min-h-[120px]"
      >
        <span className="text-2xl" aria-hidden="true">⚠</span>
        <p className="text-sm font-semibold text-ink">
          {this.props.label
            ? `Panel "${this.props.label}" no disponible`
            : "Panel no disponible"}
        </p>
        <p className="text-xs text-ink-subtle max-w-xs">
          Error inesperado. Otros paneles siguen funcionando.
        </p>
        <button
          className="mt-1 rounded px-3 py-1 text-xs font-medium bg-surface-raised hover:bg-surface-raised/80 text-ink-subtle border border-border"
          onClick={() => this.setState({ hasError: false, message: "" })}
        >
          Reintentar
        </button>
      </div>
    );
  }
}
