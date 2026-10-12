import { useState } from 'react';
import { useStore } from '../app/store';
import { validatePassphrase } from '../security/crypto';
import { errorMessage } from '../components/ui';
import { installInstructions, requestPersistentStorage } from '../pwa/installHelp';

// SCR-01 初回セットアップ
export function SetupPage() {
  const setup = useStore((s) => s.setup);
  const [step, setStep] = useState(0);
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const v = validatePassphrase(p1);
    if (v) return setErr(v);
    if (p1 !== p2) return setErr('確認用パスフレーズが一致しません');
    setBusy(true);
    try {
      await setup(p1);
      await requestPersistentStorage();
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <h1 className="text-2xl font-bold">People Memory へようこそ</h1>
      {step === 0 && (
        <>
          <section className="card space-y-3 text-sm leading-relaxed">
            <h2 className="text-base font-bold">データの保管について</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>人物情報・面会履歴・顔特徴量は<strong>この端末のブラウザ内だけ</strong>に暗号化して保存します。</li>
              <li>サーバーやクラウド、外部AIサービスには送信しません。アクセス解析も入れていません。</li>
              <li>顔照合は、本人の同意を得て顔を登録した人だけが対象です。それ以外の人は「不明」と表示されます。</li>
              <li>照合結果で自動的に人物を確定したり、面会記録を追加したりはしません。</li>
              <li>カメラは「カメラを起動」を押したときだけ使います。録音はしません。</li>
            </ul>
          </section>
          <section className="notice space-y-1">
            <p className="font-semibold">ご注意</p>
            <p>ブラウザのデータ削除や端末の容量不足で、保存データが消える可能性があります。設定画面から定期的に暗号化バックアップを作成してください。</p>
            <p>Sansan 等から出力したCSVを取り込む前に、利用契約・出力権限・社内規程で私的利用が認められているか確認してください。</p>
          </section>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>上記を理解しました</span>
          </label>
          <button className="btn-primary w-full" disabled={!agree} onClick={() => setStep(1)}>
            次へ：パスフレーズ設定
          </button>
        </>
      )}
      {step === 1 && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <section className="card space-y-3 text-sm">
            <h2 className="text-base font-bold">パスフレーズを設定</h2>
            <p>データの暗号化とロック解除に使います（10文字以上、文章のような長めのものがおすすめ）。</p>
            <p className="notice">
              パスフレーズはどこにも保存・送信しません。<strong>忘れるとデータもバックアップも復号できません</strong>（復旧手段はありません）。
            </p>
            <label className="block">
              <span className="label">パスフレーズ</span>
              <input className="input" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">パスフレーズ（確認）</span>
              <input className="input" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
            </label>
            {err && <p className="notice-error">{err}</p>}
          </section>
          <section className="card space-y-1 text-sm">
            <h2 className="font-bold">権限とインストール</h2>
            <p>カメラ権限は顔登録・照合を始めるときに求められます。拒否しても検索・編集は使えます。</p>
            <p>{installInstructions()}</p>
          </section>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(0)}>
              戻る
            </button>
            <button className="btn-primary flex-1" disabled={busy}>
              {busy ? '鍵を生成中…' : 'はじめる'}
            </button>
          </div>
          <p className="muted text-xs">別の端末からの移行は、はじめた後に「設定 → バックアップから復元」で行えます。</p>
        </form>
      )}
    </main>
  );
}
