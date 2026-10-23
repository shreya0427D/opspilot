"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/client/api";
import type { WithId } from "@/lib/client/firestore-hooks";
import type { Client } from "@/lib/domain/types";

export function ClientForm({ client, onDone }: { client?: WithId<Client>; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const emails = String(f.get("emails")).split(/[,;\s]+/).filter(Boolean);
    const currency = String(f.get("defaultCurrency")).trim().toUpperCase();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: String(f.get("name")),
        emails,
        company: String(f.get("company")) || undefined,
        defaultCurrency: currency || undefined,
      };
      if (client) await api(`/api/clients/${client.id}`, { method: "PUT", body });
      else await api("/api/clients", { body });
      toast.success(client ? "Client saved" : "Client added");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required maxLength={120} defaultValue={client?.name} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="emails">Billing email(s)</Label>
        <Input id="emails" name="emails" required defaultValue={client?.emails.join(", ")} placeholder="ap@client.com" />
        <p className="text-xs text-muted-foreground">Reminders can only go to these addresses. Separate several with commas.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="company">Company (optional)</Label>
          <Input id="company" name="company" maxLength={120} defaultValue={client?.company} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="defaultCurrency">Currency (optional)</Label>
          <Input id="defaultCurrency" name="defaultCurrency" maxLength={3} className="uppercase" defaultValue={client?.defaultCurrency} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : client ? "Save client" : "Add client"}
        </Button>
      </div>
    </form>
  );
}
