# Al-Rahma Mosque — Donation Platform

Next.js 15 (App Router) + React 19 + Tailwind CSS + Supabase (database, auth, realtime). Built from the design in `Donation Tracker.dc.html`
and `Admin Dashboard.dc.html` in the parent project — those files are the
visual/interaction reference; this folder is the implementation.

## Stack

- **Next.js 15 / App Router / TypeScript** — public tracker page (`/`) and
  admin dashboard (`/admin`).
- **Tailwind CSS** — all styling, using the `mosque-*` color tokens defined in
  `tailwind.config.ts` (emerald/gold palette matching the design).
- **Supabase** — Postgres database, Row Level Security, a restricted public feed,
  and Auth (admin login). See `supabase/*.sql`.

## Setup

Use a supported Node.js LTS release (Node 22 or newer recommended). Install
from the committed lockfile with `npm ci`. Security overrides keep PostCSS on
the patched 8.5 release line, selector-parser on patched 6.x, and ExcelJS's
UUID dependency on 11.1.1 (the CommonJS-compatible patched release). Recheck
`npm audit` when changing these overrides. Excel workbook round-trip tests
cover the UUID override. Cookies, headers and route/search parameters use
the asynchronous Next.js 15 APIs.

The supplied project URL and publishable key are configured in the ignored
`.env.local` file. The URL was corrected from `.supabase.coo` to `.supabase.co`.
To finish the initial database setup, run `supabase/setup.sql` once in your
Supabase project's SQL Editor (it combines the three scripts below). Then add
your server-only secret key to `SUPABASE_SECRET_KEY` in `.env.local` and create
the admin user described below. The publishable key cannot create tables or
perform the privileged operations used by the registration and admin routes.

1. `npm install`
2. Create a Supabase project. In the SQL editor, run in order:
   `supabase/schema.sql` → `supabase/rls-policies.sql` → `supabase/admins.sql`.
3. Enable email/password auth in Supabase Auth, create your first admin user,
   then insert a row into `admins` with that user's id.
4. Copy `.env.example` to `.env.local` and fill in the Supabase
   values. **`SUPABASE_SECRET_KEY` is a
   server-only secret** — never prefix them with `NEXT_PUBLIC_` or read them
   from a client component.
5. `npm run dev` — tracker at `/`, admin at `/admin` (redirects to
   `/admin/login` until you sign in).
6. Deploy to Vercel (or any Next.js host); add the same env vars there.

## Data model

**Homepage controls:** Owners use `/admin/betalsatt` (Hemsida & betalsätt) to
edit Swish, PayPal/card links, bank details, the public goal and the displayed
raised total. Blank payment fields are hidden. Changes are reviewed before
saving; changing a Swish/PayPal recipient clears its old uploaded QR override.
PayPal never reuses a Swish QR as a placeholder.

Apply `supabase/migrations/202611120001_homepage_settings.sql` to an existing
database; it is also included in `setup.sql`. It preserves existing amounts
and account details. Saving uses a service-role-only transaction that verifies
Owner membership, rejects stale edits and writes the audit entry atomically.
Legacy payment-setting/QR writes are also restricted to Owner.

The public total is `campaign_totals.raised_sek + opening_raised_sek`.
Entering a displayed total adjusts only the manual opening balance. Future
confirmed legacy/public donations add to it; corrections, rejection and deletion
remove their contribution. The manual total does not create transactions in
the rebuilt admin's Reports and must not include a payment that will also be
entered individually. No Swedbank API is connected. The public percentage uses
this same total/goal, has no false fill at zero, and totals refresh every 15s.
Payment account changes appear on the next page load.

Owners can also upload PNG/JPG/WebP Swish and PayPal images (max 2 MB each).
Images are staged with a preview and take effect only through the reviewed
homepage save. Removing an image restores the generated code when a payment
number/link is configured. Apply `202611120002_homepage_qr_images.sql` to
enable this; existing data is unchanged by the migration.

For isolated browser verification, run `npm run test:homepage-ui`. It builds
the app on `http://127.0.0.1:3001` with an in-memory PostgreSQL database and
local Auth/Storage fixture on port 54329. Login uses fictitious credentials
printed by the script; messaging providers are explicitly disabled. Do not
use real donor information in this fixture. Stop the script to discard its
database. The normal `localhost:3000` app remains connected to its own settings.

