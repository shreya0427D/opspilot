import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Instrument_Serif({ variable: "--font-serif-display", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "OpsPilot", template: "%s · OpsPilot" },
  description: "Get paid on time. OpsPilot reads your invoices, drafts reminders, and sends only what you approve.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set per request by proxy.ts; the theme script must carry it to run under the CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-[#b89150]/30">
        <ThemeProvider nonce={nonce}>
          <TooltipProvider>
            {children}
            <Toaster richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
