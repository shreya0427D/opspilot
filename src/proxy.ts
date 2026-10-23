import { NextResponse, type NextRequest } from "next/server";

// Optimistic redirect only. Real authorization happens in the server layout and every route handler.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("__session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/onboarding"],
};