- `donors` — one row per registered supporter (name, email, phone, language,
  communication preferences, GDPR consent timestamp).
- `donations` — one-off gifts and individual plan installments. Status is
  `pending` (submitted by a donor or awaiting cash/Swish reconciliation) →
  `confirmed` (counts toward the goal, appears on the live tracker) or
  `rejected`.
- `payment_plans` — recurring pledges split over 2 / 6 / 12 months.
- `consent_log` — append-only record of every GDPR consent captured, kept
  independently of the donor record (see GDPR section).
- `campaign_totals` — single-row running total, kept in sync by a Postgres
  trigger on `donations` so the tracker never has to sum the whole table.
- `admins` — allow-list of Supabase Auth user ids permitted to call
  `/api/admin/**`.
- `campaign_settings` — single row holding the Swish number, Bankgiro and
  IBAN shown to donors, editable from the admin "Payment accounts" tab.
- `broadcast_log` — count-only audit trail of every SMS/email broadcast sent
  from the admin "Broadcast" tab (never stores the recipient list itself).

## How the pieces connect

- The public tracker (`app/page.tsx`) reads `campaign_totals` and recent
  confirmed `donations` server-side on load, then `components/LiveFeed.tsx`
  polls the restricted public_donations view every 15 seconds.
- `components/RegisterForm.tsx` posts to `app/api/register/route.ts`, which
  atomically creates a donor, records separate consents, and creates a pending donation or a
  payment plan depending on the chosen frequency.
- The admin dashboard (`app/admin/page.tsx`) is a client component that calls
  `/api/admin/*` routes, all gated by `lib/auth.ts`'s `requireAdmin`, which
  checks for a Supabase Auth session AND membership in the `admins` table.

## Admin dashboard features

- **Full CRUD**: donations and payment plans can be created, edited, and
  deleted/cancelled from their admin tabs, not just created (`PUT`/`DELETE`
  on `/api/admin/donations/[id]` and `/api/admin/plans/[id]`).
- **CSV bulk import**: the Donations log and Donors tabs each have a file
  picker (parses CSV client-side, posts parsed rows to
  `/api/admin/donations/import` or `/api/admin/donors/import`) and a
  "Download empty template" button producing a correctly-headered blank CSV.
- **Broadcast**: pick any subset of donors (checkboxes, select all/none) and
  send them an SMS or email. Recipient counts respect each donor's
  `comm_sms`/`comm_email` preference and `comm_opt_out`. See "Wiring a real
  SMS/email provider" below — without one, sends are logged to
  `broadcast_log` as `simulated: true` and nothing actually goes out.
- **Live/paused toggle**: Settings has a "Live-kampanj" switch
  (`campaign_settings.is_live`). When off, the public tracker replaces the
  live feed + registration form with a pause message (editable in the same
  tab) — no code change needed to take the campaign offline temporarily.
- **Post-donation transparency**: after a successful registration, donors
  see a richer thank-you screen. Settings lets admins attach labeled links
  (receipts, construction photos, invoices — `campaign_settings.transparency_files`)
  that appear on that screen so donors can see what was actually done with
  funds.
- **Payment accounts**: Swish number / Bankgiro / IBAN are editable in
  Settings (`campaign_settings` table) and shown next to a placeholder QR
  pattern generated from the Swish number — it is **not** a real, scannable
  Swish QR code (see "Known stubs" below).

## Wiring a real SMS/email provider

`lib/broadcast.ts` sends SMS through 46elks when `ELKS_API_USERNAME`,
`ELKS_API_PASSWORD` and `ELKS_FROM` are set in the server environment.
Keep the credentials private. `ELKS_FROM=AlRahma` uses a sender name, so
recipients cannot reply by SMS. Email uses Resend (`RESEND_API_KEY` and
`BROADCAST_FROM_EMAIL`). Utskick sends only to donors who selected the
channel and have valid contact details; test with one consenting recipient
before selecting a group.

## GDPR

**Utskick failure details.** New broadcast attempts save count-only provider
failure categories and HTTP statuses in the existing append-only `audit_log`
(`broadcast.result`), linked to the batch ID. Failed SMS attempts also record
a best-effort account balance check made after the attempt. No raw provider
responses, recipient numbers or API credentials are stored in these details.
The Owner-only history shows the reason, next step, time and batch ID.
Older entries have no saved reason; today's balance does not diagnose an
earlier failure. Connection failures and server errors have uncertain outcomes
and must be checked at the provider before retrying. No automatic resend or
database migration is introduced.

