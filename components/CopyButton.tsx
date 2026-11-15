'use client';

import { useState } from 'react';

// Copy-to-clipboard button: visible text label (not icon only), 44×44px
// minimum target, announces the result to screen readers, and falls back
// to selecting text via a hidden textarea where the Clipboard API is blocked.
export default function CopyButton({ value, label, doneLabel, name }: { value: string; label: string; doneLabel: string; name?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const ta = document.createElement('textarea');
        ta.value = value; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      // clipboard blocked — the value is visible as text and can be selected by hand
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        // e.g. "Copy Bankgiro" so each button has a unique, clear name
        aria-label={name ? `${label} ${name}` : label}
        className="inline-flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-mosque-muted px-3 text-base font-bold text-mosque-cream transition hover:bg-white/10"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          {done ? <path d="M5 12l5 5 9-10" /> : (<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>)}
        </svg>
        <span aria-hidden="true">{done ? doneLabel : label}</span>
      </button>
      <span role="status" className="sr-only">{done ? doneLabel : ''}</span>
    </>
  );
}
