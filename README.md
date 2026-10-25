# OpsPilot

An operations agent for freelancers. It reads invoices, finds what's overdue, drafts reminder emails, and sends them only after you approve them. Every task has a step-by-step record and a final report built from what the email provider confirmed.

**Principle:** the model classifies requests and writes wording. Server code enforces permissions, does all money/date math, inserts every fact into emails, and decides what happened.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · shadcn/ui · Firebase Auth / Firestore / Storage · Gemini API · Resend · Cloud Tasks + Cloud Scheduler · Firebase App Hosting

## Local development

Requirements: Node 22+, Java 21+ (for the Firebase Emulators).

```bash
npm install
cp .env.example .env.local        # fill in GEMINI_API_KEY, CRON_SECRET (32+ chars)
npm run dev:emulators             # terminal 1: Auth, Firestore, Storage on demo-opspilot
npm run dev                       # terminal 2: http://localhost:3000
```

With `NEXT_PUBLIC_USE_EMULATORS=true`, nothing touches the real Firebase project. Tasks run in-process; to resume a stuck one locally:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Origin: http://localhost:3000" http://localhost:3000/api/internal/cron/recover
```

## Tests

| Command | What it covers |
|---|---|
| `npm test` | Unit: money, dates, matching, templates, draft verification, invoice checks, plan templates |
| `npm run test:emulator` | Firestore/Storage security rules; task engine end-to-end (approval gate, dedupe, retries with idempotency, cancel, crash recovery, model outage) |
| `npm run test:live` | Real Gemini calls: model IDs exist, schemas accepted, PDF extraction ignores embedded instructions, PAID stamps detected |
| `npm run test:e2e` | Chromium end-to-end on a running app (`next start -p 3300` + emulators): signup → onboarding → upload 6 synthetic invoices → statuses → drafts (stops before sending) → persistence → isolation → CSP violations |

## Layout

```
src/lib/domain/        pure logic (money, dates, matching, reminders, checks, types, input schemas)
src/lib/ai/            model router, Gemini client (retries, fallbacks, budget), prompts
src/lib/tasks/         durable task engine, plan templates, tool registry, tools
src/lib/server/        session, route wrapper, audit/usage, email, services
src/app/api/           route handlers (thin; all authorize via requireWorkspace)
src/app/app/           authenticated UI
firestore.rules        browser is read-only, membership-scoped
storage.rules          uploads only into your own workspace, PDF/PNG/JPG/WEBP ≤10 MB
```

## Deploying the beta (Firebase App Hosting)

Launch blockers, in order:

1. **Billing**: upgrade the Firebase project to Blaze and enable billing on the Gemini API project (unpaid Gemini usage may be used by Google to improve its products). Add a $25 budget alert.
2. **Resend**: verify your sending domain (SPF, DKIM, DMARC). Set `EMAIL_FROM` to an address on it — a gmail.com address will be refused.
3. **Legal**: replace the draft `/privacy` and `/terms` pages with reviewed versions.
4. **Keys**: keep one Gemini key for production in Secret Manager; revoke the unused ones.

Then:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase apphosting:secrets:set gemini-api-key
firebase apphosting:secrets:set resend-api-key
firebase apphosting:secrets:set cron-secret
# Cloud Tasks queue + invoker service account
gcloud tasks queues create opspilot-steps --location=us-central1 --max-attempts=5 --max-concurrent-dispatches=10
gcloud iam service-accounts create opspilot-tasks
#  - grant the App Hosting backend's service account roles/cloudtasks.enqueuer and roles/iam.serviceAccountUser on opspilot-tasks
# Scheduler (OIDC as opspilot-tasks, audience = app URL)
gcloud scheduler jobs create http opspilot-daily   --schedule="0 * * * *"    --uri="$APP_URL/api/internal/cron/daily"   --http-method=POST --oidc-service-account-email=opspilot-tasks@PROJECT.iam.gserviceaccount.com --oidc-token-audience="$APP_URL" --location=us-central1
gcloud scheduler jobs create http opspilot-recover --schedule="*/10 * * * *" --uri="$APP_URL/api/internal/cron/recover" --http-method=POST --oidc-service-account-email=opspilot-tasks@PROJECT.iam.gserviceaccount.com --oidc-token-audience="$APP_URL" --location=us-central1
```

Update `apphosting.yaml` (`NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`), connect the GitHub repo in the Firebase console, and App Hosting deploys from `main`. Roll back by promoting a previous rollout in the console.

## Deploying on Vercel instead

Vercel works too. Background steps then run through authenticated calls to `/api/internal/run-step` (one step per function invocation), and `vercel.json` schedules the recovery sweep and the daily check once a day. Set these Environment Variables in the Vercel project (Production):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | your production URL, e.g. `https://opspilot-sandy.vercel.app` (not a preview URL — those are behind Deployment Protection) |
| `NEXT_PUBLIC_FIREBASE_*` (6 values) | from the Firebase web app config |
| `GEMINI_API_KEY` | one server-only key |
| `CRON_SECRET` | 32+ random characters (Vercel Cron sends it automatically) |
| `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | from a service-account key (Firebase console → Project settings → Service accounts). Vercel has no Google credentials of its own |
| `RESEND_API_KEY`, `EMAIL_FROM` | as above |

Do **not** set `NEXT_PUBLIC_USE_EMULATORS` or `TASKS_QUEUE` on Vercel. Add the Vercel domain under Firebase Authentication → Authorized domains. Redeploy after changing variables.

## Database security rules (required, any host)

The browser reads data directly from Firestore, so the rules in this repo must be live on the project. Until they are, the app shows "Your data can't be loaded … security rules haven't been deployed".

```bash
npx firebase login
npx firebase use opspilot-28504
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Sending email (Resend)

1. Resend dashboard → Domains → Add domain (a domain you own, e.g. `mail.yourdomain.com`). Resend shows the exact DNS records (SPF/MX, DKIM, optional DMARC) to add at your DNS provider; wait until it shows **Verified**.
2. Set `EMAIL_FROM` to a plain address on that domain, e.g. `reminders@mail.yourdomain.com` (the sender name is added by the app). Gmail and other free-mail addresses are refused.
3. Redeploy. The approval screen shows "Emails can't be sent yet" with the exact reason until this is correct; nothing can be approved for sending before then.

## Security headers

`proxy.ts` sends an enforced Content-Security-Policy on every page with a per-request nonce (`'strict-dynamic'`, no `unsafe-eval` in production). Documented exceptions are in `src/lib/csp.ts`. API routes return JSON; the document viewer route sets its own sandboxed CSP.

See `docs/IMPLEMENTATION_PLAN.md` for the phased plan.
