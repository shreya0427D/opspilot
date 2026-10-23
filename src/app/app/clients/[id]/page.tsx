"use client";

import { where } from "firebase/firestore";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClientForm } from "@/components/app/client-form";
import { ErrorState, PageHeader } from "@/components/app/page-header";
import { useAuth, useWsPath } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/client/api";
import { useLiveCollection, useLiveDoc } from "@/lib/client/firestore-hooks";
import { formatDate, invoiceDisplayStatus, money, outstandingOf } from "@/lib/client/format";
import type { Client, Invoice } from "@/lib/domain/types";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { workspace } = useAuth();
  const base = useWsPath("clients");
  const client = useLiveDoc<Client>(base ? `${base}/${id}` : null);
  const invoices = useLiveCollection<Invoice>(useWsPath("invoices"), [where("clientId", "==", id)], id);

  if (client.loading) return <Skeleton className="mx-auto h-64 max-w-3xl" />;
  if (client.error) return <ErrorState message={client.error} />;
  if (!client.data) return <p className="text-sm text-muted-foreground">Client not found.</p>;

  async function remove() {
    if (!confirm("Delete this client?")) return;
    try {
      await api(`/api/clients/${id}`, { method: "DELETE" });
      router.replace("/app/clients");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/app/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Clients
      </Link>
      <PageHeader
        title={client.data.name}
        description={client.data.isSample ? <StatusBadge status="sample" /> : client.data.company}
        actions={
          <Button variant="ghost" className="text-destructive" onClick={remove}>
            Delete
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientForm key={client.data.emails.join()} client={client.data} onDone={() => undefined} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices for this client.</p>
          ) : (
            <ul className="divide-y text-sm">
              {invoices.data.map((inv) => (
                <li key={inv.id}>
                  <Link href={`/app/invoices/${inv.id}`} className="flex items-center gap-3 py-2 hover:bg-muted/40">
                    <span className="flex-1 font-medium">{inv.number ?? "Untitled"}</span>
                    <span className="hidden text-muted-foreground sm:inline">Due {formatDate(inv.dueDate)}</span>
                    <span className="tabular-nums">{money(outstandingOf(inv), inv.currency)}</span>
                    <StatusBadge status={invoiceDisplayStatus(inv, workspace?.timezone ?? "UTC")} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
