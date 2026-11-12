export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_50%_-10%,#1a3c21_0%,#0e2a14_55%,#081a0c_100%)] px-4 py-8 text-mosque-cream sm:px-8">
      <div className="mx-auto max-w-2xl">
      <a href="/" className="mb-8 inline-flex items-center gap-3 font-extrabold"><img src="/logo.png" alt="" className="h-11 w-11 sm:h-12 sm:w-12" />Masjid Al-Rahma</a>
      <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-xl shadow-black/20 sm:p-8">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-mosque-gold">Your information</p>
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">Privacy policy</h1>
      <p className="mb-4 text-sm leading-7 text-mosque-cream/75">
        Placeholder page. Replace with the real policy text, translated into
        English, Swedish and Arabic.
      </p>
      <p className="text-sm leading-7 text-mosque-cream/75">
        At minimum it should cover: what data is collected at registration
        (name, email, phone, communication preference), why (processing
        donations and, only if opted in, contacting the donor), how long it
        is kept, and how a donor can request access, correction or erasure
        (see the "Erase (GDPR)" action in the admin Donors tab).
      </p>
      </section>
      <a href="/" className="mt-6 inline-block text-sm font-semibold text-mosque-mint underline underline-offset-4">Back to homepage</a>
      </div>
    </main>
  );
}
