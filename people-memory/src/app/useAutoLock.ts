import { useEffect } from 'react';
import { useStore } from './store';

/** 一定時間操作がなければロック（仕様 10.2） */
export function useAutoLock() {
  const status = useStore((s) => s.status);
  const minutes = useStore((s) => s.settings.autoLockMinutes);
  const lock = useStore((s) => s.lock);
  useEffect(() => {
    if (status !== 'unlocked' || minutes <= 0) return;
    let timer = 0;
    let hiddenAt = 0;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, minutes * 60_000);
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > minutes * 60_000) lock();
      else reset();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener('visibilitychange', onVis);
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [status, minutes, lock]);
}
