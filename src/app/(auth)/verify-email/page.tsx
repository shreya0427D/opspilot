"use client";

import { onAuthStateChanged, sendEmailVerification, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { establishSession } from "@/lib/client/session";
import { firebase } from "@/lib/firebase/client";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(firebase().auth, (u) => (u ? setUser(u) : router.replace("/login"))), [router]);

  async function check() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await user.reload();
      if (!user.emailVerified) {
        setError("Not verified yet. Open the link in the email we sent, then try again.");
        return;
      }
      await establishSession(user);
      router.replace("/onboarding");
    } catch {
      // Session creation requires a recent sign-in; send them back to sign in fresh.
      router.replace("/login?next=/onboarding");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Verify your email" description={user?.email ? `We sent a link to ${user.email}.` : "We sent you a verification link."}>
      <div className="space-y-3">
        {error && (
          <Alert>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button className="w-full" onClick={check} disabled={busy || !user}>
          I&apos;ve verified my email
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          disabled={!user}
          onClick={async () => {
            if (!user) return;
            try {
              await sendEmailVerification(user);
              toast.success("Verification email sent");
            } catch {
              toast.error("Couldn't send right now. Wait a minute and try again.");
            }
          }}
        >
          Resend email
        </Button>
      </div>
    </AuthCard>
  );
}
