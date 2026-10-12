import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFaces, useMeetings, useStore } from '../app/store';
import { Page, PageHeader, errorMessage, formatDate } from '../components/ui';
import { CameraPreview } from '../components/CameraPreview';
import { useCamera } from '../features/face-recognition/useCamera';
import { getFaceAdapter, HUMAN_MODEL_NAME } from '../features/face-recognition/HumanFaceAdapter';
import type { FaceBox, RecognitionResult } from '../features/face-recognition/FaceRecognitionAdapter';
import { StabilityTracker, judgeFrame, scoreByPerson, type PersonScore } from '../features/face-recognition/recognitionPolicy';
import { QUALITY_THRESHOLDS } from '../features/face-recognition/quality';
import { lastMeeting, meetingCount } from '../features/meetings/meetingStats';
import { updateStats } from '../storage/settings';
import { cameraAvailability, CAMERA_ERROR_MESSAGE } from '../features/face-recognition/camera';

const STATUS_TEXT: Record<RecognitionResult['status'], string> = {
  candidate: '候補あり',
  ambiguous: '判別できません',
  unknown: '未登録または判別できません',
  no_face: '顔が見つかりません',
  multiple_faces: '1人だけ映してください',
  low_quality: 'もう少し近づくか、明るい場所で映してください',
  camera_error: 'カメラエラー',
  disabled: '確認中…',
};

const BASE_INTERVAL = 350;

