import type { DetectionOutput, FaceRecognitionAdapter } from './FaceRecognitionAdapter';

// @vladmandic/human による実装。ライブラリは動的 import でカメラ利用時のみ読み込む。
// - モデルは自サイトの /models/ から読み込む（外部CDN不使用）
// - 属性推定（年齢・性別・感情等）は使わない。faceres モデルは内部的に年齢・性別も出力するが、
//   本アプリは embedding 以外を読み取らず、保存・表示もしない。
// - モデルの IndexedDB キャッシュは無効（Service Worker のキャッシュを使う）

type HumanModule = typeof import('@vladmandic/human');
type HumanInstance = InstanceType<HumanModule['Human']>;

export const HUMAN_MODEL_NAME = 'human-faceres';

export class HumanFaceAdapter implements FaceRecognitionAdapter {
  readonly modelName = HUMAN_MODEL_NAME;
  modelVersion = 'unknown';
  private human: HumanInstance | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly preferredBackends: Array<'webgl' | 'cpu'> = ['webgl', 'cpu']) {}

  initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch((e) => {
        this.initPromise = null;
        throw e;
      });
    }
    return this.initPromise;
  }

  private async doInit() {
    const mod = (await import('@vladmandic/human')) as unknown as HumanModule;
    const modelBasePath = new URL('models/', document.baseURI).href;
    let lastErr: unknown = null;
    for (const backend of this.preferredBackends) {
      try {
        const human = new mod.Human({
          backend,
          modelBasePath,
          cacheModels: false,
          debug: false,
          async: true,
          warmup: 'none',
          cacheSensitivity: 0, // フレーム間キャッシュで古い結果を使わない
          filter: { enabled: false },
          gesture: { enabled: false },
          body: { enabled: false },
          hand: { enabled: false },
          object: { enabled: false },
          segmentation: { enabled: false },
          face: {
            enabled: true,
            detector: { enabled: true, modelPath: 'blazeface.json', rotation: true, maxDetected: 3, minConfidence: 0.5, skipFrames: 0, return: false },
            mesh: { enabled: true, modelPath: 'facemesh.json' },
            attention: { enabled: false },
            iris: { enabled: false },
            description: { enabled: true, modelPath: 'faceres.json', skipFrames: 0, minConfidence: 0.1 },
            emotion: { enabled: false },
            antispoof: { enabled: false },
            liveness: { enabled: false },
            gear: { enabled: false },
          },
        } as never);
        await human.load();
        await human.tf.ready();
        this.human = human;
        this.modelVersion = `${human.version}`;
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error('顔認識モデルを初期化できませんでした');
  }

  backendName(): string {
    return this.human?.tf.getBackend?.() ?? 'none';
  }

  async detect(frame: HTMLVideoElement | HTMLCanvasElement): Promise<DetectionOutput> {
    if (!this.human) throw new Error('not initialized');
    const t0 = performance.now();
    const res = await this.human.detect(frame);
    const w = frame instanceof HTMLVideoElement ? frame.videoWidth : frame.width;
    const h = frame instanceof HTMLVideoElement ? frame.videoHeight : frame.height;
    const faces = res.face.map((f) => ({
      box: { x: f.box[0], y: f.box[1], width: f.box[2], height: f.box[3] },
      score: f.boxScore ?? f.score,
      yaw: f.rotation?.angle.yaw,
      pitch: f.rotation?.angle.pitch,
      roll: f.rotation?.angle.roll,
      embedding: f.embedding && f.embedding.length ? Array.from(f.embedding) : null,
    }));
    return { faces, inputWidth: w, inputHeight: h, elapsedMs: performance.now() - t0 };
  }

  async extractEmbedding(frame: HTMLVideoElement | HTMLCanvasElement): Promise<number[] | null> {
    const out = await this.detect(frame);
    return out.faces.length === 1 ? out.faces[0].embedding : null;
  }

  compare(a: number[], b: number[]): number {
    if (!this.human) throw new Error('not initialized');
    return this.human.match.similarity(a, b);
  }

  /** テンソル数（メモリリーク監視用） */
  numTensors(): number {
    return this.human?.tf.memory().numTensors ?? 0;
  }

  async dispose(): Promise<void> {
    try {
      this.human?.tf.disposeVariables?.();
      this.human?.tf.engine?.().reset?.();
    } catch {
      // ignore
    }
    this.human = null;
    this.initPromise = null;
  }
}

let shared: HumanFaceAdapter | null = null;
export function getFaceAdapter(): HumanFaceAdapter {
  if (!shared) shared = new HumanFaceAdapter();
  return shared;
}
export async function disposeFaceAdapter() {
  if (shared) await shared.dispose();
  shared = null;
}
