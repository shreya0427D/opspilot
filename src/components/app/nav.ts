import {
  ClipboardCheckIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  ReceiptIcon,
  SettingsIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

export const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/app/invoices", label: "Invoices", icon: ReceiptIcon },
  { href: "/app/clients", label: "Clients", icon: UsersIcon },
  { href: "/app/payments", label: "Payments", icon: WalletIcon },
  { href: "/app/documents", label: "Documents", icon: FileTextIcon },
  { href: "/app/tasks", label: "Tasks", icon: ListChecksIcon },
  { href: "/app/approvals", label: "Approvals", icon: ClipboardCheckIcon },
  { href: "/app/settings", label: "Settings", icon: SettingsIcon },
] as const;
