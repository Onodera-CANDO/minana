import { describe, expect, it } from 'vitest';
import { StabilityTracker, judgeFrame, scoreByPerson, type PolicyConfig } from '../features/face-recognition/recognitionPolicy';
import { assessQuality } from '../features/face-recognition/quality';
import type { FaceEmbedding } from '../types';

const cfg: PolicyConfig = { minSimilarity: 0.7, minMargin: 0.08, stableFrames: 3, calibrated: true };
const cos = (a: number[], b: number[]) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  return dot / (Math.hypot(...a) * Math.hypot(...b));
};
const face = (personId: string, embedding: number[]): FaceEmbedding => ({
  id: crypto.randomUUID(), personId, embedding, modelName: 'm', modelVersion: '1', consentAt: '', consentMethod: 'in_person_confirmed', consentVersion: 'v1', createdAt: '',
});

describe('照合ポリシー', () => {
  it('人物ごとに最大スコアを取り、降順に並べる', () => {
    const g = [face('a', [1, 0, 0]), face('a', [0.9, 0.1, 0]), face('b', [0, 1, 0])];
    const s = scoreByPerson([1, 0, 0], g, cos);
    expect(s[0]).toEqual({ personId: 'a', score: 1 });
    expect(s[1].personId).toBe('b');
  });

  it('次元が異なる（モデル非互換の）特徴量は無視', () => {
    expect(scoreByPerson([1, 0], [face('a', [1, 0, 0])], cos)).toEqual([]);
  });

  it('閾値未満は unknown、1位と2位が近いと ambiguous', () => {
    expect(judgeFrame([{ personId: 'a', score: 0.6 }], cfg).kind).toBe('unknown');
    expect(judgeFrame([{ personId: 'a', score: 0.8 }, { personId: 'b', score: 0.75 }], cfg).kind).toBe('ambiguous');
    expect(judgeFrame([{ personId: 'a', score: 0.8 }, { personId: 'b', score: 0.6 }], cfg).kind).toBe('match');
    expect(judgeFrame([], cfg).kind).toBe('unknown');
  });

  it('複数フレームで同じ人物が続いたときだけ候補にする', () => {
    const t = new StabilityTracker(cfg);
    const m = (p: string) => ({ kind: 'match' as const, personId: p, score: 0.8, second: 0.5 });
    expect(t.push(m('a')).status).toBe('ambiguous');
    expect(t.push(m('a')).status).toBe('ambiguous');
    expect(t.push(m('a'))).toMatchObject({ status: 'candidate', personId: 'a' });
    expect(t.push(m('b')).status).toBe('ambiguous');
    t.reset();
    t.push(m('a'));
    t.push({ kind: 'unknown', score: 0.2 });
    expect(t.push(m('a')).status).toBe('ambiguous');
  });

  it('未校正なら候補を出さない（disabled）', () => {
    const t = new StabilityTracker({ ...cfg, calibrated: false, stableFrames: 1 });
    expect(t.push({ kind: 'match', personId: 'a', score: 0.9, second: 0 }).status).toBe('disabled');
  });
});

describe('顔登録の品質チェック', () => {
  const ok = { box: { x: 0, y: 0, width: 300, height: 300 }, score: 0.95, yaw: 0, pitch: 0, embedding: [1, 2] };
  const out = (faces: (typeof ok)[]) => ({ faces, inputWidth: 1000, inputHeight: 1000, elapsedMs: 1 });
  it('合格条件', () => {
    expect(assessQuality(out([ok]), () => ({ brightness: 120, sharpness: 100 })).ok).toBe(true);
  });
  it('顔なし・複数・小さい・横向き・暗い・ぶれ', () => {
    expect(assessQuality(out([])).issues).toEqual(['no_face']);
    expect(assessQuality(out([ok, ok])).issues).toEqual(['multiple_faces']);
    expect(assessQuality(out([{ ...ok, box: { ...ok.box, width: 80 } }])).issues).toContain('too_small');
    expect(assessQuality(out([{ ...ok, yaw: 0.8 }])).issues).toContain('not_frontal');
    expect(assessQuality(out([ok]), () => ({ brightness: 20, sharpness: 100 })).issues).toContain('too_dark');
    expect(assessQuality(out([ok]), () => ({ brightness: 120, sharpness: 2 })).issues).toContain('blurry');
  });
});
