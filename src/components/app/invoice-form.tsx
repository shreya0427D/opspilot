"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/client/api";
import type { WithId } from "@/lib/client/firestore-hooks";
import { currencyExponent, isCurrencyCode, parseAmountToMinor } from "@/lib/domain/money";
import type { Client, Invoice } from "@/lib/domain/types";

const toMajor = (minor: number | null | undefined, currency: string | null | undefined) =>
  minor === null || minor === undefined || !currency || !isCurrencyCode(currency)
    ? ""
    : (minor / 10 ** currencyExponent(currency)).toFixed(currencyExponent(currency));

/** Create or edit an invoice. For an invoice under review, saving confirms it. */
export function InvoiceForm({
  clients,
  invoice,
  onDone,
  submitLabel,
}: {
  clients: WithId<Client>[];
  invoice?: WithId<Invoice>;
  onDone: () => void;
  submitLabel: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(invoice?.clientId ?? "");
  const [creatingClient, setCreatingClient] = useState(false);
  const suggestedEmail = invoice?.clientEmailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice.clientEmailRaw) ? invoice.clientEmailRaw : null;
  const canSuggestClient = !!invoice && !invoice.clientId && !!invoice.clientNameRaw && !!suggestedEmail;

  // Creates the client exactly as printed on the invoice; the server rejects duplicates.
  async function createSuggestedClient() {
    if (!invoice?.clientNameRaw || !suggestedEmail) return;
    setCreatingClient(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/clients", { body: { name: invoice.clientNameRaw, emails: [suggestedEmail] } });
      setClientId(id);
      toast.success(`Client “${invoice.clientNameRaw}” added`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatingClient(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const currency = String(f.get("currency")).trim().toUpperCase();
    if (!isCurrencyCode(currency)) return setError("Enter a 3-letter currency code such as USD or INR.");
    const totalMinor = parseAmountToMinor(String(f.get("total")), currency);
    const paidMinor = parseAmountToMinor(String(f.get("paid") || "0"), currency);
    if (!totalMinor || paidMinor === null) return setError("Amounts must be numbers like 1250 or 1,250.00.");
    setBusy(true);
    setError(null);
    try {
      const body = {
        number: String(f.get("number")),
        clientId: String(f.get("clientId")),
        issueDate: String(f.get("issueDate")),
        dueDate: String(f.get("dueDate")),
        currency,
        totalMinor,
        paidMinor,
      };
      if (invoice) await api(`/api/invoices/${invoice.id}`, { method: "PUT", body });
      else await api("/api/invoices", { body });
      toast.success(invoice ? "Invoice saved" : "Invoice added");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const cur = invoice?.currency ?? "";
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      {error && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="number">Invoice number</Label>
        <Input id="number" name="number" required maxLength={64} defaultValue={invoice?.number ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="clientId">Client</Label>
        <select
          id="clientId"
          name="clientId"
          required
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="" disabled>
            {clients.length ? "Choose a client" : "Add a client first"}
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.isSample ? " (sample)" : ""}
            </option>
          ))}
        </select>
        {invoice?.clientNameRaw && !invoice.clientId && (
          <p className="text-xs text-muted-foreground">
            Document says: “{invoice.clientNameRaw}”{invoice.clientEmailRaw ? ` · ${invoice.clientEmailRaw}` : " · no email printed"}
          </p>
        )}
        {canSuggestClient && !clientId && (
          <Button type="button" size="sm" variant="outline" disabled={creatingClient} onClick={createSuggestedClient}>
            {creatingClient ? "Adding…" : `Add “${invoice!.clientNameRaw}” as a client`}
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="issueDate">Issue date</Label>
        <Input id="issueDate" name="issueDate" type="date" required defaultValue={invoice?.issueDate ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dueDate">Due date</Label>
        <Input id="dueDate" name="dueDate" type="date" required defaultValue={invoice?.dueDate ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="currency">Currency</Label>
        <Input id="currency" name="currency" required maxLength={3} placeholder="USD" defaultValue={cur} className="uppercase" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="total">Total</Label>
        <Input id="total" name="total" required inputMode="decimal" defaultValue={toMajor(invoice?.totalMinor, cur)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="paid">Already paid</Label>
        <Input id="paid" name="paid" inputMode="decimal" defaultValue={toMajor(invoice?.paidMinor ?? 0, cur) || "0"} />
      </div>
      <div className="flex items-end justify-end sm:col-span-2">
        <Button type="submit" disabled={busy || clients.length === 0}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
