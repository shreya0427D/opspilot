// Landing-page copy and diagram data. Every capability described here exists in the app;
// sample records are illustrative and labelled as such wherever they appear.

export const GITHUB_URL = "https://github.com/shreya0427D/opspilot";
export const APP_ROUTE = "/app"; // redirects to /login when signed out
export const LOGIN_ROUTE = "/login";

export const SECTIONS = [
  { id: "hero", label: "Overview" },
  { id: "workflow", label: "How it works" },
  { id: "architecture", label: "Architecture" },
  { id: "product", label: "Product" },
  { id: "launch", label: "Get started" },
] as const;

export interface Stage {
  id: string;
  name: string;
  kicker: string;
  body: string;
  detail: string[];
}

export const STAGES: Stage[] = [
  {
    id: "upload",
    name: "Upload",
    kicker: "PDF, PNG, JPG or WEBP",
    body: "Drop invoices in. Each file is checked by its actual content, not its extension, before anything reads it.",
    detail: ["Up to 10 MB and 20 pages per file", "Exact duplicates are rejected", "Files stay private to your workspace"],
  },
  {
    id: "extract",
    name: "Extract",
    kicker: "Gemini reads the document",
    body: "The model copies invoice number, customer, dates, amounts and any payment marking exactly as printed — and nothing else.",
    detail: ["Output must match a strict schema", "Document text is treated as untrusted data", "Source pages are kept for review"],
  },
  {
    id: "validate",
    name: "Validate",
    kicker: "Code checks the numbers",
    body: "Totals must add up, dates must be real, and a PAID stamp only counts if nothing on the invoice contradicts it.",
    detail: ["Subtotal + tax must equal total", "Conflicting payment evidence goes to review", "Money is stored in exact minor units"],
  },
  {
    id: "organize",
    name: "Organize",
    kicker: "Clients and records",
    body: "Invoices are linked to clients by email. A new customer on a valid invoice becomes a client — once, never twice.",
    detail: ["Ambiguous matches go to review", "Overdue status uses your timezone", "Totals are kept per currency"],
  },
  {
    id: "approve",
    name: "Approve",
    kicker: "You decide what goes out",
    body: "Reminder drafts use your templates. Amounts and dates are inserted by code; you edit, approve or reject each email.",
    detail: ["Edited drafts are re-checked", "Paid invoices are never chased", "Nothing is sent before approval"],
  },
  {
    id: "complete",
    name: "Complete",
    kicker: "A report you can trust",
    body: "Approved emails are sent once, and the final report reflects what the email provider actually confirmed.",
    detail: ["Retries can't send duplicates", "Failures are reported, not hidden", "Every step is in the task timeline"],
  },
];

export type NodeId = "orchestrator" | "documents" | "data" | "action" | "verification" | "gemini" | "firestore";

export interface AgentNode {
  id: NodeId;
  name: string;
  role: string;
  body: string;
  x: number; // diagram coordinates (0-1000 x 0-640)
  y: number;
  kind: "core" | "lane" | "layer";
}

export const AGENT_NODES: AgentNode[] = [
  { id: "orchestrator", name: "Orchestrator", role: "Plans the work", body: "Classifies your request into a supported intent and builds the plan from fixed templates. It can't invent steps or tools.", x: 500, y: 320, kind: "core" },
  { id: "documents", name: "Document Intelligence", role: "Reads invoices", body: "Extracts invoice fields from PDFs and photos and answers questions about a specific uploaded document, citing pages.", x: 170, y: 190, kind: "lane" },
  { id: "data", name: "Data Analysis", role: "Queries your records", body: "Finds overdue invoices, totals what's outstanding per currency and looks up clients — all with plain code, not the model.", x: 830, y: 190, kind: "lane" },
  { id: "action", name: "Action Execution", role: "Drafts and sends", body: "Drafts reminders from your templates and sends approved emails with an idempotency key so retries never duplicate.", x: 830, y: 450, kind: "lane" },
  { id: "verification", name: "Verification & Approval", role: "Checks before anything leaves", body: "Re-checks every draft against its invoice, holds the batch for your approval, and confirms delivery with the provider.", x: 170, y: 450, kind: "lane" },
  { id: "gemini", name: "Gemini", role: "Model layer", body: "Server-side only. A shared key pool with bounded retries, same-tier fallback and project-aware quota handling.", x: 500, y: 70, kind: "layer" },
  { id: "firestore", name: "Firebase & Firestore", role: "Data & identity layer", body: "Authentication, workspace-scoped records and durable task state. Security rules keep each workspace private.", x: 500, y: 580, kind: "layer" },
];

export const AGENT_LINKS: [NodeId, NodeId][] = [
  ["orchestrator", "documents"],
  ["orchestrator", "data"],
  ["orchestrator", "action"],
  ["orchestrator", "verification"],
  ["orchestrator", "gemini"],
  ["orchestrator", "firestore"],
  ["documents", "gemini"],
  ["action", "verification"],
  ["data", "firestore"],
];

/** Sample run of "Chase all overdue invoices" through the system (illustration only). */
export const PLAYBACK: { from: NodeId; to: NodeId; label: string }[] = [
  { from: "orchestrator", to: "gemini", label: "Classify the request" },
  { from: "orchestrator", to: "data", label: "Find overdue invoices" },
  { from: "data", to: "firestore", label: "Read invoices and clients" },
  { from: "orchestrator", to: "action", label: "Draft reminder emails" },
  { from: "action", to: "verification", label: "Check drafts against invoices" },
  { from: "verification", to: "orchestrator", label: "Pause for your approval" },
];

export type ProductTab = "overview" | "invoices" | "clients" | "payments" | "documents" | "tasks" | "approvals";

export const PRODUCT_TABS: { id: ProductTab; label: string; title: string; body: string }[] = [
  { id: "overview", label: "Overview", title: "Your receivables at a glance", body: "Overdue and outstanding amounts per currency, items needing your attention, and recent tasks — computed from your records." },
  { id: "invoices", label: "Invoices", title: "Every invoice, with its evidence", body: "Filter by overdue, open, paid or needs review. Extracted invoices keep their checks and a link to the source page." },
  { id: "clients", label: "Clients", title: "Clients without the data entry", body: "Added by hand, imported from CSV, or created from a valid invoice. Reminders only go to saved addresses." },
  { id: "payments", label: "Payments", title: "Match payments by rule, confirm by hand", body: "Import a payments CSV; exact-rule matches are suggested and nothing is applied until you confirm." },
  { id: "documents", label: "Documents", title: "Upload once, read carefully", body: "See each file's status from upload to extraction, open the original, or delete it." },
  { id: "tasks", label: "Tasks", title: "A timeline for every request", body: "Each step shows its lane, attempts, timing and verification result, ending in a report of what actually happened." },
  { id: "approvals", label: "Approvals", title: "Nothing leaves without you", body: "Review a batch of drafts, edit any of them, and approve or reject each one. Sending is blocked until email is configured." },
];
