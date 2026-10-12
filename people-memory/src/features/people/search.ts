import type { Person } from '../../types';
import { normalizeText } from './normalize';

export type PersonFilter = {
  keyword?: string;
  tag?: string;
  company?: string;
  face?: 'all' | 'registered' | 'unregistered';
};

export function searchPeople(people: Person[], filter: PersonFilter, faceRegistered: (id: string) => boolean): Person[] {
  const kw = normalizeText(filter.keyword);
  const company = normalizeText(filter.company);
  return people.filter((p) => {
    if (filter.tag && !p.tags.includes(filter.tag)) return false;
    if (company && !normalizeText(p.companyName).includes(company)) return false;
    if (filter.face === 'registered' && !faceRegistered(p.id)) return false;
    if (filter.face === 'unregistered' && faceRegistered(p.id)) return false;
    if (kw) {
      const hay = normalizeText(
        [p.fullName, p.nameKana, p.companyName, p.department, p.jobTitle, p.email, p.organization, p.tags.join(' '), p.notes, p.firstMetContext]
          .filter(Boolean)
          .join(' '),
      );
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

export function sortPeopleByKana(people: Person[]): Person[] {
  return [...people].sort((a, b) =>
    (a.nameKana || a.fullName).localeCompare(b.nameKana || b.fullName, 'ja'),
  );
}

export function allTags(people: Person[]): string[] {
  return [...new Set(people.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'ja'));
}

export function parseTags(input: string): string[] {
  return [...new Set(input.split(/[,、\s]+/).map((t) => t.trim()).filter(Boolean))];
}
