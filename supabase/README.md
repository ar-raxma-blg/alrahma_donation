# Supabase migrations

Current project: `pqtetpitwmmzsmiflyjb`. `setup.sql` was applied there on 4 November 2026; do not run it again. This project started empty. Two confirmed Auth users now have Owner rows in `public.admins`; there are no donor records yet. Local `.env.local` points to it. The historical migration notes below describe the previous project.

For a new, empty project, run `setup.sql` in the Supabase SQL Editor. It contains the ordered migrations, with their transaction boundaries. Run it once. Existing projects apply only unapplied migration files in filename order; see `DEPLOYMENT_HANDOFF.md`.

For a project that already has the original schema, RLS policies and admins table, run only `migrations/202610100002_registration.sql` inside a transaction. Do not rerun the initial migration.

The application also needs `SUPABASE_SECRET_KEY` in the ignored `.env.local`. The public key cannot apply SQL or call the registration function. Never put the secret in a NEXT_PUBLIC variable.

Registration now calls `register_donation(payload)` from the server. The function stores donor details, consent evidence and the pending pledge together. It generates a unique AR reference. Monthly amounts are total pledges and must divide evenly over 2, 6 or 12 months. Payment verification remains manual.

Each submission has a separate donor record. Email is no longer unique: an unauthenticated caller must not overwrite an existing donor's details or preferences. CSV donor imports now insert records rather than update records by email.

Public name display is opt-in. Anonymous registrations store Anonymous in the pledge display name. Contact details and references stay private. Public clients read the public_donations view; the donations table is removed from Realtime publication because whole-row events include private columns.

Validation before deployment:
- Submit one-time Swish and bank-transfer pledges and a divisible monthly pledge.
- Confirm each reference is unique, pending pledges do not increase totals, and each submission has three consent log entries.
- Reject fractional amounts and SMS/WhatsApp preferences without a phone.
- With the publishable key, confirm donors and consent logs cannot be read and the registration RPC cannot be called.
- Confirm a donation manually; verify only display fields appear in public_donations.
- Edit, reject and delete confirmed donations; verify campaign_totals stays correct.

The initial schema, registration function and display-name update were applied to the hosted project on 2026-10-11 through the Supabase SQL Editor. Verified: 8 tables have RLS, only service_role can execute registration, and public clients cannot read donation references or donor IDs. The organisation's privacy policy, retention period and contact information still need to be supplied before collecting real donor data.

Display-name update: existing installations must also run migrations/202610100003_display_name.sql. Fresh setup.sql includes it. Anonymous remains the default; entered names and custom names require explicit public-display consent.


## WhatsApp notification preparation

Applied migration `202610110001_notifications.sql`: notification_templates, notification_queue and notification_logs are server-only with RLS. Nine draft templates cover pledge acknowledgement, verified payment confirmation and one reminder in English, Swedish and Arabic.

New eligible pledges and verified payments create queue entries transactionally. WhatsApp opt-in, a phone number, no opt-out and no donor deletion are required. Opt-out cancels queued entries. Repeated confirmation does not duplicate the queue. Existing pledges are not backfilled automatically.

Admin > WhatsApp-aviseringar shows previews and delivery status. Reminder preparation is available to admins and the protected cron endpoint. One-time pledges wait seven days; monthly reminders wait seven days after a configured installment due date. Migrations 004–006 add verified installment recording, explicit first due dates, one reminder per unpaid installment, and pause/opt-out controls. See the handoff for deployment and template approval.

Sending is disabled by default through environment flags. The sender rechecks consent and payment status, claims queued rows, and stores provider message IDs. The signed webhook records delivery separately from provider acceptance. See DEPLOYMENT_HANDOFF.md for the remaining hosting, database, Meta template approval and scheduling steps.

Tests: `supabase/tests/notifications.sql` runs fixture assertions in a rolled-back transaction, without sending messages or retaining test donor data.

## Utskick: SMS, email and WhatsApp

### Delivery webhook setup (developer only)

Apply `202610130002_whatsapp_delivery.sql`. Set `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` on the server. Configure Meta with the public HTTPS URL `/api/whatsapp/webhook` and subscribe to `messages`. Localhost is not accessible to Meta. App publishing and Meta's account requirements must be completed for production callbacks.

The endpoint verifies Meta's HMAC signature, filters by the configured sender number ID, and stores only delivery status and provider message IDs. Duplicate events are ignored. The admin sees Swedish delivery labels; credentials and callback configuration are not exposed in the dashboard. A test sender keeps Meta's test identity; use a dedicated, verified mosque number for the Masjid Al Rahma production identity. The automatic queue sender is implemented and remains disabled by default pending approved templates and provider setup. Run `npm test` for isolated database and mocked-provider checks.

Test: `node tests/whatsapp-webhook.cjs` (no messages sent).

Utskick now uses a separate BroadcastPanel, provider adapters in lib/broadcast.ts and shared contact eligibility in lib/communication.ts. Missing provider credentials block sending; there are no simulated successes. Provider acceptance is recorded separately from delivery, which requires future delivery callbacks.

Configure Twilio for SMS and Resend with a verified sender for email using the variables in .env.example. WhatsApp stays disabled unless WHATSAPP_ENABLED=true and its credentials and Graph API version are configured after Meta access is restored.

For WhatsApp broadcasts, import an approved, static Meta template into notification_templates with its exact body, language, provider_name and provider_language; set approval_status=approved only after Meta approval. Variable-based donation templates are handled by the existing pledge queue, not Utskick. The selected template language must match the donor's language. SMS and email use the message composer.

Only opted-in, non-deleted donors are eligible. Phone numbers must include an international country code (for example +46); formatting is normalized. Duplicate contact addresses receive one message per batch. Select at most 50 donors. Use donation updates, not fundraising campaigns: the current form does not collect fundraising consent.

A log is created before sending. Interrupted sends can leave status=sending; inspect provider logs before retrying. No automatic retries are implemented. Test command: node tests/broadcast.cjs (mocked providers; no real messages).
