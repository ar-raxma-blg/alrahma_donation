# 10 – Swish Commerce API: live Swish donations

> Paste everything below the line into your AI developer, together with the rules at the top of `README.md`.

---

## Task
Add **live Swish donations** to our Node.js / Next.js web app (Supabase, deployed on Vercel at https://donera.alrahmaborlange.se) using the **Swish Commerce API**:
- payment requests (M-commerce: app switch on mobile, QR code on desktop)
- callbacks
- refunds (behind a flag)

A donation must always be linked to a **campaign** (and optionally a **pledge instalment**), show up on the dashboard and public tracker **once**, and never count before Swish confirms it as `PAID`.

Do it in the phases below. Stop after each phase and show the checklist results, plus `npm run build` and `npm test` output.

## Facts from Swish (don't change these)
- **Authentication:** mutual TLS with our client certificate (PEM cert + private key) and the Swish root CA. TLS 1.2 or higher. No API keys.
- **Base URLs:**
  - test (Merchant Swish Simulator): `https://mss.cpc.getswish.net/swish-cpcapi/api`
  - production: `https://cpc.getswish.net/swish-cpcapi/api`
- **Create a payment request:** `PUT /v2/paymentrequests/{instructionUUID}`. The UUID is 32 uppercase hex characters, chosen by us. Expect `201`, plus the headers `Location` and (for M-commerce) `PaymentRequestToken`.
- **Get status:** `GET /v1/paymentrequests/{id}`. Statuses: `CREATED`, `PAID`, `DECLINED`, `ERROR`, `CANCELLED`. An unanswered request expires after about 3 minutes.
- **Refund:** `PUT /v2/refunds/{instructionUUID}` with `originalPaymentReference`, `callbackUrl`, `payerAlias` (our Swish number), `amount`, `currency`, `message`.
- **Body fields:**
  - `payeePaymentReference`: max 35 characters, alphanumeric
  - `payeeAlias`: our Swish number
  - `amount`: a string with max 2 decimals, e.g. `"250.00"`
  - `currency`: `"SEK"`
  - `message`: max 50 characters, Swish's allowed character set
  - `callbackUrl`: HTTPS
  - `callbackIdentifier`: a random value from us, returned in the callback
  - `payerAlias`: **only** for E-commerce (Swish pushes the request to that phone)
- **Callbacks:** Swish POSTs to our `callbackUrl` over **HTTPS on port 443**, validating our certificate against public CAs (Vercel is fine). Swish recommends **IP filtering** and relying on **callbacks rather than polling**.
- **MSS:** use Swish's test certificates (`Swish_Merchant_TestCertificate_1234679304`, passphrase `swish`) and test payee `1234679304`. Error scenarios are simulated by putting an error code in `message` (see the Swish MSS docs).
- **QR for desktop:** `POST https://mpc.getswish.net/qrg-swish/api/v1/commerce` with `{ token, format: "svg", size: 300 }` (no mTLS).
- **App switch on mobile:** `swish://paymentrequest?token=<token>&callbackurl=<url-encoded status page>`

---

## Donation flow (decided: scan → web page → Swish)
There is **one public QR code** per campaign. It's a **link** to our donate page, e.g. `https://donera.alrahmaborlange.se/ge/bygg26`, and contains no Swish number. It appears on the event screen, the campaign page and on posters (downloadable PNG).

1. The donor scans the QR with the phone camera → our donate page opens with the campaign already chosen.
2. They tap an amount: **100 · 200 · 500 · 1 000 kr · Annat**. Optional: first name, plus the checkbox "Visa mitt förnamn på skärmen" (unticked by default).
3. They tap **Swisha** → the Swish app opens with the amount and campaign filled in (an M-commerce payment request) → they approve with BankID.
4. The Swish callback confirms the payment (Phase 3) → **within seconds** the event screen shows "+100 kr – Ahmed" (or "Anonym givare") and the total goes up.

Works for any amount, any number of people at the same time, and on desktop (a per-donor QR from the Commerce API is shown instead of the app switch).

Not in scope: static Swish QR codes or a public Swish number. Swish can't report those payments live.

## Phase 1 – Config, certificates and client
1. Environment variables (also add them to `.env.example` with no values):
```bash
INTEGRATION_SWISH_COMMERCE=false      # master switch
SWISH_ENV=test                        # test | production
SWISH_PAYEE_ALIAS=1234679304          # production: our Swish Handel number
SWISH_CERT_PEM_BASE64=                # client cert (PEM, base64-encoded)
SWISH_KEY_PEM_BASE64=                 # private key (PEM, base64-encoded)
SWISH_KEY_PASSPHRASE=                 # if the key is encrypted
SWISH_CA_PEM_BASE64=                  # Swish TLS root CA: needed for MSS only. Production Swish servers use a public DigiCert CA, so leave empty
SWISH_CALLBACK_PATH_TOKEN=            # random 32+ chars, part of the callback URL path
CALLBACK_BASE_URL=                    # empty in prod (uses site URL); tunnel URL in local dev
```
Validate them with zod **lazily**, only when Swish is enabled. A missing or invalid variable throws a clear error that never prints any value.

2. Create `lib/swish/client.ts` (`import 'server-only'`, Node runtime only):
   - Use `undici` `Agent` with `connect: { cert, key, passphrase, ca: [...tls.rootCertificates, swishCa], minVersion: 'TLSv1.2' }` plus timeouts (connect 10 s, response 15 s). `axios` + `https.Agent`, as in Swish's example, is also fine. Pick one and be consistent.
   - Reuse a single agent; don't create one per request.
   - Swish errors come back as an array `[{ errorCode, errorMessage, additionalInformation }]`. Turn them into a typed `SwishError`. **Never** pass provider errors on to donors.
   - **Watch for endpoint deprecation.** On every response, check the `Deprecation`, `Sunset` and `Link` headers. If one is present, log a warning with the endpoint, sunset date and link (once per day per endpoint) and show it on Kopplingar. Swish signals planned shutdowns this way.
   - **Use v2 endpoints wherever Swish offers them** (create payment request, create refund). Only use v1 where no v2 exists (e.g. retrieve), and keep each endpoint path in one constant so it's easy to change later.
   - **Handle overload:** if Swish answers that it can't process the request right now (5xx or an overload error code), mark the transaction `failed` with reason `swish_unavailable` and show "Swish är tillfälligt överbelastat. Försök igen om en stund." Never retry automatically in a tight loop.
3. Create `lib/swish/utils.ts`:
   - `newInstructionId()`: 32 uppercase hex characters (`crypto.randomUUID()` without the dashes, uppercased). This is an RFC 4122 v4 UUID, which Swish accepts. Add a regex test: `^[0-9A-F]{32}$`
   - `toSwishAmount(ore)`: e.g. `"250.00"`
   - `sanitizeMessage(text)`: max 50 characters, allowed characters only, emoji stripped
   - `mapStatus(status)`: `PAID` → `confirmed`, `DECLINED`/`ERROR` → `failed`, `CANCELLED` → `cancelled`, `CREATED` → `pending`
4. **Certificate expiry check:** parse the client certificate's `notAfter` date with `crypto.X509Certificate`. Show it on Inställningar → Kopplingar ("Certifikat giltigt till …"). Warn on Kopplingar and in logs at **90, 30 and 7 days** before expiry. Certificates are valid for **5 years**, so the renewal is easy to forget.
5. **Certificate creation (document in `DEPLOYMENT_HANDOFF.md`):** the private key **must be RSA 4096**, otherwise Swish Certificate Management rejects the CSR:
```bash
openssl genrsa -out swish-prod.key 4096
openssl req -new -key swish-prod.key -out swish-prod.csr -subj "/CN=Masjid Al Rahma Swish/O=Masjid Al Rahma/C=SE"
```
   Upload the CSR in Swish Certificate Management, download the signed PEM, base64-encode it and store it as `SWISH_CERT_PEM_BASE64`. Name the board's **Certificate Point of Contact (CPOC)** in the handoff document.

**Checklist:** with the MSS certificate, `GET /v1/paymentrequests/<random id>` returns **404** (proving mTLS works), not a TLS error. Unit tests pass for the utils functions.

## Phase 2 – Start a donation
`POST /api/swish/donate` with body `{ campaignId, amountKr, pledgeInstallmentId?, device: 'mobile'|'desktop', donorName?, donorPhone?, consentSms?, consentShowName? }`

1. Validate with zod: amount 10–100 000 kr; same-origin check; rate limit of 10 per minute per IP.
   **No unwanted payment requests (Swish rule):** every payment request must be started by a real person paying right now. Therefore:
   - only create a request from a direct button click on our donate page; add bot protection (Turnstile or similar) on this endpoint
   - **never** create Swish payment requests from cron jobs, reminders, admin actions or imports. Pledge reminders send a **link to our donate page**, and the donor starts the payment there
   - allow at most **one open (pending) request per browser session**; cancel or replace the previous one rather than stacking requests
   - don't use E-commerce (`payerAlias`, which pushes a request to a phone number someone typed). If it's ever added, require the donor to type their own number and rate-limit per phone number (e.g. 3 per hour)
2. Reject with `404` if `INTEGRATION_SWISH_COMMERCE` is false. Reject with `409` if the campaign is off (`campaigns.is_active = false`) or has ended.
3. Create our record **first**, in this order:
   - a `transactions` row: `status='pending'`, `source='swish_commerce'`, `campaign_id`, `amount_ore`, optional `pledge_installment_id`
   - generate an `instructionId` and a `callbackIdentifier`; store the instruction ID, plus a **hash** of the callback identifier, on the transaction
4. Call `PUT /v2/paymentrequests/{instructionId}` with:
   - `payeePaymentReference` = our short transaction reference (e.g. `D7K2QX9M`)
   - `callbackUrl` = `${CALLBACK_BASE_URL or site}/api/swish/callback/${SWISH_CALLBACK_PATH_TOKEN}`
   - `message` = `sanitizeMessage("Gåva " + campaign.reference_code)`
   - `callbackIdentifier`
   - no `payerAlias` (M-commerce)
5. If Swish errors: set the transaction to `failed` with the error code and return a generic Swedish message.
6. Respond with:
   - mobile: `{ transactionId, next: { type: 'app', url: 'swish://paymentrequest?token=…&callbackurl=…/donera/status/<transactionId>' } }`
   - desktop: `{ transactionId, next: { type: 'qr', qrDataUrl } }`. Fetch the QR from the QR API. In MSS the token isn't real, so return a placeholder image when `SWISH_ENV=test`.

**Checklist:** both mobile and desktop return the correct `next`; a paused campaign returns 409; a Swish error leaves the transaction `failed`; no code path outside the donate button can create a payment request (show a grep for the PUT call).

## Phase 3 – Callback (the only thing that confirms money)
`POST /api/swish/callback/[pathToken]`, Node runtime.

1. Compare `pathToken` with `SWISH_CALLBACK_PATH_TOKEN` using a timing-safe comparison. If it doesn't match, return 404 and do nothing else.
2. Check the returned `callbackIdentifier` against the stored hash for that payment. On the first MSS callback, log the header and body **names** (not values) to confirm where Swish puts it. If it's missing or doesn't match, return 401 and record a security event.
3. **Never trust the body's status.** Fetch the real status with `GET /v1/paymentrequests/{id}` over mTLS.
4. **Idempotency:**
   - insert into `provider_payments` (source `swish_commerce`, `external_id` = the Swish `id`, `raw` payload, `our_reference` = transaction ID), unique on `(source, external_id)`. A duplicate means it's already handled: return 200.
   - update the transaction with `UPDATE … WHERE status = 'pending'`, so only one writer wins
5. On `PAID`:
   - transaction → `confirmed`, with `paid_at` and `provider_payment_id = paymentReference`
   - **no four-eyes approval**: provider-verified payments are confirmed automatically
   - if it's linked to a pledge instalment, mark that instalment paid
   - queue a thank-you only if the donor consented
6. Totals must update via the existing single totals function, so the dashboard and the tracker show the **same** number (`npm run check:totals` = 0).
7. Return 200 quickly. On an internal error return 500, so Swish retries.
8. **IP filtering:** add a Vercel Firewall rule allowing Swish's published callback IP ranges for this path (get them from the Swish docs). Document the rule in `DEPLOYMENT_HANDOFF.md`.

**Checklist:** an MSS payment becomes `confirmed` within about 10 s; a replayed callback changes nothing; a forged callback (wrong token or identifier) is rejected; a body saying PAID while the GET says CREATED does **not** confirm.

## Phase 4 – Status page and safety net
1. `GET /api/swish/status/[transactionId]` returns `{ status, amountKr, reference, campaignSlug }` only, with no personal data. It's rate-limited.
2. The status page polls every 2–5 s: "Väntar på Swish…" → "Tack! Jazāk Allāhu khayran" / "Betalningen avbröts" / "Betalningen gick inte igenom".
3. **Retrieve with backoff (Swish's recommendation):** wait for the callback first. If none has arrived **10 s** after creation, start calling `GET` on Swish with **exponential backoff plus jitter**: 10 s → 20 s → 40 s → 80 s → 160 s, each ±20 % random. Stop as soon as the status is final.
   - Store `swish_check_attempts` and `swish_next_check_at` on the transaction.
   - The status-page poll of **our own** API (every 2–5 s) may trigger a Swish GET **only** when `now ≥ swish_next_check_at`. It never calls Swish more often than the backoff allows.
4. **Cron** `/api/cron/swish-reconcile` (Bearer `CRON_SECRET`, every 5 min):
   - processes only pending Swish transactions whose `swish_next_check_at` has passed (the same backoff, so the cron and the status page never both hammer Swish)
   - spaces its calls at least 1 s apart and stops after 50 per run
   - marks a transaction `cancelled` with reason `expired` after 15 minutes if Swish no longer reports `CREATED`
   - **a late `PAID` always wins**, even after `cancelled`

**Checklist:** with the callback blocked, a payment still becomes `confirmed` via the lazy check or the cron; abandoned payments become `cancelled`.

## Phase 5 – Refunds (behind `SWISH_REFUNDS_ENABLED=false`)
- Owner-only action on the transaction detail: "Återbetala". Requires a confirmation dialog and a reason.
- Call `PUT /v2/refunds/{newInstructionId}` with `originalPaymentReference` = the stored `paymentReference`.
- Handle the refund callback on the same callback route, told apart by payload type. Then transaction → `refunded`, totals decrease, and the action is written to Logg.
- Full refunds only for now.
- **One at a time (Swish rule):** refunds are real-time, single calls. Allow only one refund in progress at a time, with **at least 1 s** between calls. There is **no bulk refund button**. If more than 100 ever need to be sent, it must be a scheduled night-time job, and the same applies to any future payouts.
- Avoid peak times for anything non-urgent and scheduled (12–13, 17–19, and around the 25th).

## Phase 6 – Admin and go-live
1. **Inställningar → Kopplingar → Swish:** status (*Ej kopplad / Test / Live / Fel*), environment, payee alias (masked, e.g. `123 *** **04`), certificate expiry, last callback received, number of pending transactions older than 10 min, and any deprecation warnings. **No secrets shown.**
2. **Don't expose the Swish Commerce number (123 XXX YYYY) publicly (Swish rule).** It must not appear on the website, in QR codes, on posters, in SMS or on the pledge form. People could otherwise pay it directly in the app without a payment request, and some banks block such payments.
   - Donors always pay through the payment request (app switch or QR from the API).
   - If the mosque wants a number people can type manually ("Swisha till …"), that must be a **separate Swish Företag / 90-number**. Its payments come via the bank (step 09), not this API.
   - Check the footer, the public tracker, the Betalsätt settings and old static QR codes, and remove the 123-number wherever it appears.
3. **Branding:** use the official Swish logo and button assets from Swish's brand guidelines. Don't recolour, stretch or redraw them; follow the clear-space rules. Label the button "Swisha" or "Betala med Swish".
4. Update `DEPLOYMENT_HANDOFF.md` with:
   - the variables
   - how to base64-encode the certificates
   - the IP-filter rule
   - the cron schedule
   - certificate renewal steps
   - a test-to-production checklist
5. **Production switch:**
   - install the production certificate from Swish Certificate Management
   - `SWISH_ENV=production`
   - `SWISH_PAYEE_ALIAS` = our Swish Handel number
   - `INTEGRATION_SWISH_COMMERCE=true`
   - make one real 10 kr donation, then refund it

## Phase 7 – Live screen and live feed
**Goal:** a confirmed Swish appears on the event screen and on the public campaign page within about 2 s, with the total updated.

**Security first:** `transactions` holds personal data and must **not** be readable by the public. Realtime follows RLS, so the browser must never subscribe to `transactions`. Use a small public table instead:

1. **Migration:**
```sql
create table public_live_gifts (
  id            uuid primary key,                         -- = transactions.id
  campaign_id   uuid not null references campaigns(id),
  amount_ore    bigint not null,
  display_name  text not null,                            -- first name if consented, else 'Anonym givare'
  confirmed_at  timestamptz not null
);
alter table public_live_gifts enable row level security;
create policy "public read" on public_live_gifts for select to anon, authenticated using (true);
alter publication supabase_realtime add table public_live_gifts;
```
2. **A database trigger** on `transactions`: when `status` changes to `confirmed`, insert one row into `public_live_gifts` (`on conflict do nothing`). When it changes to `refunded`, delete the row. `display_name` = the first name only, and only if `consent_show_name`; otherwise `'Anonym givare'`. **No phone numbers, surnames or emails, ever.**
   This also covers confirmed cash or manual gifts, so the screen shows **all** income, not just Swish.
3. **Totals:** keep using the existing totals function (`campaign_stats`). On each realtime INSERT/DELETE event, refetch the totals once (debounce 500 ms) so the number on screen always equals the official total. If Realtime is unavailable, fall back to polling every 5 s.
4. **Event screen** `/live/<campaign-slug>` (public, full screen, no admin login):
   - large total, plus progress bar against the goal
   - the donate QR (link to `/ge/<slug>`) with "Skanna för att ge"
   - the latest 10 gifts: "+100 kr · Ahmed · just nu", newest on top
   - a short animation per new gift ("+100 kr" floating up, total counting up); respect `prefers-reduced-motion`
   - auto-reconnect; a small "● Live" / "○ Återansluter…" indicator
   - no personal data beyond what `public_live_gifts` contains
5. The same feed on the public campaign page ("Senaste gåvor").

```ts
// client: subscribe to the public table only
supabase.channel(`live:${campaignId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'public_live_gifts', filter: `campaign_id=eq.${campaignId}` },
      (p) => { if (p.eventType === 'INSERT') showGift(p.new); refreshTotalsDebounced() })
  .subscribe()
```

**Checklist:**
- [ ] An MSS test payment of 100 kr shows "+100 kr" on `/live/bygg26` within 2 s, and the total increases by exactly 100
- [ ] A replayed callback doesn't show the gift twice
- [ ] A refund removes the gift and lowers the total
- [ ] An anonymous client can't read `transactions` via the API or Realtime (show the test)
- [ ] No consent → "Anonym givare"; consent → first name only
- [ ] The screen recovers by itself after the network drops for 30 s

## Tests (required)
- **Unit:** utils (ID format, amount format, message sanitising, status mapping).
- **Integration** (mock the Swish HTTP layer, no real calls):
  - create a payment
  - Swish error → `failed`
  - callback `PAID` → `confirmed` once
  - duplicate callback is ignored
  - forged token or identifier is rejected
  - body/GET mismatch does not confirm
  - paused campaign → 409
  - pledge instalment marked paid
  - late `PAID` after `cancelled` → `confirmed`
  - backoff schedule: retrieve attempts at about 10/20/40/80 s with jitter; never more often, even with fast status-page polling
  - a response with `Sunset`/`Deprecation` headers logs a warning
  - a second donate click in the same session doesn't create two pending requests
  - refunds: a second refund within 1 s is queued or rejected
  - confirming a transaction creates exactly one `public_live_gifts` row with no personal data; refunding removes it
- **Manual on MSS**, using a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) set as `CALLBACK_BASE_URL`:
  - a normal payment
  - a declined one (error code in `message`)
  - a timeout
  - a blocked callback, resolved by the cron

## Never
- Never commit certificates or keys. Add `*.pem`, `*.key`, `*.p12` and `certs/` to `.gitignore`.
- Never log the full callback body in production logs; it's stored in `provider_payments.raw` only.
- Never count a Swish payment before `PAID` is confirmed by the GET.
- Never use the Edge runtime for Swish routes (mTLS needs Node).
- Never create a Swish payment request without a person actively clicking pay (no automated or bulk requests).
- Never display the 123-number (the Commerce alias) to the public.