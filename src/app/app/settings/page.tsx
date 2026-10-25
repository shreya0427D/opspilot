"use client";

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { useAuth, useWsPath } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/client/api";
import { useLiveCollection, useLiveDoc } from "@/lib/client/firestore-hooks";
import { establishSession } from "@/lib/client/session";
import { todayInZone } from "@/lib/domain/dates";
import { PLACEHOLDERS } from "@/lib/domain/reminders";
import { REMINDER_STAGES, type Template, type UsageDaily } from "@/lib/domain/types";
import { firebase } from "@/lib/firebase/client";

export default function SettingsPage() {
  const { workspace, user } = useAuth();
  const templates = useLiveCollection<Template>(useWsPath("templates"));
  const usageBase = useWsPath("usageDaily");
  const usage = useLiveDoc<UsageDaily>(usageBase && workspace ? `${usageBase}/${todayInZone(workspace.timezone)}` : null);

  if (!workspace || !user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Settings" />
      <WorkspaceCard key={`${workspace.name}${workspace.senderName}${workspace.replyToEmail}`} />
      <Card>
        <CardHeader>
          <CardTitle>Reminder templates</CardTitle>
          <CardDescription>
            Placeholders are filled from your records by code, not by AI: {PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ")}. The AI only writes
            the {"{{personal_note}}"} sentence, and it isn&apos;t allowed to include numbers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {REMINDER_STAGES.map((stage) => {
            const t = templates.data.find((x) => x.stage === stage);
            return t ? <TemplateEditor key={`${stage}-${t.subject}-${t.body.length}`} template={t} /> : null;
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s usage</CardTitle>
          <CardDescription>Daily limits protect you from runaway costs. They reset at midnight in your timezone.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Tasks" value={String(usage.data?.tasks ?? 0)} />
          <Stat label="AI calls" value={String(usage.data?.modelCalls ?? 0)} />
          <Stat label="AI spend (est.)" value={`$${((usage.data?.costMicros ?? 0) / 1_000_000).toFixed(3)}`} />
          <Stat label="Emails sent" value={String(usage.data?.emailsSent ?? 0)} />
        </CardContent>
      </Card>
      <SampleCard />
      <DangerCard />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium tabular-nums">{value}</div>
    </div>
  );
}

function WorkspaceCard() {
  const { workspace } = useAuth();
  const [busy, setBusy] = useState(false);
  const [daily, setDaily] = useState(workspace!.dailyCheck);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("/api/workspace", {
        method: "PATCH",
        body: {
          name: String(f.get("name")),
          senderName: String(f.get("senderName")),
          replyToEmail: String(f.get("replyToEmail")),
          dailyCheck: daily,
        },
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
        <CardDescription>Timezone: {workspace!.timezone}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Business name</Label>
            <Input id="name" name="name" defaultValue={workspace!.name} required maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senderName">Sign reminders as</Label>
            <Input id="senderName" name="senderName" defaultValue={workspace!.senderName} required maxLength={80} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="replyToEmail">Replies go to</Label>
            <Input id="replyToEmail" name="replyToEmail" type="email" defaultValue={workspace!.replyToEmail} required />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Checkbox id="daily" checked={daily.enabled} onCheckedChange={(v) => setDaily((d) => ({ ...d, enabled: v === true }))} />
            <Label htmlFor="daily" className="font-normal">
              Check for newly overdue invoices every day at
            </Label>
            <select
              aria-label="Hour"
              value={daily.hourLocal}
              onChange={(e) => setDaily((d) => ({ ...d, hourLocal: Number(e.target.value) }))}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">It only drafts emails for your approval.</span>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TemplateEditor({ template }: { template: Template }) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [toneNotes, setToneNotes] = useState(template.toneNotes);
  const [busy, setBusy] = useState(false);
  const dirty = subject !== template.subject || body !== template.body || toneNotes !== template.toneNotes;

  async function save() {
    setBusy(true);
    try {
      await api("/api/templates", { method: "PUT", body: { stage: template.stage, subject, body, toneNotes } });
      toast.success(`${template.stage} template saved`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium capitalize">{template.stage}</h3>
      <Input aria-label={`${template.stage} subject`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
      <Textarea aria-label={`${template.stage} body`} value={body} onChange={(e) => setBody(e.target.value)} rows={7} maxLength={5000} />
      <Input aria-label={`${template.stage} tone notes`} value={toneNotes} onChange={(e) => setToneNotes(e.target.value)} placeholder="Tone notes for the AI" maxLength={500} />
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={save} disabled={!dirty || busy}>
          Save template
        </Button>
      </div>
    </div>
  );
}

function SampleCard() {
  const [busy, setBusy] = useState(false);
  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    try {
      await api("/api/sample", { method });
      toast.success(method === "POST" ? "Sample data loaded" : "Sample data removed");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sample data</CardTitle>
        <CardDescription>Fake clients and invoices for trying the workflow. They are labelled everywhere and can never be emailed.</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button variant="outline" disabled={busy} onClick={() => call("POST")}>
          Load sample data
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => call("DELETE")}>
          Remove sample data
        </Button>
      </CardContent>
    </Card>
  );
}

/** Turns re-authentication and deletion failures into a message the user can act on. */
function deleteErrorMessage(err: unknown) {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "That password is incorrect. Enter your current password to confirm.";
    case "auth/missing-password":
      return "Enter your password to confirm.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "The Google sign-in window was closed before you confirmed. Try again and finish signing in.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.";
    case "auth/user-mismatch":
      return "That Google account isn't the one you're signed in with. Choose the same account.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network error while confirming your identity. Check your connection and try again.";
  }
  return errorMessage(err);
}

function DangerCard() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const usesPassword = user?.providerData.some((p) => p.providerId === "password");

  async function confirmDelete() {
    if (!user) return;
    setBusy(true);
    try {
      // Deletion requires a fresh sign-in, then a fresh session cookie carrying it.
      if (usesPassword) await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? "", password));
      else await reauthenticateWithPopup(user, new GoogleAuthProvider());
      await establishSession(user);
      await api("/api/account", { method: "DELETE" });
      await signOut(firebase().auth);
      router.replace("/");
    } catch (err) {
      toast.error(deleteErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>Permanently deletes your workspace, clients, invoices, uploaded files, task history and login.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete everything?</DialogTitle>
            <DialogDescription>This can&apos;t be undone. Confirm your identity to continue.</DialogDescription>
          </DialogHeader>
          {usesPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy || (usesPassword && !password)}>
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