// SCR-09 カメラ照合
export function CameraPage() {
  const nav = useNavigate();
  const faces = useFaces();
  const meetings = useMeetings();
  const peopleById = useStore((s) => s.people);
  const settings = useStore((s) => s.settings);
  const cam = useCamera();
  const [modelState, setModelState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelErr, setModelErr] = useState<string | null>(null);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [candidate, setCandidate] = useState<{ personId: string } | null>(null);
  const [boxes, setBoxes] = useState<FaceBox[]>([]);
  const [frame, setFrame] = useState<{ w: number; h: number } | undefined>();
  const [calib, setCalib] = useState(false);
  const [scores, setScores] = useState<PersonScore[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const suppressRef = useRef<Map<string, number>>(new Map());
  const statsRef = useRef({ n: 0, totalMs: 0, outcomes: {} as Record<string, number> });

  const cfg = useMemo(
    () => ({ minSimilarity: settings.faceMinSimilarity, minMargin: settings.faceMinMargin, stableFrames: settings.faceStableFrames, calibrated: settings.faceCalibrated }),
    [settings],
  );
  const tracker = useMemo(() => new StabilityTracker(cfg), [cfg]);

  // 照合対象：同意済み・同じモデルで登録した特徴量のみ
  const gallery = useMemo(() => faces.filter((f) => f.modelName === HUMAN_MODEL_NAME && f.consentAt && peopleById[f.personId]), [faces, peopleById]);
  const incompatible = faces.length - faces.filter((f) => f.modelName === HUMAN_MODEL_NAME).length;
  const unavailable = cameraAvailability();

  const flushStats = () => {
    const s = statsRef.current;
    if (!s.n) return;
    statsRef.current = { n: 0, totalMs: 0, outcomes: {} };
    void updateStats((st) => {
      const n = (st.inferenceSamples ?? 0) + s.n;
      const avg = ((st.avgInferenceMs ?? 0) * (st.inferenceSamples ?? 0) + s.totalMs) / n;
      const outcomes = { ...(st.outcomes ?? {}) };
      for (const [k, v] of Object.entries(s.outcomes)) outcomes[k as keyof typeof outcomes] = (outcomes[k as keyof typeof outcomes] ?? 0) + v;
      return { ...st, inferenceSamples: n, avgInferenceMs: Math.round(avg), outcomes, backend: getFaceAdapter().backendName() };
    });
  };

  // 照合ループ（候補表示中は停止して利用者の判断を待つ）
  useEffect(() => {
    if (!cam.isRunning || modelState !== 'ready' || candidate || fatal) return;
    let stopped = false;
    let timer = 0;
    let interval = BASE_INTERVAL;
    let failures = 0;
    const adapter = getFaceAdapter();
    tracker.reset();
    const tick = async () => {
      if (stopped) return;
      const v = cam.videoRef.current;
      if (v && v.readyState >= 2) {
        try {
          const out = await adapter.detect(v);
          failures = 0;
          if (stopped) return;
          statsRef.current.n++;
          statsRef.current.totalMs += out.elapsedMs;
          // 発熱・負荷対策：処理が重い端末では間隔を広げる
          interval = Math.min(2000, Math.max(BASE_INTERVAL, out.elapsedMs * 2));
          setFrame({ w: out.inputWidth, h: out.inputHeight });
          setBoxes(out.faces.map((f) => f.box));
          let r: RecognitionResult;
          if (out.faces.length === 0) {
            tracker.reset();
            r = { status: 'no_face' };
          } else if (out.faces.length > 1) {
            tracker.reset();
            r = { status: 'multiple_faces' };
          } else {
            const f = out.faces[0];
            if (!f.embedding || f.score < 0.6 || f.box.width < QUALITY_THRESHOLDS.minFacePixels * 0.8) {
              r = { status: 'low_quality' };
            } else {
              const now = Date.now();
              const sc = scoreByPerson(f.embedding, gallery, (a, b) => adapter.compare(a, b)).filter(
                (s) => (suppressRef.current.get(s.personId) ?? 0) < now,
              );
              setScores(sc.slice(0, 3));
              r = tracker.push(judgeFrame(sc, cfg));
            }
          }
          statsRef.current.outcomes[r.status] = (statsRef.current.outcomes[r.status] ?? 0) + 1;
          setResult(r);
          if (r.status === 'candidate') {
            setCandidate({ personId: r.personId });
            flushStats();
            return;
          }
        } catch (e) {
          failures++;
          if (failures >= 3) {
            setFatal(`照合処理を続けられません（メモリ不足または端末非対応の可能性）：${errorMessage(e)}`);
            void updateStats((s) => ({ ...s, memoryErrors: (s.memoryErrors ?? 0) + 1 }));
            return;
          }
        }
      }
      timer = window.setTimeout(tick, interval);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      flushStats();
    };
  }, [cam.isRunning, cam.videoRef, modelState, candidate, fatal, gallery, cfg, tracker]);

  const begin = async (facing?: 'user' | 'environment') => {
    setFatal(null);
    setCandidate(null);
    await cam.start(facing);
    if (modelState === 'ready') return;
    setModelState('loading');
    setModelErr(null);
    const t0 = performance.now();
    try {
      await getFaceAdapter().initialize();
      const ms = Math.round(performance.now() - t0);
      void updateStats((s) => ({ ...s, modelLoadMs: ms, backend: getFaceAdapter().backendName() }));
      setModelState('ready');
    } catch (e) {
      setModelState('error');
      setModelErr(errorMessage(e));
    }
  };

  const reject = () => {
    if (candidate) suppressRef.current.set(candidate.personId, Date.now() + 10_000);
    void updateStats((s) => ({ ...s, rejectedCandidates: (s.rejectedCandidates ?? 0) + 1 }));
    setCandidate(null);
    setResult(null);
  };

  const toSearch = () => {
    void updateStats((s) => ({ ...s, manualSearchSwitches: (s.manualSearchSwitches ?? 0) + 1 }));
    cam.stop();
    nav('/people');
  };

  const cp = candidate ? peopleById[candidate.personId] : undefined;
  const cpLast = cp ? lastMeeting(meetings, cp.id) : undefined;

  return (
    <>
      <PageHeader title="カメラ照合" />
      <Page>
        {cam.state === 'idle' && (
          <div className="notice-info space-y-1 text-sm">
            <p className="font-semibold">登録済みの人物だけを照合します。撮影データは端末内で処理し、保存・送信しません。</p>
            <p>照合結果は「候補」です。本人かどうかは必ずご自身で確認してください。</p>
          </div>
        )}
        {unavailable && <p className="notice-error">{CAMERA_ERROR_MESSAGE[unavailable]}</p>}
        {gallery.length === 0 && (
          <p className="notice">
            顔を登録した人物がいません。人物詳細から、本人の同意を得て顔を登録してください。
            <Link to="/people" className="ml-1 underline">人物一覧へ</Link>
          </p>
        )}
        {incompatible > 0 && <p className="notice text-xs">別のモデルで登録された顔データが{incompatible}件あります（照合対象外）。該当する人物の顔を再登録してください。</p>}
        {!settings.faceCalibrated && (
          <p className="notice text-xs">
            照合の閾値が未校正のため、候補の自動表示は無効です。同意済みの協力者で「校正モード」を使ってスコアを確認し、設定で閾値を調整・有効化してください。候補が出ない間は手動検索をご利用ください。
          </p>
        )}

        <CameraPreview videoRef={cam.videoRef} boxes={boxes} frameSize={frame} mirrored={cam.facing === 'user'} active={cam.isRunning}>
          {!cam.isRunning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white">
              {cam.state === 'paused' && <p>アプリが非表示になったためカメラを停止しました。再開しますか？</p>}
              {cam.error && <p className="text-rose-200">{cam.error.message}</p>}
              <button className="btn-primary px-6 py-3" disabled={!!unavailable} onClick={() => void begin()}>
                {cam.state === 'paused' ? 'カメラを再開' : 'カメラを起動'}
              </button>
              <p className="text-xs text-slate-300">相手に「登録済みの方だけを照合しています。映像は保存しません」とひと言伝えてください。</p>
            </div>
          )}
          {cam.isRunning && (
            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-black/50 p-2 text-sm text-white">
              <span>
                {modelState === 'loading' && '顔認識モデルを読み込み中…'}
                {modelState === 'error' && 'モデル読込に失敗'}
                {modelState === 'ready' && (fatal ? '停止中' : result ? (result.status === 'disabled' ? '照合済み（候補表示は無効）' : STATUS_TEXT[result.status]) : '確認中…')}
              </span>
              <button className="rounded-lg bg-white/20 px-2 py-1 text-xs" onClick={() => void begin(cam.facing === 'user' ? 'environment' : 'user')}>
                ⟲ 切替
              </button>
            </div>
          )}
          {calib && cam.isRunning && scores.length > 0 && !candidate && (
            <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2 text-xs text-white">
              <p className="font-semibold">校正モード：類似度スコア（本人確率ではありません）</p>
              {scores.map((s) => (
                <p key={s.personId}>
                  {peopleById[s.personId]?.fullName}：{s.score.toFixed(3)}
                </p>
              ))}
              <p className="text-slate-300">閾値 {cfg.minSimilarity} / 差 {cfg.minMargin}・1位と2位の差 {scores[1] ? (scores[0].score - scores[1].score).toFixed(3) : '—'}</p>
            </div>
          )}
        </CameraPreview>

        {modelState === 'error' && (
          <div className="notice-error space-y-2">
            <p>顔認識モデルを読み込めませんでした（{modelErr}）。検索・編集などほかの機能はそのまま使えます。</p>
            <button className="btn-secondary" onClick={() => void begin()}>
              再読み込み
            </button>
          </div>
        )}
        {fatal && (
          <div className="notice-error space-y-2">
            <p>{fatal}</p>
            <button className="btn-secondary" onClick={() => setFatal(null)}>
              もう一度試す
            </button>
          </div>
        )}

        {cp && (
          <section className="card space-y-2 border-teal-500 ring-2 ring-teal-500/40" aria-live="polite">
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">候補（本人確定ではありません）</p>
            <p className="text-xl font-bold">{cp.fullName}</p>
            <p>{[cp.companyName, cp.jobTitle].filter(Boolean).join(' / ')}</p>
            <p className="muted text-sm">
              面会 {meetingCount(meetings, cp.id)}回・前回 {cpLast ? `${formatDate(cpLast.occurredAt)}${cpLast.location ? `（${cpLast.location}）` : ''}` : '—'}
            </p>
            {(cpLast?.nextTopic || cp.notes) && <p className="line-clamp-2 text-sm">{cpLast?.nextTopic ? `次回: ${cpLast.nextTopic}` : cp.notes}</p>}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                className="btn-primary"
                onClick={() => {
                  void updateStats((s) => ({ ...s, confirmedCorrect: (s.confirmedCorrect ?? 0) + 1 }));
                  cam.stop();
                  nav(`/people/${cp.id}`);
                }}
              >
                この人で合っている
              </button>
              <button className="btn-secondary" onClick={reject}>
                違う
              </button>
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={toSearch}>
            🔍 手動検索に切替
          </button>
          {cam.isRunning ? (
            <button className="btn-secondary" onClick={() => cam.stop()}>
              カメラを停止
            </button>
          ) : (
            <Link to="/people/new" className="btn-secondary">
              ＋ 新規登録
            </Link>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={calib} onChange={(e) => setCalib(e.target.checked)} />
          校正モード（同意済みの協力者での検証用。スコアを表示）
        </label>
      </Page>
    </>
  );
}
