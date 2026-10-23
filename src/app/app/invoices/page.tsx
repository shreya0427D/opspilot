"use client";

import { orderBy } from "firebase/firestore";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { InvoiceForm } from "@/components/app/invoice-form";
import { EmptyState, ErrorState, PageHeader } from "@/components/app/page-header";
import { useAuth, useWsPath } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLiveCollection } from "@/lib/client/firestore-hooks";
import { formatDate, invoiceDisplayStatus, money, outstandingOf } from "@/lib/client/format";
import type { Client, Invoice } from "@/lib/domain/types";

const FILTERS = ["all", "overdue", "open", "needs_review", "paid"] as const;
type Filter = (typeof FILTERS)[number];

function InvoicesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const filter = (FILTERS.includes(params.get("filter") as Filter) ? params.get("filter") : "all") as Filter;
  const { workspace } = useAuth();
  const invoices = useLiveCollection<Invoice>(useWsPath("invoices"), [orderBy("createdAt", "desc")], "all");
  const clients = useLiveCollection<Client>(useWsPath("clients"), [orderBy("name")], "byName");
  const [creating, setCreating] = useState(false);
  const clientName = new Map(clients.data.map((c) => [c.id, c.name]));
  const tz = workspace?.timezone ?? "UTC";

  const rows = invoices.data
    .map((inv) => ({ inv, display: invoiceDisplayStatus(inv, tz) }))
    .filter(({ inv, display }) => {
      if (filter === "all") return true;
      if (filter === "overdue") return display === "overdue";
      if (filter === "open") return inv.status === "open" || inv.status === "partially_paid";
      if (filter === "needs_review") return inv.reviewStatus === "needs_review";
      return inv.status === "paid";
    });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Invoices"
        description="Amounts are stored exactly; overdue is computed in your timezone."
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> Add invoice
          </Button>
        }
      />
      <Tabs value={filter} onValueChange={(v) => router.replace(v === "all" ? "/app/invoices" : `/app/invoices?filter=${v}`)} className="mb-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="needs_review">Needs review</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
        </TabsList>
      </Tabs>

      {invoices.error && <ErrorState message={invoices.error} />}
      {invoices.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "No invoices yet" : "Nothing here"}
          description={filter === "all" ? "Upload invoice files on the Documents page, or add one by hand." : undefined}
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="hidden md:table-cell">Due</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ inv, display }) => (
                <TableRow key={inv.id} className="cursor-pointer" onClick={() => router.push(`/app/invoices/${inv.id}`)}>
                  <TableCell className="font-medium">
                    <Link href={`/app/invoices/${inv.id}`} onClick={(e) => e.stopPropagation()}>
                      {inv.number ?? "Untitled"}
                    </Link>
                    {inv.isSample && <StatusBadge status="sample" className="ml-2" />}
                  </TableCell>
                  <TableCell className="max-w-40 truncate">
                    {inv.clientId ? clientName.get(inv.clientId) ?? "—" : <span className="text-muted-foreground">{inv.clientNameRaw ?? "Unlinked"}</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{formatDate(inv.dueDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(outstandingOf(inv), inv.currency)}</TableCell>
                  <TableCell>
                    <StatusBadge status={display} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add invoice</DialogTitle>
            <DialogDescription>For invoices you don&apos;t have as a file.</DialogDescription>
          </DialogHeader>
          <InvoiceForm clients={clients.data} onDone={() => setCreating(false)} submitLabel="Add invoice" />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense>
      <InvoicesInner />
    </Suspense>
  );
}
