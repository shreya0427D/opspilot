import { cookies } from "next/headers";
import { z } from "zod";
import { adminAuth } from "@/lib/firebase/admin";
import { forbidden, unauthorized } from "@/lib/server/errors";
import { handler, ok, readJson } from "@/lib/server/route";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, getSessionUser } from "@/lib/server/session";

// Exchanges a freshly minted Firebase ID token for an httpOnly session cookie.
export const POST = handler(async (req) => {
  const { idToken } = await readJson(req, z.object({ idToken: z.string().min(10) }));
  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch {
    throw unauthorized("Sign-in expired, please try again");
  }
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60) throw unauthorized("Please sign in again");
  if (!decoded.email_verified) throw forbidden("Verify your email address first");

  const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 });
  (await cookies()).set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return ok();
});

export const DELETE = handler(async () => {
  const user = await getSessionUser();
  if (user) await adminAuth().revokeRefreshTokens(user.uid);
  (await cookies()).delete(SESSION_COOKIE);
  return ok();
});
