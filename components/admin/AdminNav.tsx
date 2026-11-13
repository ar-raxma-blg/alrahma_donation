'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
}
export interface NavGroup {
  title?: string;
  items: NavItem[];
}

// Line icons (24px grid, 1.8 stroke), drawn from currentColor.
const ICONS = {
  overview: 'M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z',
  campaigns: 'M5 21V4m0 0h11l-2 4 2 4H5',
  transactions: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4m4 4H7',
  pledges: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 9 2 2 4-4',
  donors: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.7a3.5 3.5 0 0 1 0 6.6',
  messages: 'M4 12v3a1 1 0 0 0 1 1h2l5 4V6L7 10H5a1 1 0 0 0-1 1v1Zm13-3.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13',
  reports: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h6',
  payments: 'M3 7h4m4 0h10M3 17h10m4 0h4M9 4v6m8 4v6',
  users: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4',
  log: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  event: 'M8 5v14l11-7L8 5Z'
};

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function AdminNav({ groups, userName }: { groups: NavGroup[]; userName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const logout = async () => {
    await supabaseBrowser.auth.signOut();
    window.location.href = '/admin/login';
  };

  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-mosque-deep px-4 py-3 text-mosque-cream lg:hidden">
        <span className="font-extrabold">Al-Rahma Admin</span>
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="admin-navigation" className="rounded-xl border border-white/30 px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/10">
          {open ? 'Stäng' : 'Meny'}
        </button>
      </div>

      <aside id="admin-navigation" className={`${open ? 'flex' : 'hidden'} max-h-[calc(100dvh-4.5rem)] w-full flex-shrink-0 flex-col gap-1 overflow-y-auto lg:max-h-none bg-mosque-deep p-4 text-mosque-cream lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:overflow-y-auto`}>
        <div className="mb-3 hidden items-center gap-2.5 border-b border-white/10 px-2 pb-4 lg:flex">
          <img src="/logo.png" alt="" className="h-10 w-10" />
          <div>
            <div className="text-sm font-extrabold">Al-Rahma Mosque</div>
            <div className="text-[11px] text-mosque-mint/60">Admin</div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5" aria-label="Huvudmeny">
          {groups.map((g, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {g.title && <div className="mt-4 px-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-mosque-mint/50">{g.title}</div>}
              {g.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-mosque-gold ${
                    isActive(item.href) ? 'bg-mosque-gold/90 text-mosque-deep' : 'text-mosque-cream/85 hover:bg-white/10'
                  }`}
                >
                  <Icon name={item.icon} />
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && (
                    <span className="rounded-full bg-amber-400 px-2 text-xs font-bold leading-5 text-amber-950" aria-label={`${item.badge} väntar`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 px-2 pt-4 text-sm">
          <div className="break-words font-semibold">{userName}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={logout} className="rounded-xl border border-white/30 px-3 py-2 text-xs font-semibold transition-colors hover:bg-white/10">
              Logga ut
            </button>
            <Link href="/" target="_blank" rel="noreferrer" className="rounded-xl px-3 py-2 text-xs font-semibold text-mosque-mint transition-colors hover:bg-white/10">
              Visa hemsidan
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
