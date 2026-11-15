'use client';

import { useEffect, useState } from 'react';
import { Lang } from '@/lib/types';
import { useT } from '@/components/TranslationProvider';

// Mobile-only bar pinned to the bottom. Hidden while the payment section is
// already on screen, and never covers content (the page has bottom padding).
export default function StickyDonate({ lang, targetId = 'donate' }: { lang: Lang; targetId?: string }) {
  const t = useT();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setVisible(!e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-mosque-muted bg-mosque-deep p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <a href={`#${targetId}`} className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-mosque-goldLight px-6 text-lg font-extrabold text-mosque-deep">
        {t(lang, 'donateNow')}
      </a>
    </div>
  );
}
