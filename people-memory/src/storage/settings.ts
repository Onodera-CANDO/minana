import { getDb } from './database';

// 個人情報を含まない設定値のみを平文で保存する。

export type AppSettings = {
  autoLockMinutes: number;
  /** 顔照合 */
  faceMinSimilarity: number;
  faceMinMargin: number;
  faceStableFrames: number;
  /** 閾値を校正済みか。false の間は候補の自動提示を行わない（仕様 6.3） */
  faceCalibrated: boolean;
  faceSamplesPerPerson: number;
  csvMaxBytes: number;
  lastBackupAt?: string;
  backupReminderDays: number;
  firstDataAt?: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  autoLockMinutes: 5,
  faceMinSimilarity: 0.7,
  faceMinMargin: 0.08,
  faceStableFrames: 3,
  faceCalibrated: false,
  faceSamplesPerPerson: 3,
  csvMaxBytes: 10 * 1024 * 1024,
  backupReminderDays: 14,
};

export async function loadSettings(): Promise<AppSettings> {
  const row = await getDb().settings.get('app');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<AppSettings>) ?? {}) };
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await getDb().settings.put({ key: 'app', value: s });
}

/** 非個人の検証ログ（仕様 13章）。個人名・特徴量は入れない */
export type DeviceStats = {
  backend?: string;
  modelLoadMs?: number;
  avgInferenceMs?: number;
  inferenceSamples?: number;
  outcomes?: Partial<Record<'candidate' | 'ambiguous' | 'unknown' | 'no_face' | 'multiple_faces', number>>;
  confirmedCorrect?: number;
  rejectedCandidates?: number;
  manualSearchSwitches?: number;
  lastCsv?: { rows: number; ms: number; review: number; failed: number };
  memoryErrors?: number;
};

export async function loadStats(): Promise<DeviceStats> {
  const row = await getDb().settings.get('stats');
  return (row?.value as DeviceStats) ?? {};
}

export async function updateStats(fn: (s: DeviceStats) => DeviceStats): Promise<void> {
  const cur = await loadStats();
  await getDb().settings.put({ key: 'stats', value: fn(cur) });
}
