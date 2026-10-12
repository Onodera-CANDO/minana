// 仕様 8.1 のデータ構造（MVP実装上の追加フィールドはコメントで明記）

export type SourceSystem = 'sansan' | 'manual' | 'generic_csv';

export type SourceRef = {
  source: SourceSystem;
  externalPersonId?: string;
  externalCardId?: string;
  importedAt?: string;
  /** 追加: 取込バッチID */
  importBatchId?: string;
  /** 追加: 名刺交換日（面会日の候補資料。面会回数には加算しない） */
  businessCardDate?: string;
  /** 追加: 取込時に任意保存した未割当列 */
  sourceExtraFields?: Record<string, string>;
};

/** CSV で更新され得る項目（再取込時の更新対象はこれに限定） */
export const CSV_MANAGED_FIELDS = [
  'fullName',
  'nameKana',
  'companyName',
  'department',
  'jobTitle',
  'email',
  'phone',
  'companyAddress',
  'csvNotes',
] as const;
export type CsvManagedField = (typeof CSV_MANAGED_FIELDS)[number];

export type Person = {
  id: string; // UUID, internal key
  fullName: string;
  nameKana?: string;
  companyName?: string;
  department?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  companyAddress?: string;
  firstMetAt?: string;
  firstMetContext?: string;
  /** 追加: 所属団体 */
  organization?: string;
  notes?: string; // hand-edited, not overwritten by imports
  /** 追加: CSVのメモ・備考列（手動メモ notes とは分離） */
  csvNotes?: string;
  tags: string[];
  sourceRefs: SourceRef[];
  /** 追加: 利用者が手動で編集した項目（CSV再取込時の衝突表示に使う） */
  manuallyEditedFields?: CsvManagedField[];
  createdAt: string;
  updatedAt: string;
};

export type FaceEmbedding = {
  id: string;
  personId: string;
  embedding: number[]; // encrypted at rest
  modelName: string;
  modelVersion: string;
  quality?: number;
  consentAt: string;
  consentMethod: 'in_person_confirmed';
  consentVersion: string;
  createdAt: string;
};

export type RelationType = 'introduced_by' | 'mutual_acquaintance' | 'same_event' | 'same_organization' | 'other';

export type PersonRelation = {
  id: string;
  fromPersonId: string;
  toPersonId?: string;
  externalPersonName?: string;
  type: RelationType;
  note?: string;
  /** 追加 */
  createdAt?: string;
};

export type Meeting = {
  id: string;
  personIds: string[];
  occurredAt: string; // ISO8601
  location?: string;
  eventName?: string;
  summary?: string;
  nextTopic?: string;
  followUpDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type ImportRowStatus = 'created' | 'updated' | 'merged' | 'review' | 'skipped' | 'failed';

export type ImportRowResult = {
  rowNumber: number; // CSV上の行番号（ヘッダー=1）
  status: ImportRowStatus;
  message?: string;
  personId?: string;
  /** 保留行は後から解決できるよう、マッピング済みの値を保持 */
  mapped?: MappedRow;
  /** 保留行の重複候補 */
  candidatePersonIds?: string[];
  /** 問題行CSVの出力用に元セルを保持（failed/review/skipped のみ） */
  raw?: string[];
};

export type ImportBatch = {
  id: string;
  fileName: string;
  sourceSystem: string;
  importedAt: string;
  createdCount: number;
  updatedCount: number;
  reviewCount: number;
  skippedCount: number;
  failedCount: number;
  /** 追加 */
  mergedCount?: number;
  encoding?: string;
  headers?: string[];
  rows?: ImportRowResult[];
};

/** CSV 1行を内部項目にマッピングした結果 */
export type MappedRow = {
  externalPersonId?: string;
  externalCardId?: string;
  fullName?: string;
  familyName?: string;
  givenName?: string;
  nameKana?: string;
  companyName?: string;
  department?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  companyAddress?: string;
  businessCardDate?: string;
  notesFromCsv?: string;
  extra?: Record<string, string>;
};
