// ホーム画面追加の案内（ブラウザ別）

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIPEvent | null = null;

export function listenInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
  });
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  return outcome === 'accepted';
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function installInstructions(): string {
  if (isStandalone()) return 'ホーム画面から起動中です。';
  if (isIOS()) return 'Safari の共有ボタン（□↑）→「ホーム画面に追加」を選んでください。';
  return 'ブラウザのメニュー（⋮）→「ホーム画面に追加」または「アプリをインストール」を選んでください。';
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageEstimate(): Promise<{ usage?: number; quota?: number; persisted?: boolean }> {
  const out: { usage?: number; quota?: number; persisted?: boolean } = {};
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      out.usage = e.usage;
      out.quota = e.quota;
    }
    if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted();
  } catch {
    // ignore
  }
  return out;
}
