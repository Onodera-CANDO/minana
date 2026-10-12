import type { FaceEmbedding } from '../../types';
import type { RecognitionResult } from './FaceRecognitionAdapter';

// 照合判定ポリシー（仕様 6.3）
// - 絶対類似度の閾値
// - 1位と2位（別人物）の類似度差
// - 複数フレームでの安定性
// いずれかを満たさなければ「判別できません」。スコアは本人確率ではない。

export type PolicyConfig = {
  minSimilarity: number;
  minMargin: number;
  stableFrames: number;
  calibrated: boolean;
};

export type PersonScore = { personId: string; score: number };

/** 人物ごとの最高類似度（複数サンプルのうち最大） */
export function scoreByPerson(
  probe: number[],
  gallery: FaceEmbedding[],
  compare: (a: number[], b: number[]) => number,
): PersonScore[] {
  const best = new Map<string, number>();
  for (const g of gallery) {
    if (g.embedding.length !== probe.length) continue; // モデル非互換
    const s = compare(probe, g.embedding);
    if (s > (best.get(g.personId) ?? -Infinity)) best.set(g.personId, s);
  }
  return [...best.entries()].map(([personId, score]) => ({ personId, score })).sort((a, b) => b.score - a.score);
}

export type FrameJudgement =
  | { kind: 'match'; personId: string; score: number; second: number }
  | { kind: 'ambiguous'; score: number; second: number }
  | { kind: 'unknown'; score: number };

export function judgeFrame(scores: PersonScore[], cfg: PolicyConfig): FrameJudgement {
  const top = scores[0];
  if (!top) return { kind: 'unknown', score: 0 };
  const second = scores[1]?.score ?? 0;
  if (top.score < cfg.minSimilarity) return { kind: 'unknown', score: top.score };
  if (top.score - second < cfg.minMargin) return { kind: 'ambiguous', score: top.score, second };
  return { kind: 'match', personId: top.personId, score: top.score, second };
}

/** 複数フレームの安定性を判定するステートフルな集約器 */
export class StabilityTracker {
  private history: FrameJudgement[] = [];
  constructor(private cfg: PolicyConfig) {}

  setConfig(cfg: PolicyConfig) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.history = [];
  }

  push(j: FrameJudgement): RecognitionResult {
    this.history.push(j);
    const n = Math.max(1, this.cfg.stableFrames);
    if (this.history.length > n) this.history.shift();
    if (j.kind === 'unknown') return { status: 'unknown' };
    if (j.kind === 'ambiguous') return { status: 'ambiguous' };
    const allSame =
      this.history.length === n && this.history.every((h) => h.kind === 'match' && h.personId === j.personId);
    if (!allSame) return { status: 'ambiguous', detail: '確認中' };
    if (!this.cfg.calibrated) return { status: 'disabled', detail: '閾値が未校正のため候補を表示しません' };
    return { status: 'candidate', personId: j.personId, modelScore: j.score, secondScore: j.second };
  }
}
