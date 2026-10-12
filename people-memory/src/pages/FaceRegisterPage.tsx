import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useFaces, useStore } from '../app/store';
import { newId } from '../app/id';
import type { FaceEmbedding } from '../types';
import { Page, PageHeader, errorMessage } from '../components/ui';
import { CameraPreview } from '../components/CameraPreview';
import { useCamera } from '../features/face-recognition/useCamera';
import { getFaceAdapter } from '../features/face-recognition/HumanFaceAdapter';
import { QUALITY_MESSAGE, assessQuality, measureFaceRegion, type QualityReport } from '../features/face-recognition/quality';
import { scoreByPerson } from '../features/face-recognition/recognitionPolicy';
import type { FaceBox } from '../features/face-recognition/FaceRecognitionAdapter';

export const CONSENT_VERSION = 'face-consent-v1';

type Sample = { embedding: number[]; quality: number };

// SCR-08 顔登録
export function FaceRegisterPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const person = useStore((s) => s.people[id]);
  const peopleById = useStore((s) => s.people);
  const settings = useStore((s) => s.settings);
  const saveFaces = useStore((s) => s.saveFaces);
  const deleteFacesOf = useStore((s) => s.deleteFacesOf);
  const faces = useFaces();
  const cam = useCamera();

  const [consentExplained, setConsentExplained] = useState(false);
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [modelState, setModelState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelErr, setModelErr] = useState<string | null>(null);
  const [live, setLive] = useState<QualityReport | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | undefined>();
  const [boxes, setBoxes] = useState<FaceBox[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const needed = Math.max(1, settings.faceSamplesPerPerson);
  const existingCount = faces.filter((f) => f.personId === id).length;

  // ライブの品質ガイド
  useEffect(() => {
    if (!cam.isRunning || modelState !== 'ready') return;
    let stopped = false;
    let timer = 0;
    const adapter = getFaceAdapter();
    const tick = async () => {
      if (stopped) return;
      const v = cam.videoRef.current;
      if (v && !busyRef.current && v.readyState >= 2) {
        busyRef.current = true;
        try {
          const out = await adapter.detect(v);
          if (!stopped) {
            setFrame({ w: out.inputWidth, h: out.inputHeight });
            setBoxes(out.faces.map((f) => f.box));
            setLive(assessQuality(out, (f) => measureFaceRegion(v, f)));
          }
        } catch {
          // 一時的な失敗は無視
        } finally {
          busyRef.current = false;
        }
      }
      timer = window.setTimeout(tick, 500);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [cam.isRunning, cam.videoRef, modelState]);

  if (!person) return <PageHeader title="人物が見つかりません" back="/people" />;

  const begin = async (facing: 'user' | 'environment') => {
    await cam.start(facing);
    if (modelState === 'ready') return;
    setModelState('loading');
    setModelErr(null);
    try {
      await getFaceAdapter().initialize();
      setModelState('ready');
    } catch (e) {
      setModelState('error');
      setModelErr(errorMessage(e));
    }
  };

  const capture = async () => {
    const v = cam.videoRef.current;
    if (!v) return;
    setMsg(null);
    setWarn(null);
    // 静止フレームをメモリ上のキャンバスに取り、処理後すぐ破棄する
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    while (busyRef.current) await new Promise((r) => setTimeout(r, 50));
    busyRef.current = true;
    setBusy(true);
    try {
      const adapter = getFaceAdapter();
      const out = await adapter.detect(c);
      const q = assessQuality(out, (f) => measureFaceRegion(c, f));
      if (!q.ok || !q.face?.embedding) {
        setMsg(`撮り直してください：${q.issues.map((i) => QUALITY_MESSAGE[i]).join('／')}`);
        return;
      }
      const emb = q.face.embedding;
      // 先に撮ったサンプルと同一人物か（極端に似ていなければ警告して破棄）
      if (samples.length) {
        const sims = samples.map((s) => adapter.compare(emb, s.embedding));
        if (Math.min(...sims) < 0.5) {
          setMsg('前のサンプルと大きく異なります。同じ人が映っているか確認して撮り直してください。');
          return;
        }
      }
      // 他の登録者と酷似していないか
      const others = faces.filter((f) => f.personId !== id);
      const top = scoreByPerson(emb, others, (a, b) => adapter.compare(a, b))[0];
      if (top && top.score >= settings.faceMinSimilarity) {
        setWarn(`登録済みの「${peopleById[top.personId]?.fullName ?? '別の人物'}」と特徴が似ています。照合時に取り違える可能性があります。`);
      }
      setSamples((s) => [...s, { embedding: emb, quality: q.quality }]);
      setMsg(samples.length + 1 < needed ? '保存しました。少し角度や明るさを変えてもう一枚撮影してください。' : '必要な枚数がそろいました。');
    } catch (e) {
      setMsg(`処理に失敗しました：${errorMessage(e)}`);
    } finally {
      c.width = 0;
      c.height = 0;
      busyRef.current = false;
      setBusy(false);
    }
  };

  const save = async () => {
    if (!consentAt) return;
    const adapter = getFaceAdapter();
    const now = new Date().toISOString();
    const records: FaceEmbedding[] = samples.map((s) => ({
      id: newId(),
      personId: id,
      embedding: s.embedding,
      modelName: adapter.modelName,
      modelVersion: adapter.modelVersion,
      quality: Math.round(s.quality * 1000) / 1000,
      consentAt,
      consentMethod: 'in_person_confirmed',
      consentVersion: CONSENT_VERSION,
      createdAt: now,
    }));
    try {
      await deleteFacesOf(id); // 再登録時は置き換え
      await saveFaces(records);
      cam.stop();
      nav(`/people/${id}`, { replace: true });
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };

  if (!consentAt) {
    return (
      <>
        <PageHeader title="顔登録：同意の確認" back />
        <Page>
          <section className="card space-y-2 text-sm leading-relaxed">
            <h2 className="font-bold">{person.fullName} さんにお伝えすること</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>目的：</strong>次に会ったとき、この端末で「どなたか」を思い出すための照合にだけ使います。</li>
              <li><strong>保存するもの：</strong>顔写真そのものは保存せず、顔の特徴を数値化したデータ（特徴量）だけを、この端末内に暗号化して保存します。</li>
              <li><strong>送信：</strong>サーバーや外部サービスには送信しません。</li>
              <li><strong>削除：</strong>いつでも削除できます（人物詳細の「顔情報だけ削除」）。削除を希望されたら速やかに対応してください。</li>
              <li>年齢・性別・感情などの推定は行いません。</li>
            </ul>
            {existingCount > 0 && <p className="notice">既に{existingCount}件の顔データがあります。保存すると置き換えます。</p>}
          </section>
          <div className="card space-y-3 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={consentExplained} onChange={(e) => setConsentExplained(e.target.checked)} />
              <span>本人に上記の目的・保存内容・削除方法を説明した</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={consentAgreed} onChange={(e) => setConsentAgreed(e.target.checked)} />
              <span>本人がその場で同意し、撮影に協力している</span>
            </label>
          </div>
          <button className="btn-primary w-full" disabled={!consentExplained || !consentAgreed} onClick={() => setConsentAt(new Date().toISOString())}>
            同意を記録して撮影へ
          </button>
          <Link to={`/people/${id}`} className="btn-ghost w-full">
            登録しない
          </Link>
        </Page>
      </>
    );
  }

  const done = samples.length >= needed;
  return (
    <>
      <PageHeader title={`顔登録：${person.fullName}`} back />
      <Page>
        <p className="muted text-sm">1人だけ・明るい場所・正面に近い角度で、端末をしっかり持って撮影してください。</p>
        <CameraPreview videoRef={cam.videoRef} boxes={boxes} frameSize={frame} mirrored={cam.facing === 'user'} active={cam.isRunning}>
          {!cam.isRunning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white">
              {cam.state === 'paused' && <p>アプリが非表示になったためカメラを停止しました。</p>}
              {cam.error && <p className="text-rose-200">{cam.error.message}</p>}
              <button className="btn-primary" onClick={() => void begin('environment')}>
                カメラを起動（背面）
              </button>
              <button className="btn-secondary" onClick={() => void begin('user')}>
                前面カメラで起動
              </button>
            </div>
          )}
          {cam.isRunning && (
            <div className="absolute inset-x-0 top-0 bg-black/50 p-2 text-center text-sm text-white">
              {modelState === 'loading' && '顔認識モデルを読み込み中…（初回は時間がかかります）'}
              {modelState === 'ready' && (live ? (live.ok ? '✓ 撮影できます' : live.issues.map((i) => QUALITY_MESSAGE[i]).join('／')) : '確認中…')}
              {modelState === 'error' && 'モデルを読み込めませんでした'}
            </div>
          )}
        </CameraPreview>
        {modelState === 'error' && (
          <div className="notice-error space-y-2">
            <p>{modelErr}</p>
            <button className="btn-secondary" onClick={() => void begin(cam.facing)}>
              再読み込み
            </button>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span>
            サンプル {samples.length} / {needed}
          </span>
          {samples.length > 0 && (
            <button className="btn-ghost min-h-8 px-2 text-xs" onClick={() => setSamples([])}>
              撮り直す
            </button>
          )}
        </div>
        {msg && <p className="notice-info">{msg}</p>}
        {warn && <p className="notice">{warn}</p>}
        {!done ? (
          <button className="btn-primary w-full py-4" disabled={!cam.isRunning || modelState !== 'ready' || busy} onClick={() => void capture()}>
            {busy ? '処理中…' : '撮影'}
          </button>
        ) : (
          <button className="btn-primary w-full py-4" onClick={() => void save()}>
            特徴量を保存
          </button>
        )}
        {cam.isRunning && (
          <button className="btn-secondary w-full" onClick={() => cam.stop()}>
            カメラを停止
          </button>
        )}
      </Page>
    </>
  );
}