- **Lawful basis & consent**: the register form requires an explicit,
  unticked checkbox before submission is allowed (no pre-checked consent).
  The exact text shown is written to `consent_log` at submission time, along
  with IP and user-agent, so the mosque can demonstrate consent was given
  (GDPR Art. 7).
- **Purpose limitation**: communication preference (email / SMS / WhatsApp /
  none) is captured and stored per-donor; respect `comm_opt_out` before any
  outreach.
- **Data minimisation**: the live tracker and its restricted public feed only ever
  read `donations` (display name + amount + message), never the `donors`
  table — personal data (email, phone) is never sent to the browser.
- **Right of access / erasure**: the admin Donors tab has an "Erase (GDPR)"
  action (`DELETE /api/admin/donors/[id]`) that scrubs personal fields
  (name, email, phone) and soft-deletes the donor while leaving historical
  donation totals intact (each `donations` row already snapshots
  `display_name` at the time of the gift, so campaign totals don't change).
  Add a scheduled job to hard-delete soft-deleted rows after your retention
  period.
- **Security**: Row Level Security is enabled on every table; the public
  anon key can only insert new pending registrations and read confirmed
  donations/totals (see `supabase/rls-policies.sql`). All reads/writes of
  personal data go through `/api/admin/**`, gated by Supabase Auth + the
  `admins` allow-list, using the service-role key only on the server.
- **Before going live**: replace the placeholder `/privacy` page with real
  policy text (translated into EN/SV/AR), add a
  cookie banner if you add any analytics, and confirm a data retention
  period with the mosque board.

## Known stubs / next steps

- Payment methods (Swish, card) are recorded but not integrated with a real
  payment provider — wire `app/api/register/route.ts` and the admin "Record
  donation" action to your provider of choice (e.g. Swish Handel API, Stripe)
  when ready; today amounts are entered/confirmed manually or via the pending
  → approve flow. The Swish QR shown in admin Settings is a deterministic
  placeholder pattern, not a real scannable code — generating one requires a
  Swish Handel merchant certificate (`SWISH_MERCHANT_ID`/`SWISH_CERT_PATH` in
  `.env.example`) and Swish's own QR image API.
- Recurring `payment_plans` installments are not yet auto-charged; the admin
  Payment plans tab tracks progress (`installments_paid`) for manual
  reconciliation until a billing provider is connected.
- SMS/email broadcast (`app/api/admin/broadcast/route.ts`) runs in simulated
  mode until Twilio/Resend env vars are set (see "Wiring a real SMS/email
  provider" above) — until then it's fully functional UI + audit log, but no
  message actually leaves the server.
- CSV import now validates each row (name/amount/email presence, amount
  bounds, email format, in-file duplicate emails) and reports exactly which
  rows were skipped and why, next to the import button — safe to hand to
  non-technical staff.
- The public register form (`/api/register`) validates email format and
  donation amount server-side (not just in the browser) before writing to
  the database.

## Admin rebuild — Phase 1

The admin lives at `/admin`. The previous single-page admin has been retired:
`/admin/legacy` redirects to `/admin`, and no navigation links expose the old
interface. Existing donation, donor, notification and report APIs remain in
place for the current features; no stored data is removed.

Admin screens share `PanelHeader`/`PageHead`, form/button styles and a centered
content width. The mobile menu is sticky, exposes its expanded state and
includes a skip-to-content link. The public tracker and supporter form share
`PublicHeader`; login and privacy use the same brand colors and spacing.

**Set up the database.** `supabase/migrations/` is the single source of truth.
Fresh project: run `supabase/setup.sql` once (it contains every migration).
Existing project: apply only the migration files you haven't run, in filename
order. The admin rebuild adds:

1. `202610140001_payment_settings.sql` — bank rows, card link, uploaded QR images, PayPal placeholder.
2. `202610140002_admin_phase1.sql` — enums, tables, totals views, RLS, append-only audit log.
3. `202610140003_admin_phase2.sql` — receipt uniqueness, import batches.
4. `supabase/seed/admin_phase1_example_data.sql` — optional example data (2 campaigns, 5 donors,
   3 pledges, 20 transactions). The file ends with the statements to remove it.

These are new tables. The legacy tables (`donations`, `donors`,
`payment_plans`, `campaign_settings`) are untouched and still power the public
tracker.

**Who can do what.** There are no roles yet: anyone with a row in `admins` is
a full admin. Roles come later.

**Four-eyes rule (built into the data model, used from Phase 2).** A manual or
imported transaction starts as `awaiting_approval` and counts toward no total.
Another admin must approve it. The database enforces this: a confirmed
cash/bank/import row must have `approved_by` set, and `approved_by` can never
equal `registered_by`. Payment-account changes (Betalsätt, Phase 4) will use
the same proposal and approval flow.

**Totals are never typed in.** `campaign_stats` and `installment_balances`
(views) add up confirmed transactions and unpaid pledge instalments.

**Audit log.** Every server action that changes data calls `writeAudit()`
(`lib/admin/audit.ts`). `audit_log` rejects UPDATE, DELETE and TRUNCATE, even
for the service role.

**Built in Phase 1:** navigation with badges, Översikt, Kampanjer, Logg.
**Built in Phase 2** (migration `202610140003`): Transaktioner
(list with filters, register gift, CSV import with column mapping and
duplicate/error preview, approve/reject, refund with reason, detail with
timeline) and Löften (list with derived status, create with editable
instalment schedule, instalments / payments / settings tabs, cancel with
reason, copy a prefilled donate link).
**Reporting:** `/admin/rapporter` filters by inclusive payment-date range,
payment method, campaign and purpose (current campaign fund type). It shows
gross receipts including refunded gifts, refunds and net confirmed receipts,
with monthly, method, purpose and campaign breakdowns. Net uses the same
`transactions.status = 'confirmed'` rule as the admin Overview. This reports
the rebuilt admin tables, not the legacy public tracker's `donations` table.
Unpaid active pledge installments are separate: filtered by due date,
campaign and purpose, using today's outstanding balance; the payment-method
filter does not apply to them.

Manual bank reconciliation compares the entered bank net with the report's
net (bank minus system), with öre precision. It does not change or save any
bank or transaction records. The comparison is included in the optional
Excel download. Exports are generated afresh from the same filters and may
change if payments are updated after the page loads.

`GET /api/admin/reports/excel` requires admin authentication and returns an
actual `.xlsx` with summary, breakdowns and transaction details. It explicitly
excludes donor names, contacts, donor IDs, receipt/provider references,
messages and refund reasons. Data is paginated rather than silently limited
to the first 1,000 rows; query failures stop the report/export. This new
endpoint does not change the legacy CSV export endpoint.

Refunds have no separate date in the existing schema. Reports use current
status against the original receipt date and therefore restate earlier
periods; they are not a dated cash-flow ledger. Bank settlement dates and
fees are not modeled. Review an exported month with the treasurer before
using it for accounting. No new database migration is required.

**Coming:** Givare, Betalsätt with approvals
(Phase 4), Eventläge (Phase 5).

**Known Phase 2 limits.** A payment is linked to one instalment; an overpayment
does not spill into later instalments. "Kontrollera status igen" needs a payment
provider connection and is not available yet. The prefilled donate link
(`/?kampanj=…&belopp=…&lofte=…`) is not read by the public page yet. Pledge
reminders and sending links by SMS/e-post wait for Utskick.

The homepage displays bank details as copyable text only; no bank/GiroCode QR is generated. Swish, PayPal and card QR cards adapt to screen width. Admin headers, navigation, forms and horizontally scrolling table containers support mobile layouts.

Admin scope: Kampanjer, Givare, Eventläge and Användare & roller are hidden from navigation for now; their data and existing permissions are retained. Utskick shows only configured provider channels and preserves history. New pledges and ordinary manual gifts use a private main collection automatically, without campaign setup. From a pledge, choose Registrera betalning for a prefilled instalment; manual payments await approval by another admin before paid/remaining balances and Reports change. New pledges have automatic reminders off. Existing records retain their original campaign associations.

Översikt is the admin starting page: it uses the homepage progress card, total calculation and public refresh endpoint for matching raised/goal/percentage values. Owner shortcuts open the total/goal and payment-detail sections of Hemsida & betalsätt, plus Utskick. It separately shows this month’s confirmed transactions, outstanding active pledges, pending approvals, overdue instalments and recent payments. Owner-only follow-up shows up to three failed/partial broadcasts from the last seven days without message bodies. Read failures display an unavailable notice instead of zero totals.
