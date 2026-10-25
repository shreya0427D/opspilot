"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false} disableTransitionOnChange nonce={nonce}>
      {children}
    </NextThemes>
  );
}
