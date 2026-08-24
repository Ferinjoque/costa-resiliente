"use client";

import { create } from "zustand";
import { bumpAuthGeneration, loginOperator, register401Handler } from "@/lib/api";

export interface Operator {
  id: number;
  username: string;
  full_name: string;
  role: "coen" | "coer" | "coel";
  district_ubigeo: string | null;
}

interface AuthState {
  token: string | null;
  operator: Operator | null;
  loginModalOpen: boolean;
  /**
   * Stops the 401 handler from reopening the login modal. Background queries
   * poll continuously, so every one of them answers 401 once the operator signs
   * out or dismisses the prompt. Without this the modal reappears seconds later,
   * over and over.
   */
  suppressLoginPrompt: boolean;
  setLoginModalOpen: (v: boolean) => void;
  /**
   * Raise the login modal for an action the operator just tried to take. Unlike
   * a background 401, this is never suppressed: they asked for something that
   * needs a session, so they get the chance to sign in.
   */
  promptLogin: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

const LS_TOKEN = "cr_auth_token";
const LS_OPERATOR = "cr_auth_operator";

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  operator: null,
  loginModalOpen: false,
  suppressLoginPrompt: false,
  // Opening the modal is always deliberate, so it clears the suppression.
  // Closing it means the operator does not want to be asked again, unless they
  // are signed in: dismissing the panel then says nothing about whether they
  // want a prompt when the session eventually expires.
  setLoginModalOpen: (v) =>
    set((state) => ({
      loginModalOpen: v,
      suppressLoginPrompt: v ? false : state.token === null,
    })),

  promptLogin: () => set({ loginModalOpen: true, suppressLoginPrompt: false }),

  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const token = localStorage.getItem(LS_TOKEN);
      const raw = localStorage.getItem(LS_OPERATOR);
      const operator = raw ? (JSON.parse(raw) as Operator) : null;
      if (token && operator) set({ token, operator });
    } catch {
      // corrupted storage: ignore
    }
    // Register the 401 handler so a stale/expired token triggers auto-logout
    // and the login modal instead of a confusing "unauthorized" error toast.
    register401Handler(() => {
      if (typeof window === "undefined") return;
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_OPERATOR);
      set((state) => ({
        token: null,
        operator: null,
        loginModalOpen: state.loginModalOpen || !state.suppressLoginPrompt,
      }));
    });
  },

  login: async (username, password) => {
    const resp = await loginOperator(username, password);
    const operator: Operator = {
      id: resp.operator_id,
      username: resp.username,
      full_name: resp.full_name,
      role: resp.role as Operator["role"],
      district_ubigeo: resp.district_ubigeo,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_TOKEN, resp.access_token);
      localStorage.setItem(LS_OPERATOR, JSON.stringify(operator));
    }
    // Start a new session generation so 401s from requests issued before this
    // login cannot sign the operator straight back out.
    bumpAuthGeneration();
    set({ token: resp.access_token, operator, suppressLoginPrompt: false });
  },

  logout: () => {
    bumpAuthGeneration();
    if (typeof window !== "undefined") {
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_OPERATOR);
    }
    // An explicit sign-out is not an expired session: do not prompt again until
    // the operator asks for the login modal.
    set({ token: null, operator: null, loginModalOpen: false, suppressLoginPrompt: true });
  },
}));

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_TOKEN);
}
