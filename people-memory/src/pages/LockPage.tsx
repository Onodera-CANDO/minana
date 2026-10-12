import { useState } from 'react';
import { useStore } from '../app/store';
import { ConfirmDialog, errorMessage } from '../components/ui';

export function LockPage() {
  const unlock = useStore((s) => s.unlock);
  const wipeAll = useStore((s) => s.wipeAll);
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState('');

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <div className="text-center">
        <p className="text-4xl" aria-hidden>
          🔒
        </p>
        <h1 className="mt-2 text-xl font-bold">ロック中</h1>
        <p className="muted text-sm">パスフレーズを入力して解除してください</p>
      </div>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            await unlock(p);
          } catch (e2) {
            setErr(errorMessage(e2));
            setBusy(false);
          }
        }}
      >
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          aria-label="パスフレーズ"
          autoFocus
          value={p}
          onChange={(e) => setP(e.target.value)}
        />
        {err && <p className="notice-error">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !p}>
          {busy ? '解除中…' : 'ロック解除'}
        </button>
      </form>
      <button className="btn-ghost text-xs text-rose-600" onClick={() => setWipeOpen(true)}>
        パスフレーズを忘れた（全データを削除して初期化）
      </button>
      <ConfirmDialog
        open={wipeOpen}
        title="全データを削除して初期化"
        danger
        confirmLabel="削除する"
        confirmDisabled={wipeText !== '削除'}
        onCancel={() => setWipeOpen(false)}
        onConfirm={async () => {
          await wipeAll();
          setWipeOpen(false);
        }}
      >
        <p>パスフレーズがないとデータを復号できません。初期化すると、この端末内の人物・面会・顔特徴量はすべて削除されます。</p>
        <p>バックアップがあっても、そのパスフレーズを覚えていなければ復元できません。</p>
        <label className="block">
          <span className="label">確認のため「削除」と入力</span>
          <input className="input" value={wipeText} onChange={(e) => setWipeText(e.target.value)} />
        </label>
      </ConfirmDialog>
    </main>
  );
}
