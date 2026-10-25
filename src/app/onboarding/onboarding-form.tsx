"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/client/api";

export function OnboardingForm({ email }: { email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("/api/workspace", {
        body: {
          name: String(f.get("name")),
          senderName: String(f.get("senderName")),
          replyToEmail: String(f.get("replyToEmail")),
          timezone: String(f.get("timezone")),
        },
      });
      router.replace("/app");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Set up your workspace" description="This is how your reminders will be signed and where replies go.">
      <form onSubmit={onSubmit} className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="name">Business name</Label>
          <Input id="name" name="name" required maxLength={80} placeholder="e.g. Priya Design Studio" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="senderName">Sign reminders as</Label>
          <Input id="senderName" name="senderName" required maxLength={80} placeholder="e.g. Priya" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="replyToEmail">Replies go to</Label>
          <Input id="replyToEmail" name="replyToEmail" type="email" required defaultValue={email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={timezone}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Used to decide when an invoice becomes overdue.</p>
        </div>
        <Button type="submit" className="w-full" disabled={busy || !hydrated}>
          {busy ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </AuthCard>
  );
}
