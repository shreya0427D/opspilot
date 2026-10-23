# OpsPilot AI — Implementation Plan (v1)

Source of truth for scope: the approved spec (decision log D1–D31). This plan orders the work so each
phase ends in something runnable and tested.

## Phase 0 — Foundation
- Next.js 16 (App Router, TypeScript, Tailwind 4, shadcn/ui radix-nova), git, `.env*` ignored.
- Firebase config: `firebase.json`, emulators (Auth, Firestore, Storage) on project `demo-opspilot`.
- Firestore + Storage security rules (client is read-only; uploads only to own workspace path).
- Server env validation (`src/lib/env.ts`), Admin SDK init (emulator or ADC — no key files).
- `apphosting.yaml` with Secret Manager references.

## Phase 1 — Auth, workspace, shell
- Google + email/password sign-in, email verification required.
- `/api/session` exchanges a fresh ID token for an httpOnly session cookie (5 days).
- `proxy.ts` optimistic redirect; every route handler re-verifies the session + membership.
- Onboarding creates the workspace, owner membership and default templates.
- App shell: sidebar, mobile sheet, theme toggle, command bar.

## Phase 2 — Records
- Clients, invoices, payments CRUD via route handlers (zod-validated, audited).
- Money in integer minor units; per-currency totals; overdue computed in workspace timezone.
- CSV import for clients and payments; deterministic payment-match suggestions; confirm/reject.
- Sample-data seeding (`isSample: true`, never sendable).

## Phase 3 — Documents
- Client upload to `workspaces/{ws}/uploads/{id}/{name}` (rules enforce size/type/membership).
- `/api/documents/finalize`: magic-byte check, page count, sha256 dedupe, then queue extraction.
- Extraction: Gemini Flash, JSON schema output, zod validation, deterministic checks →
  `auto_accepted` or `needs_review`, with source pages.

## Phase 4 — Task engine + collections workflow
- Tasks/steps in Firestore; step leases claimed in transactions; Cloud Tasks dispatch in prod,
  in-process dispatch in dev.
- Orchestrator (Flash-Lite classify → fixed plan templates per intent; Flash for free-form plans).
- Tool registry with permission classes (`read`, `draft`, `write_internal`, `external`).
- Collections: find overdue → match clients → render template + model personalization →
  verify drafts → approval batch → send (Resend idempotency key) → report.
- Cancellation, bounded retries, `unknown` outcome for interrupted sends.

## Phase 5 — Scheduling, limits, deletion
- `/api/internal/cron/daily` (Cloud Scheduler) creates draft-only collections tasks.
- `/api/internal/cron/recover` re-queues expired leases.
- Per-workspace daily caps (tasks, model spend); usage records; audit log.
- Account deletion (recent login required) → recursive delete + storage purge.

## Phase 6 — Quality
- Vitest unit tests (money, overdue, matching, templates, draft verification, plan validation).
- Rules tests against emulators.
- Integration tests for engine (retry, lease expiry, cancel, duplicate submission, send crash).
- Extraction eval set (~30 invoices). Playwright E2E for the core journey.
- GitHub Actions CI; App Hosting auto-deploy from `main`.

## Launch checklist (blockers)
- Billing enabled on the beta project (Gemini paid tier, Blaze for Storage/Tasks/Scheduler).
- Resend domain verified (SPF/DKIM/DMARC) and `EMAIL_FROM` on that domain.
- Privacy policy + terms reviewed.
- Budget alert at $25; unused Gemini keys revoked.
