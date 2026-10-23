"use client";

import type { User } from "firebase/auth";
import { api } from "./api";

/** Exchanges the user's fresh ID token for the server session cookie. */
export async function establishSession(user: User) {
  const idToken = await user.getIdToken(true);
  await api("/api/session", { body: { idToken } });
}

/** Only allow internal, app-relative redirect targets. */
export function safeNext(next: string | null, fallback = "/app") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-not-found": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
    "auth/weak-password": "Use at least 8 characters for your password.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/popup-closed-by-user": "Sign-in was canceled.",
    "auth/network-request-failed": "Network error. Check your connection.",
  };
  return map[code] ?? (err instanceof Error ? err.message : "Sign-in failed");
}
