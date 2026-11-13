'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminPanelInput, adminPanelPrimaryButton } from '@/components/admin/PanelHeader';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabaseBrowser.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setError(error.message); return; }
      const response = await fetch('/api/admin/donors');
      if (!response.ok) { setError('Kontot saknar adminåtkomst eller sessionen kunde inte verifieras.'); return; }
      router.replace('/admin');
      router.refresh();
    } catch { setError('Kunde inte ansluta. Försök igen.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_50%_-10%,#1a3c21_0%,#0e2a14_55%,#081a0c_100%)] px-4 py-10">
      <form onSubmit={login} className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-white p-6 text-mosque-ink shadow-2xl sm:p-8">
        <div className="-mx-6 -mt-6 mb-6 bg-mosque-deep px-6 py-7 text-white sm:-mx-8 sm:-mt-8 sm:px-8">
          <Link href="/" className="mb-5 inline-flex items-center gap-3"><img src="/logo.png" alt="" className="h-11 w-11" /><span className="text-sm font-extrabold">Masjid Al-Rahma</span></Link>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-mosque-mint">Administration</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Logga in som admin</h1>
          <p className="mt-2 text-sm leading-6 text-white/75">Hantera insamlingen och följ upp givarnas stöd.</p>
        </div>
        <label htmlFor="admin-email" className="text-sm font-semibold">E-post</label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          aria-label="E-post"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-post"
          className={`mb-4 ${adminPanelInput}`}
        />
        <label htmlFor="admin-password" className="text-sm font-semibold">Lösenord</label>
        <input
          id="admin-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          aria-label="Lösenord"
          required
          placeholder="Lösenord"
          className={`mb-5 ${adminPanelInput}`}
        />
        {error && <div role="alert" className="mb-3 text-sm font-semibold text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className={`w-full ${adminPanelPrimaryButton}`}
        >
          {loading ? 'Loggar in…' : 'Logga in'}
        </button>
        <Link href="/" className="mt-5 block text-center text-sm font-semibold text-mosque-emerald underline underline-offset-4">Tillbaka till hemsidan</Link>
      </form>
    </div>
  );
}
