// Content-Security-Policy for page responses. A fresh nonce per request lets Next.js's own
// scripts run; 'strict-dynamic' lets those scripts load what they need (e.g. the Firebase Auth
// Google-popup helper from apis.google.com) while blocking any injected script.
//
// Exceptions, each required by the app:
// - style-src 'unsafe-inline': React/Radix/sonner set inline style attributes, which nonces
//   can't cover. Inline styles can't execute code.
// - connect-src Google APIs: Firebase Auth (identitytoolkit, securetoken), Firestore and Storage.
// - frame-src auth domain + Google: Firebase Auth's hidden iframe and Google sign-in.
// Gemini and Resend are only called from the server, so they need no browser allowance.

export function buildCsp(
  nonce: string,
  opts: { authDomain?: string; emulators?: boolean; dev?: boolean } = {},
): string {
  const authDomain = opts.authDomain ? `https://${opts.authDomain}` : "";
  const emulatorHosts = opts.emulators
    ? "http://127.0.0.1:9099 http://127.0.0.1:8080 http://127.0.0.1:9199 ws://127.0.0.1:8080"
    : "";

  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": `'self' 'nonce-${nonce}' 'strict-dynamic' https://apis.google.com${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": "'self' data: blob: https://*.googleusercontent.com",
    "font-src": "'self' data:",
    "connect-src": [
      "'self'",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://firestore.googleapis.com",
      "https://firebasestorage.googleapis.com",
      "https://www.googleapis.com",
      "https://apis.google.com",
      emulatorHosts,
    ]
      .filter(Boolean)
      .join(" "),
    "frame-src": [authDomain, "https://apis.google.com", "https://accounts.google.com"].filter(Boolean).join(" "),
    "worker-src": "'self' blob:",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v}`);
  // Upgrading would break plain-http emulator connections in local development.
  if (!opts.emulators && !opts.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
