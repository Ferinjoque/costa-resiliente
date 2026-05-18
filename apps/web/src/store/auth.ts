"use client";

import { create } from "zustand";
import { loginOperator } from "@/lib/api";

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
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

const LS_TOKEN = "cr_auth_token";
const LS_OPERATOR = "cr_auth_operator";

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  operator: null,

  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const token = localStorage.getItem(LS_TOKEN);
      const raw = localStorage.getItem(LS_OPERATOR);
      const operator = raw ? (JSON.parse(raw) as Operator) : null;
      if (token && operator) set({ token, operator });
    } catch {
      // corrupted storage — ignore
    }
  },

  login: async (username, password) => {
    const resp = await loginOperator(username, password);
    const operator: Operator = {
      id: resp.operator_id,
      username,
      full_name: username,
      role: resp.role as Operator["role"],
      district_ubigeo: resp.district_ubigeo,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_TOKEN, resp.access_token);
      localStorage.setItem(LS_OPERATOR, JSON.stringify(operator));
    }
    set({ token: resp.access_token, operator });
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_OPERATOR);
    }
    set({ token: null, operator: null });
  },
}));

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_TOKEN);
}
