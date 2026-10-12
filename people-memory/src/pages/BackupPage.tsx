import { useState } from 'react';
import { useFaces, useMeetings, usePeople, useRelations, useStore } from '../app/store';
import { ConfirmDialog, Page, PageHeader, errorMessage, formatDate } from '../components/ui';
import {
  BACKUP_SCHEMA_VERSION,
  backupCounts,
  backupFileName,
  createBackup,
  decryptBackup,
  parseBackupFile,
  type BackupData,
} from '../features/backup/backup';
import { downloadText } from '../features/csv-import/exportCsv';
import { validatePassphrase } from '../security/crypto';
import { HUMAN_MODEL_NAME } from '../features/face-recognition/HumanFaceAdapter';

export function BackupPage() {
  const people = usePeople();
  const faces = useFaces();
  const meetings = useMeetings();
  const relations = useRelations();
  const importBatches = useStore((s) => s.importBatches);
  const updateSettings = useStore((s) => s.updateSettings);
  const replaceAll = useStore((s) => s.replaceAll);
  const lastBackupAt = useStore((s) => s.settings.lastBackupAt);

  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [restoreText, setRestoreText] = useState<string | null>(null);
  const [restoreName, setRestoreName] = useState('');
  const [rp, setRp] = useState('');
  const [preview, setPreview] = useState<BackupData | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const doBackup = async () => {
    setMsg(null);
    const v = validatePassphrase(p1);
    if (v) return setMsg({ kind: 'err', text: v });
    if (p1 !== p2) return setMsg({ kind: 'err', text: '確認用パスフレーズが一致しません' });
    setBusy(true);
    try {
      const now = new Date();
      const modelVersion = faces.find((f) => f.modelName === HUMAN_MODEL_NAME)?.modelVersion;
      const file = await createBackup(
        {
          schemaVersion: BACKUP_SCHEMA_VERSION,
          createdAt: now.toISOString(),
          faceModel: modelVersion ? { name: HUMAN_MODEL_NAME, version: modelVersion } : undefined,
          people,
          faces,
          meetings,
          relations,
          importBatches: Object.values(importBatches),
        },
        p1,
      );
      downloadText(backupFileName(now), JSON.stringify(file), 'application/json');
      await updateSettings({ lastBackupAt: now.toISOString() });
      setP1('');
      setP2('');
      setMsg({ kind: 'ok', text: 'バックアップファイルを書き出しました。端末外の安全な場所（PC等）にも保管してください。' });
    } catch (e) {
      setMsg({ kind: 'err', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const doDecrypt = async () => {
    if (!restoreText) return;
    setMsg(null);
    setBusy(true);
    try {
      const file = parseBackupFile(restoreText);
      setPreview(await decryptBackup(file, rp));
    } catch (e) {
      setMsg({ kind: 'err', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await replaceAll(preview);
      setMsg({ kind: 'ok', text: '復元しました。' });
      setPreview(null);
      setRestoreText(null);
      setRp('');
    } catch (e) {
      setMsg({ kind: 'err', text: `復元に失敗しました：${errorMessage(e)}` });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const counts = preview ? backupCounts(preview) : null;
  const modelMismatch = preview?.faceModel && preview.faces.some((f) => f.modelName !== HUMAN_MODEL_NAME);

  return (
    <>
      <PageHeader title="バックアップと復元" back="/settings" />
      <Page>
        {msg && <p className={msg.kind === 'ok' ? 'notice-info' : 'notice-error'}>{msg.text}</p>}
        <section className="card space-y-3 text-sm">
          <h2 className="text-base font-bold">暗号化バックアップを作成</h2>
          <p>人物・面会・関係・顔特徴量・取込履歴を1つの暗号化ファイルに書き出します（顔写真は含みません。保存していないため）。</p>
          <p className="muted text-xs">前回：{lastBackupAt ? formatDate(lastBackupAt, true) : 'なし'}</p>
          <label className="block">
            <span className="label">バックアップ用パスフレーズ</span>
            <input className="input" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">パスフレーズ（確認）</span>
            <input className="input" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
          </label>
          <p className="notice text-xs">このパスフレーズを忘れるとバックアップは復号できません（復旧手段はありません）。</p>
          <button className="btn-primary w-full" disabled={busy} onClick={() => void doBackup()}>
            バックアップを書き出す
          </button>
        </section>

        <section className="card space-y-3 text-sm">
          <h2 className="text-base font-bold">バックアップから復元</h2>
          <p className="notice text-xs">復元すると、この端末の現在のデータはすべてバックアップの内容に置き換わります。</p>
          <input
            className="input"
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setPreview(null);
              if (!f) return;
              setRestoreName(f.name);
              setRestoreText(await f.text());
            }}
          />
          {restoreText && !preview && (
            <>
              <label className="block">
                <span className="label">バックアップのパスフレーズ</span>
                <input className="input" type="password" autoComplete="off" value={rp} onChange={(e) => setRp(e.target.value)} />
              </label>
              <button className="btn-secondary w-full" disabled={busy || !rp} onClick={() => void doDecrypt()}>
                {busy ? '復号中…' : '内容を確認'}
              </button>
            </>
          )}
          {preview && counts && (
            <div className="space-y-2">
              <p className="font-semibold">{restoreName}（{formatDate(preview.createdAt, true)} 作成）</p>
              <ul className="list-disc pl-5">
                <li>人物 {counts.people}件</li>
                <li>顔特徴量 {counts.faces}件（{counts.facePeople}人）</li>
                <li>面会 {counts.meetings}件・関係 {counts.relations}件・取込履歴 {counts.importBatches}件</li>
              </ul>
              {modelMismatch && <p className="notice text-xs">現在のアプリと異なる顔認識モデルの特徴量が含まれています。照合できない場合は顔を再登録してください。</p>}
              {preview.faceModel && <p className="muted text-xs">顔モデル：{preview.faceModel.name} {preview.faceModel.version}（端末が変わると互換性が変わる可能性があります。照合精度を確認してください）</p>}
              <p className="text-xs">
                現在のデータ：人物 {people.length}件・顔 {faces.length}件・面会 {meetings.length}件 → <strong>上書きされます</strong>
              </p>
              <button className="btn-danger w-full" disabled={busy} onClick={() => setConfirmOpen(true)}>
                このバックアップで上書き復元
              </button>
            </div>
          )}
        </section>
      </Page>
      <ConfirmDialog
        open={confirmOpen}
        title="上書き復元しますか？"
        danger
        confirmLabel="上書きする"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void doRestore()}
      >
        <p>現在の端末内データは削除され、バックアップの内容に置き換わります。この操作は取り消せません。</p>
      </ConfirmDialog>
    </>
  );
}
