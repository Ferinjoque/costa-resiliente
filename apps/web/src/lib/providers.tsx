"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { useUIStore } from "@/store/ui";
import esMessages from "../../messages/es.json";
import enMessages from "../../messages/en.json";

const MESSAGES = { es: esMessages, en: enMessages } as const;

function IntlWrapper({ children }: { children: ReactNode }) {
  const locale = useUIStore((s) => s.locale);
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <IntlWrapper>{children}</IntlWrapper>
    </QueryClientProvider>
  );
}
