import "server-only";
import type { Client, Invoice, Workspace } from "@/lib/domain/types";
import { ws } from "@/lib/server/workspace-data";

export async function loadWorkspace(workspaceId: string): Promise<Workspace> {
  return (await ws(workspaceId).root.get()).data() as Workspace;
}

export async function loadClients(workspaceId: string): Promise<(Client & { id: string })[]> {
  const snap = await ws(workspaceId).clients.get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Client) }));
}

export const outstanding = (inv: Pick<Invoice, "totalMinor" | "paidMinor">) =>
  Math.max(0, (inv.totalMinor ?? 0) - inv.paidMinor);

/** One overdue invoice as passed between collection steps. */
export interface OverdueItem {
  invoiceId: string;
  number: string;
  clientId: string | null;
  currency: string;
  outstandingMinor: number;
  dueDate: string;
  daysOverdue: number;
  reminderStage: Invoice["reminderStage"];
  lastRemindedAtMs: number | null;
  isSample: boolean;
}
