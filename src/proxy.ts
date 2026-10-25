import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

const PROTECTED = /^\/(app|onboarding)(\/|$)/;

export function proxy(request: NextRequest) {
  // Optimistic redirect only. Real authorization happens in the server layout and every route handler.
  if (PROTECTED.test(request.nextUrl.pathname) && !request.cookies.has("__session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, {
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    emulators: process.env.NEXT_PUBLIC_USE_EMULATORS === "true",
    dev: process.env.NODE_ENV === "development",
  });

  // Next.js reads the nonce from the request's CSP header and applies it to its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes return JSON (the document route sets its own sandbox CSP).
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
