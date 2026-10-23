"use client";

import { orderBy } from "firebase/firestore";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ClientForm } from "@/components/app/client-form";
import { CsvImportButton } from "@/components/app/csv-import";
import { EmptyState, ErrorState, PageHeader } from "@/components/app/page-header";
import { useWsPath } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLiveCollection } from "@/lib/client/firestore-hooks";
import { money, outstandingOf } from "@/lib/client/format";
import { totalsByCurrency } from "@/lib/domain/money";
import type { Client, Invoice } from "@/lib/domain/types";

export default function ClientsPage() {
  const clients = useLiveCollection<Client>(useWsPath("clients"), [orderBy("name")], "byName");
  const invoices = useLiveCollection<Invoice>(useWsPath("invoices"));
  const [creating, setCreating] = useState(false);

  const outstandingByClient = new Map<string, Record<string, number>>();
  for (const c of clients.data) {
    const open = invoices.data.filter((i) => i.clientId === c.id && (i.status === "open" || i.status === "partially_paid") && i.currency);
    outstandingByClient.set(c.id, totalsByCurrency(open, (i) => ({ currency: i.currency!, minor: outstandingOf(i) })));
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Clients"
        description="Reminders are only ever sent to the email addresses saved here."
        actions={
          <>
            <CsvImportButton kind="clients" hint="Columns: name, email, company, currency" />
            <Button onClick={() => setCreating(true)}>
              <PlusIcon /> Add client
            </Button>
          </>
        }
      />
      {clients.error && <ErrorState message={clients.error} />}
      {clients.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : clients.data.length === 0 ? (
        <EmptyState title="No clients yet" description="Add clients by hand or import a CSV with columns name, email, company, currency." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.data.map((c) => {
                const totals = Object.entries(outstandingByClient.get(c.id) ?? {});
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/app/clients/${c.id}`} className="underline-offset-4 hover:underline">
                        {c.name}
                      </Link>
                      {c.isSample && <StatusBadge status="sample" className="ml-2" />}
                    </TableCell>
                    <TableCell className="hidden max-w-60 truncate text-muted-foreground sm:table-cell">{c.emails.join(", ") || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totals.length ? totals.map(([cur, m]) => <div key={cur}>{money(m, cur)}</div>) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add client</DialogTitle>
          </DialogHeader>
          <ClientForm onDone={() => setCreating(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
