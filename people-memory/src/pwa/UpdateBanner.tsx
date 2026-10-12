import { useEffect, useState } from 'react';

// Service Worker の登録と更新通知。virtual:pwa-register は本番ビルドでのみ有効。
let updateFn: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<(s: { needRefresh: boolean; offlineReady: boolean }) => void>();
let state = { needRefresh: false, offlineReady: false };

function emit(patch: Partial<typeof state>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const { registerSW } = await import('virtual:pwa-register');
  updateFn = registerSW({
    onNeedRefresh: () => emit({ needRefresh: true }),
    onOfflineReady: () => emit({ offlineReady: true }),
  });
}

export function UpdateBanner() {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  if (s.needRefresh) {
    return (
      <div className="notice-info mx-4 mt-2 flex items-center justify-between gap-2">
        <span>新しいバージョンがあります。</span>
        <button className="btn-primary min-h-9 shrink-0 whitespace-nowrap px-3" onClick={() => updateFn?.(true)}>
          更新
        </button>
      </div>
    );
  }
  if (s.offlineReady) {
    return (
      <div className="notice-info mx-4 mt-2 flex items-center justify-between gap-2">
        <span>オフラインで使う準備ができました（顔モデル含む）。</span>
        <button className="btn-ghost min-h-9 shrink-0 whitespace-nowrap px-3" onClick={() => emit({ offlineReady: false })}>
          閉じる
        </button>
      </div>
    );
  }
  return null;
}
