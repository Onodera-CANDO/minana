import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFaces, usePeople, useStore } from '../app/store';
import { ConfirmDialog, Field, Page, PageHeader, errorMessage, formatDate } from '../components/ui';
import { changePassphrase } from '../security/lockSession';
import { validatePassphrase } from '../security/crypto';
import { DEFAULT_SETTINGS, loadStats, saveSettings, type DeviceStats } from '../storage/settings';
import { getDb } from '../storage/database';
import { canPromptInstall, installInstructions, isStandalone, promptInstall, requestPersistentStorage, storageEstimate } from '../pwa/installHelp';
import { buildDemoData } from '../features/people/demoData';
import { cameraAvailability } from '../features/face-recognition/camera';

function fmtBytes(n?: number) {
  if (n === undefined) return '—';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1048576).toFixed(1)}MB`;
}

// SCR-12 設定
export function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const lock = useStore((s) => s.lock);
  const wipeAll = useStore((s) => s.wipeAll);
  const savePeople = useStore((s) => s.savePeople);
  const saveMeeting = useStore((s) => s.saveMeeting);
  const importBatches = useStore((s) => s.importBatches);
  const people = usePeople();
  const faces = useFaces();
  const [stats, setStats] = useState<DeviceStats>({});
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageEstimate>>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [cur, setCur] = useState('');
  const [n1, setN1] = useState('');
  const [n2, setN2] = useState('');
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState('');
  const [th, setTh] = useState({ sim: String(settings.faceMinSimilarity), margin: String(settings.faceMinMargin), frames: String(settings.faceStableFrames), samples: String(settings.faceSamplesPerPerson) });

  useEffect(() => {
    void loadStats().then(setStats);
    void storageEstimate().then(setStorage);
  }, []);

  const batches = useMemo(() => Object.values(importBatches).sort((a, b) => b.importedAt.localeCompare(a.importedAt)), [importBatches]);
  const ok = (text: string) => setMsg({ kind: 'ok', text });
  const fail = (e: unknown) => setMsg({ kind: 'err', text: errorMessage(e) });

  const saveThresholds = async (calibrated?: boolean) => {
    const sim = Number(th.sim);
    const margin = Number(th.margin);
    const frames = Math.round(Number(th.frames));
    const samples = Math.round(Number(th.samples));
    if (!(sim > 0 && sim < 1) || !(margin >= 0 && margin < 1) || !(frames >= 1 && frames <= 10) || !(samples >= 1 && samples <= 5))
      return setMsg({ kind: 'err', text: '閾値の値を確認してください（類似度 0〜1、差 0〜1、フレーム数 1〜10、サンプル数 1〜5）' });
    await updateSettings({ faceMinSimilarity: sim, faceMinMargin: margin, faceStableFrames: frames, faceSamplesPerPerson: samples, ...(calibrated !== undefined ? { faceCalibrated: calibrated } : {}) });
    ok('顔照合の設定を保存しました');
  };

  return (
    <>
      <PageHeader title="設定" />
      <Page>
        {msg && <p className={msg.kind === 'ok' ? 'notice-info' : 'notice-error'}>{msg.text}</p>}

        <section className="card space-y-3 text-sm">
          <h2 className="text-base font-bold">ロック</h2>
          <button className="btn-secondary w-full" onClick={lock}>
            🔒 今すぐロック
          </button>
          <Field label="自動ロック（操作がない時間）">
            <select className="input" value={settings.autoLockMinutes} onChange={(e) => void updateSettings({ autoLockMinutes: Number(e.target.value) })}>
              {[1, 3, 5, 10, 30].map((m) => (
                <option key={m} value={m}>
                  {m}分
                </option>
              ))}
            </select>
          </Field>
          <details>
            <summary className="cursor-pointer font-semibold">パスフレーズを変更</summary>
            <form
              className="mt-2 space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const v = validatePassphrase(n1);
                if (v) return setMsg({ kind: 'err', text: v });
                if (n1 !== n2) return setMsg({ kind: 'err', text: '新しいパスフレーズが一致しません' });
                try {
                  await changePassphrase(cur, n1);
                  setCur('');
                  setN1('');
                  setN2('');
                  ok('パスフレーズを変更しました（既存のバックアップは作成時のパスフレーズのままです）');
                } catch (e2) {
                  fail(e2);
                }
              }}
            >
              <input className="input" type="password" placeholder="現在のパスフレーズ" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
              <input className="input" type="password" placeholder="新しいパスフレーズ" autoComplete="new-password" value={n1} onChange={(e) => setN1(e.target.value)} />
              <input className="input" type="password" placeholder="新しいパスフレーズ（確認）" autoComplete="new-password" value={n2} onChange={(e) => setN2(e.target.value)} />
              <button className="btn-secondary w-full">変更</button>
            </form>
          </details>
        </section>

        <section className="card space-y-2 text-sm">
          <h2 className="text-base font-bold">データ</h2>
          <Link to="/settings/backup" className="btn-primary w-full">
            バックアップ／復元
          </Link>
          <Link to="/import" className="btn-secondary w-full">
            CSVを取り込む
          </Link>
          <h3 className="pt-2 font-semibold">CSV取込履歴</h3>
          {batches.length === 0 ? (
            <p className="muted">まだありません</p>
          ) : (
            <ul className="space-y-1">
              {batches.map((b) => (
                <li key={b.id}>
                  <Link to={`/import/${b.id}`} className="flex justify-between gap-2 rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <span className="truncate">{b.fileName}</span>
                    <span className="muted shrink-0 text-xs">
                      {formatDate(b.importedAt)}・新規{b.createdCount}/更新{b.updatedCount + (b.mergedCount ?? 0)}
                      {b.reviewCount ? `/保留${b.reviewCount}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {people.length === 0 && (
            <button
              className="btn-ghost w-full"
              onClick={async () => {
                try {
                  const d = buildDemoData();
                  await savePeople(d.people);
                  for (const m of d.meetings) await saveMeeting(m);
                  ok('ダミーのデモデータを追加しました');
                } catch (e) {
                  fail(e);
                }
              }}
            >
              デモ用ダミーデータを追加
            </button>
          )}
        </section>

        <section className="card space-y-3 text-sm">
          <h2 className="text-base font-bold">顔照合</h2>
          <p className="muted text-xs">
            閾値は使用モデル・端末・登録人数・撮影環境で変わります。同意済みの協力者で「カメラ → 校正モード」を使い、本人と他人のスコア分布を確認してから設定してください。スコアは本人確率ではありません。
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="最低類似度">
              <input className="input" inputMode="decimal" value={th.sim} onChange={(e) => setTh({ ...th, sim: e.target.value })} />
            </Field>
            <Field label="1位と2位の差">
              <input className="input" inputMode="decimal" value={th.margin} onChange={(e) => setTh({ ...th, margin: e.target.value })} />
            </Field>
            <Field label="安定フレーム数">
              <input className="input" inputMode="numeric" value={th.frames} onChange={(e) => setTh({ ...th, frames: e.target.value })} />
            </Field>
            <Field label="登録サンプル数">
              <input className="input" inputMode="numeric" value={th.samples} onChange={(e) => setTh({ ...th, samples: e.target.value })} />
            </Field>
          </div>
          <button className="btn-secondary w-full" onClick={() => void saveThresholds()}>
            閾値を保存
          </button>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={settings.faceCalibrated}
              onChange={(e) => void saveThresholds(e.target.checked)}
            />
            <span>
              閾値を校正済み（候補の自動表示を有効にする）
              <span className="muted block text-xs">未校正の間は候補を表示せず、手動検索を案内します。</span>
            </span>
          </label>
          <button
            className="btn-ghost w-full text-xs"
            onClick={() => {
              setTh({ sim: String(DEFAULT_SETTINGS.faceMinSimilarity), margin: String(DEFAULT_SETTINGS.faceMinMargin), frames: String(DEFAULT_SETTINGS.faceStableFrames), samples: String(DEFAULT_SETTINGS.faceSamplesPerPerson) });
            }}
          >
            初期値に戻す（保存は別途）
          </button>
          <p className="muted text-xs">顔登録済み：{new Set(faces.map((f) => f.personId)).size}人 / {faces.length}サンプル</p>
        </section>

        <section className="card space-y-2 text-sm">
          <h2 className="text-base font-bold">保存領域とインストール</h2>
          <p>
            使用量 {fmtBytes(storage.usage)} / 上限目安 {fmtBytes(storage.quota)}・永続化 {storage.persisted ? '許可済み' : '未許可'}
          </p>
          {!storage.persisted && (
            <button
              className="btn-secondary w-full"
              onClick={async () => {
                const r = await requestPersistentStorage();
                setStorage(await storageEstimate());
                ok(r ? '永続保存が許可されました' : 'ブラウザが永続保存を許可しませんでした（ホーム画面に追加すると許可されやすくなります）');
              }}
            >
              永続保存をリクエスト
            </button>
          )}
          <p className="muted text-xs">ブラウザはデータを削除する可能性があります。定期的にバックアップしてください。</p>
          <p>{installInstructions()}</p>
          {!isStandalone() && canPromptInstall() && (
            <button className="btn-secondary w-full" onClick={() => void promptInstall()}>
              アプリをインストール
            </button>
          )}
        </section>

        <section className="card space-y-1 text-xs">
          <h2 className="text-base font-bold">端末情報・検証ログ（端末内のみ）</h2>
          <p className="break-all">UA: {navigator.userAgent}</p>
          <p>起動形態: {isStandalone() ? 'ホーム画面（standalone）' : 'ブラウザ'}・セキュアコンテキスト: {window.isSecureContext ? 'はい' : 'いいえ'}・カメラ: {cameraAvailability() ?? '利用可'}</p>
          <p>推論バックエンド: {stats.backend ?? '未計測'}・モデル読込: {stats.modelLoadMs ? `${stats.modelLoadMs}ms` : '未計測'}・平均推論: {stats.avgInferenceMs ? `${stats.avgInferenceMs}ms（${stats.inferenceSamples}回）` : '未計測'}</p>
          <p>
            照合結果: 候補{stats.outcomes?.candidate ?? 0}・判別不可{(stats.outcomes?.ambiguous ?? 0) + (stats.outcomes?.unknown ?? 0)}・顔なし{stats.outcomes?.no_face ?? 0}・複数{stats.outcomes?.multiple_faces ?? 0}
          </p>
          <p>
            候補が正しい{stats.confirmedCorrect ?? 0}・違う{stats.rejectedCandidates ?? 0}・手動検索へ切替{stats.manualSearchSwitches ?? 0}・処理停止{stats.memoryErrors ?? 0}
          </p>
          {stats.lastCsv && <p>直近CSV: {stats.lastCsv.rows}行・{stats.lastCsv.ms}ms・保留{stats.lastCsv.review}・失敗{stats.lastCsv.failed}</p>}
          <button
            className="btn-ghost min-h-8 px-2 text-xs"
            onClick={async () => {
              await getDb().settings.delete('stats');
              setStats({});
            }}
          >
            検証ログをリセット
          </button>
        </section>

        <section className="card space-y-2 text-sm">
          <h2 className="text-base font-bold text-rose-600">全データ削除</h2>
          <p className="muted text-xs">人物・面会・顔特徴量・取込履歴・パスフレーズ設定をこの端末からすべて削除します。</p>
          <button className="btn-danger w-full" onClick={() => setWipeOpen(true)}>
            全データを削除
          </button>
        </section>
      </Page>
      <ConfirmDialog
        open={wipeOpen}
        title="全データを削除"
        danger
        confirmLabel="削除する"
        confirmDisabled={wipeText !== '削除'}
        onCancel={() => setWipeOpen(false)}
        onConfirm={async () => {
          try {
            await wipeAll();
            await saveSettings(DEFAULT_SETTINGS);
          } catch (e) {
            fail(e);
          }
        }}
      >
        <p>この操作は取り消せません。復元にはバックアップファイルとそのパスフレーズが必要です。</p>
        <label className="block">
          <span className="label">確認のため「削除」と入力</span>
          <input className="input" value={wipeText} onChange={(e) => setWipeText(e.target.value)} />
        </label>
      </ConfirmDialog>
    </>
  );
}
