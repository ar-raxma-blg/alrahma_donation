'use client';

import { supabaseBrowser } from '@/lib/supabase/client';

export default function NotAdmin({ email }: { email: string }) {
  const logout = async () => {
    await supabaseBrowser.auth.signOut();
    window.location.href = '/admin/login';
  };
  return (
    <div className="grid min-h-screen place-items-center bg-mosque-cream p-4 text-mosque-ink">
      <div className="w-full max-w-lg rounded-2xl border border-mosque-ink/10 bg-white p-6">
        <h1 className="text-xl font-extrabold">Du är inte admin än</h1>
        <p className="mt-2 text-sm text-mosque-ink/70">
          Du är inloggad som <b>{email}</b>, men kontot har inte admin-behörighet. Kontakta en befintlig admin och be att få bli tillagd som admin.
        </p>
        <button onClick={logout} className="mt-4 rounded-lg bg-mosque-ink/10 px-4 py-2 text-sm font-bold">Logga ut</button>
      </div>
    </div>
  );
}
