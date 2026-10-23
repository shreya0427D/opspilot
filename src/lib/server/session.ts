import "server-only";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { forbidden, unauthorized } from "./errors";

// Firebase hosting products only forward a cookie with this exact name.
export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;

export interface SessionUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  authTime: number;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(value, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? "",
      emailVerified: decoded.email_verified === true,
      authTime: decoded.auth_time,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  if (!user.emailVerified) throw forbidden("Verify your email address first");
  return user;
}

export interface WorkspaceContext extends SessionUser {
  workspaceId: string;
}

/**
 * Resolves the caller's workspace from their own user record (never from client input)
 * and confirms membership. Every workspace-scoped route goes through this.
 */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const user = await requireUser();
  const db = adminDb();
  const userDoc = await db.doc(`users/${user.uid}`).get();
  const workspaceId = userDoc.get("defaultWorkspaceId") as string | undefined;
  if (!workspaceId) throw forbidden("Create a workspace first");
  const member = await db.doc(`workspaces/${workspaceId}/members/${user.uid}`).get();
  if (!member.exists) throw forbidden();
  return { ...user, workspaceId };
}

/** For destructive account operations: sign-in must be recent. */
export function requireRecentLogin(user: SessionUser, maxAgeSeconds = 5 * 60) {
  if (Date.now() / 1000 - user.authTime > maxAgeSeconds) {
    throw forbidden("Please sign in again to confirm this action");
  }
}
