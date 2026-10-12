import type { PersonRelation, RelationType } from '../../types';

export const RELATION_LABEL: Record<RelationType, string> = {
  introduced_by: '紹介者',
  mutual_acquaintance: '共通の知人',
  same_event: '同じ交流会',
  same_organization: '同じ所属団体',
  other: 'その他',
};

/** 人物から見た関係の表示ラベル（方向を考慮） */
export function relationLabelFor(rel: PersonRelation, viewerId: string): string {
  if (rel.type === 'introduced_by') {
    return rel.fromPersonId === viewerId ? '紹介者' : 'この人が紹介した';
  }
  return RELATION_LABEL[rel.type];
}

export function relationsForPerson(relations: PersonRelation[], personId: string): PersonRelation[] {
  return relations.filter((r) => r.fromPersonId === personId || r.toPersonId === personId);
}

export function counterpartId(rel: PersonRelation, viewerId: string): string | undefined {
  return rel.fromPersonId === viewerId ? rel.toPersonId : rel.fromPersonId;
}
