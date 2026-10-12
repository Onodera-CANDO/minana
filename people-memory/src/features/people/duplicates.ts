import type { Person } from '../../types';
import { normalizeCompany, normalizeEmail, normalizeName } from './normalize';

export type DuplicateReason = 'email' | 'name_company' | 'name_only';

export type DuplicateCandidate = { person: Person; reason: DuplicateReason };

export const DUPLICATE_REASON_LABEL: Record<DuplicateReason, string> = {
  email: 'メールアドレスが一致',
  name_company: '氏名＋会社名が一致',
  name_only: '氏名が一致（同名別人の可能性あり）',
};

/** 手動登録時の重複候補（自動マージはしない。表示のみ） */
export function findDuplicateCandidates(
  draft: Pick<Person, 'fullName' | 'companyName' | 'email'> & { id?: string },
  people: Person[],
): DuplicateCandidate[] {
  const email = normalizeEmail(draft.email);
  const name = normalizeName(draft.fullName);
  const company = normalizeCompany(draft.companyName);
  const out: DuplicateCandidate[] = [];
  for (const p of people) {
    if (p.id === draft.id) continue;
    if (email && normalizeEmail(p.email) === email) {
      out.push({ person: p, reason: 'email' });
    } else if (name && normalizeName(p.fullName) === name) {
      out.push({ person: p, reason: company && normalizeCompany(p.companyName) === company ? 'name_company' : 'name_only' });
    }
  }
  const order: DuplicateReason[] = ['email', 'name_company', 'name_only'];
  return out.sort((a, b) => order.indexOf(a.reason) - order.indexOf(b.reason));
}
