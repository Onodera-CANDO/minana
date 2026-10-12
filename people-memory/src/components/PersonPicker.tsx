import { useMemo, useState } from 'react';
import type { Person } from '../types';
import { searchPeople } from '../features/people/search';

/** 既存人物を検索して選ぶ（複数/単数） */
export function PersonPicker({
  people,
  selected,
  onChange,
  multiple = true,
  exclude = [],
  placeholder = '名前・会社で検索して追加',
}: {
  people: Person[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  exclude?: string[];
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const results = useMemo(
    () =>
      q.trim()
        ? searchPeople(people, { keyword: q }, () => false)
            .filter((p) => !selected.includes(p.id) && !exclude.includes(p.id))
            .slice(0, 8)
        : [],
    [q, people, selected, exclude],
  );
  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((id) => (
            <span key={id} className="chip gap-1 py-1">
              {byId.get(id)?.fullName ?? '（削除済み）'}
              <button type="button" aria-label="外す" className="px-1" onClick={() => onChange(selected.filter((s) => s !== id))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {(multiple || selected.length === 0) && (
        <input className="input" type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      {results.length > 0 && (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => {
                  onChange(multiple ? [...selected, p.id] : [p.id]);
                  setQ('');
                }}
              >
                <span className="font-semibold">{p.fullName}</span> <span className="muted">{p.companyName ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
