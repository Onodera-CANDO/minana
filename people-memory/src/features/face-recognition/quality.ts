import type { DetectionOutput, DetectedFace } from './FaceRecognitionAdapter';

// 顔登録時の品質チェック（仕様 6.2）。閾値は暫定値で、実機検証で調整する。

export const QUALITY_THRESHOLDS = {
  minDetectionScore: 0.8,
  minFaceWidthRatio: 0.18,
  minFacePixels: 100,
  maxYaw: 0.4,
  maxPitch: 0.4,
  minBrightness: 60,
  maxBrightness: 215,
  minSharpness: 30,
};

export type QualityIssue =
  | 'no_face'
  | 'multiple_faces'
  | 'low_score'
  | 'too_small'
  | 'not_frontal'
  | 'too_dark'
  | 'too_bright'
  | 'blurry'
  | 'no_embedding';

export const QUALITY_MESSAGE: Record<QualityIssue, string> = {
  no_face: '顔が見つかりません',
  multiple_faces: '1人だけ映してください',
  low_score: '顔がはっきり写っていません',
  too_small: 'もう少し近づいてください',
  not_frontal: '正面を向いてもらってください',
  too_dark: '暗すぎます。明るい場所で撮影してください',
  too_bright: '明るすぎます（逆光を避けてください）',
  blurry: 'ぶれています。端末を固定してください',
  no_embedding: '特徴量を抽出できませんでした。再撮影してください',
};

export type QualityReport = {
  ok: boolean;
  issues: QualityIssue[];
  brightness?: number;
  sharpness?: number;
  /** 0..1 の目安値（保存用。精度保証ではない） */
  quality: number;
  face?: DetectedFace;
};

/** 顔領域の平均輝度とラプラシアン分散（シャープネス）を計測。キャンバスは処理後に破棄 */
export function measureFaceRegion(source: HTMLVideoElement | HTMLCanvasElement, face: DetectedFace): { brightness: number; sharpness: number } {
  const size = 96;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { brightness: 128, sharpness: 100 };
  const { x, y, width, height } = face.box;
  ctx.drawImage(source, x, y, width, height, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const gray = new Float32Array(size * size);
  let sum = 0;
  for (let i = 0; i < size * size; i++) {
    const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    gray[i] = g;
    sum += g;
  }
  const brightness = sum / gray.length;
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let yy = 1; yy < size - 1; yy++) {
    for (let xx = 1; xx < size - 1; xx++) {
      const i = yy * size + xx;
      const l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - size] - gray[i + size];
      lapSum += l;
      lapSq += l * l;
      n++;
    }
  }
  const mean = lapSum / n;
  const sharpness = lapSq / n - mean * mean;
  // 使い終わったキャンバスを解放
  c.width = 0;
  c.height = 0;
  return { brightness, sharpness };
}

export function assessQuality(
  out: DetectionOutput,
  measure?: (face: DetectedFace) => { brightness: number; sharpness: number },
  t = QUALITY_THRESHOLDS,
): QualityReport {
  if (out.faces.length === 0) return { ok: false, issues: ['no_face'], quality: 0 };
  if (out.faces.length > 1) return { ok: false, issues: ['multiple_faces'], quality: 0 };
  const face = out.faces[0];
  const issues: QualityIssue[] = [];
  if (face.score < t.minDetectionScore) issues.push('low_score');
  const ratio = face.box.width / Math.max(1, out.inputWidth);
  if (ratio < t.minFaceWidthRatio || face.box.width < t.minFacePixels) issues.push('too_small');
  if ((face.yaw !== undefined && Math.abs(face.yaw) > t.maxYaw) || (face.pitch !== undefined && Math.abs(face.pitch) > t.maxPitch))
    issues.push('not_frontal');
  let brightness: number | undefined;
  let sharpness: number | undefined;
  if (measure) {
    const m = measure(face);
    brightness = m.brightness;
    sharpness = m.sharpness;
    if (brightness < t.minBrightness) issues.push('too_dark');
    if (brightness > t.maxBrightness) issues.push('too_bright');
    if (sharpness < t.minSharpness) issues.push('blurry');
  }
  if (!face.embedding) issues.push('no_embedding');
  const frontal = 1 - Math.min(1, (Math.abs(face.yaw ?? 0) + Math.abs(face.pitch ?? 0)) / (t.maxYaw + t.maxPitch));
  const quality = Math.max(0, Math.min(1, face.score * 0.5 + frontal * 0.3 + Math.min(1, ratio / 0.4) * 0.2));
  return { ok: issues.length === 0, issues, brightness, sharpness, quality, face };
}
