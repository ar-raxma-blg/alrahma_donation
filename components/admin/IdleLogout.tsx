'use client';

import { useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

const IDLE_LIMIT_MS = 15 * 60 * 1000;
const CHECK_EVERY_MS = 15 * 1000;
const STORAGE_KEY = 'admin:lastActivity';

// Signs the admin out after 15 minutes without interaction. The last-activity
// time is shared through localStorage so activity in any admin tab counts, and
// it is re-checked on a timer and when the tab wakes up (timers are throttled
// or paused while a laptop sleeps or a tab is in the background).
export default function IdleLogout() {
  useEffect(() => {
    let loggingOut = false;

    const read = () => {
      try {
        return Number(localStorage.getItem(STORAGE_KEY)) || Date.now();
      } catch {
        return lastLocal;
      }
    };
    let lastLocal = Date.now();
    const touch = () => {
      lastLocal = Date.now();
      try {
        localStorage.setItem(STORAGE_KEY, String(lastLocal));
      } catch {
        /* storage unavailable: fall back to per-tab tracking */
      }
    };

    const logout = async () => {
      if (loggingOut) return;
      loggingOut = true;
      try {
        await supabaseBrowser.auth.signOut();
      } finally {
        window.location.href = '/admin/login?reason=idle';
      }
    };

    const check = () => {
      if (Date.now() - read() >= IDLE_LIMIT_MS) void logout();
    };

    // If the stored value is already stale on load (e.g. tab restored after a
    // long absence), check() will log out right away instead of resetting it.
    try {
      if (!localStorage.getItem(STORAGE_KEY)) touch();
    } catch {
      touch();
    }
    check();

    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < 1000) return; // throttle mousemove/scroll
      lastWrite = now;
      touch();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(check, CHECK_EVERY_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
