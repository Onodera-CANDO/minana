import { useMemo } from 'react';
import { create } from 'zustand';
import type { FaceEmbedding, ImportBatch, Meeting, Person, PersonRelation } from '../types';
import { EncryptedRepository } from '../storage/encryptedRepository';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from '../storage/settings';
import { isInitialized, setupPassphrase, unlock as unlockKey, verifyKey, wipeEverything } from '../security/lockSession';
import { detachPersonFromMeetings } from '../features/meetings/meetingStats';
import type { BackupData } from '../features/backup/backup';

// 復号済みデータはロック解除中のみメモリに保持し、ロック時に破棄する。

export type AppStatus = 'loading' | 'setup' | 'locked' | 'unlocked' | 'error';

type ById<T> = Record<string, T>;

function byId<T extends { id: string }>(list: T[]): ById<T> {
  const o: ById<T> = {};
  for (const x of list) o[x.id] = x;
  return o;
}

type State = {
  status: AppStatus;
  error?: string;
  repo: EncryptedRepository | null;
  settings: AppSettings;
  people: ById<Person>;
  faces: ById<FaceEmbedding>;
  meetings: ById<Meeting>;
  relations: ById<PersonRelation>;
  importBatches: ById<ImportBatch>;

  init(): Promise<void>;
  setup(passphrase: string): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  lock(): void;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;

  savePerson(p: Person): Promise<void>;
  savePeople(list: Person[], onProgress?: (done: number) => void): Promise<void>;
  deletePerson(id: string): Promise<void>;

  saveFaces(list: FaceEmbedding[]): Promise<void>;
  deleteFacesOf(personId: string): Promise<void>;

  saveMeeting(m: Meeting): Promise<void>;
  deleteMeeting(id: string): Promise<void>;

  saveRelation(r: PersonRelation): Promise<void>;
  deleteRelation(id: string): Promise<void>;

  saveImportBatch(b: ImportBatch): Promise<void>;
  deleteImportBatch(id: string): Promise<void>;

  replaceAll(data: BackupData): Promise<void>;
  wipeAll(): Promise<void>;
};

const EMPTY = { people: {}, faces: {}, meetings: {}, relations: {}, importBatches: {} };

function requireRepo(s: State): EncryptedRepository {
  if (!s.repo) throw new Error('ロックされています');
  return s.repo;
}

async function markFirstData(get: () => State) {
  if (!get().settings.firstDataAt) await get().updateSettings({ firstDataAt: new Date().toISOString() });
}

export const useStore = create<State>((set, get) => ({
  status: 'loading',
  repo: null,
  settings: DEFAULT_SETTINGS,
  ...EMPTY,

  async init() {
    try {
      const settings = await loadSettings();
      set({ settings, status: (await isInitialized()) ? 'locked' : 'setup' });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'IndexedDB を開けませんでした' });
    }
  },

  async setup(passphrase) {
    const key = await setupPassphrase(passphrase);
    set({ repo: new EncryptedRepository(key), status: 'unlocked', ...EMPTY });
  },

  async unlock(passphrase) {
    const key = await unlockKey(passphrase);
    if (!(await verifyKey(key))) throw new Error('パスフレーズが違います');
    const repo = new EncryptedRepository(key);
    const [people, faces, meetings, relations, importBatches] = await Promise.all([
      repo.loadAll<Person>('person'),
      repo.loadAll<FaceEmbedding>('face'),
      repo.loadAll<Meeting>('meeting'),
      repo.loadAll<PersonRelation>('relation'),
      repo.loadAll<ImportBatch>('importBatch'),
    ]);
    set({
      repo,
      status: 'unlocked',
      people: byId(people),
      faces: byId(faces),
      meetings: byId(meetings),
      relations: byId(relations),
      importBatches: byId(importBatches),
      settings: await loadSettings(),
    });
  },

  lock() {
    set({ repo: null, status: 'locked', ...EMPTY });
  },

  async updateSettings(patch) {
    const next = { ...get().settings, ...patch };
    await saveSettings(next);
    set({ settings: next });
  },

  async savePerson(p) {
    await requireRepo(get()).put('person', p);
    set((s) => ({ people: { ...s.people, [p.id]: p } }));
    await markFirstData(get);
  },

  async savePeople(list, onProgress) {
    const repo = requireRepo(get());
    const CHUNK = 100;
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK);
      await repo.putMany('person', chunk);
      set((s) => {
        const people = { ...s.people };
        for (const p of chunk) people[p.id] = p;
        return { people };
      });
      onProgress?.(Math.min(list.length, i + CHUNK));
      await new Promise((r) => setTimeout(r, 0)); // UI を固めない
    }
    if (list.length) await markFirstData(get);
  },

  async deletePerson(id) {
    const s = get();
    const repo = requireRepo(s);
    const faceIds = Object.values(s.faces).filter((f) => f.personId === id).map((f) => f.id);
    const relIds = Object.values(s.relations)
      .filter((r) => r.fromPersonId === id || r.toPersonId === id)
      .map((r) => r.id);
    const { updated, deletedIds } = detachPersonFromMeetings(Object.values(s.meetings), id);
    await repo.deleteMany('face', faceIds);
    await repo.deleteMany('relation', relIds);
    await repo.deleteMany('meeting', deletedIds);
    await repo.putMany('meeting', updated);
    await repo.delete('person', id);
    set((st) => {
      const people = { ...st.people };
      delete people[id];
      const faces = { ...st.faces };
      faceIds.forEach((f) => delete faces[f]);
      const relations = { ...st.relations };
      relIds.forEach((r) => delete relations[r]);
      const meetings = { ...st.meetings };
      deletedIds.forEach((m) => delete meetings[m]);
      updated.forEach((m) => (meetings[m.id] = m));
      return { people, faces, relations, meetings };
    });
  },

  async saveFaces(list) {
    await requireRepo(get()).putMany('face', list);
    set((s) => {
      const faces = { ...s.faces };
      for (const f of list) faces[f.id] = f;
      return { faces };
    });
  },

  async deleteFacesOf(personId) {
    const ids = Object.values(get().faces).filter((f) => f.personId === personId).map((f) => f.id);
    await requireRepo(get()).deleteMany('face', ids);
    set((s) => {
      const faces = { ...s.faces };
      ids.forEach((i) => delete faces[i]);
      return { faces };
    });
  },

  async saveMeeting(m) {
    await requireRepo(get()).put('meeting', m);
    set((s) => ({ meetings: { ...s.meetings, [m.id]: m } }));
    await markFirstData(get);
  },

  async deleteMeeting(id) {
    await requireRepo(get()).delete('meeting', id);
    set((s) => {
      const meetings = { ...s.meetings };
      delete meetings[id];
      return { meetings };
    });
  },

  async saveRelation(r) {
    await requireRepo(get()).put('relation', r);
    set((s) => ({ relations: { ...s.relations, [r.id]: r } }));
  },

  async deleteRelation(id) {
    await requireRepo(get()).delete('relation', id);
    set((s) => {
      const relations = { ...s.relations };
      delete relations[id];
      return { relations };
    });
  },

  async saveImportBatch(b) {
    await requireRepo(get()).put('importBatch', b);
    set((s) => ({ importBatches: { ...s.importBatches, [b.id]: b } }));
  },

  async deleteImportBatch(id) {
    await requireRepo(get()).delete('importBatch', id);
    set((s) => {
      const importBatches = { ...s.importBatches };
      delete importBatches[id];
      return { importBatches };
    });
  },

  async replaceAll(data) {
    await requireRepo(get()).replaceAll([
      { kind: 'person', values: data.people },
      { kind: 'face', values: data.faces },
      { kind: 'meeting', values: data.meetings },
      { kind: 'relation', values: data.relations },
      { kind: 'importBatch', values: data.importBatches },
    ]);
    set({
      people: byId(data.people),
      faces: byId(data.faces),
      meetings: byId(data.meetings),
      relations: byId(data.relations),
      importBatches: byId(data.importBatches),
    });
  },

  async wipeAll() {
    await wipeEverything();
    set({ repo: null, status: 'setup', settings: DEFAULT_SETTINGS, ...EMPTY });
  },
}));

/** 配列で取り出すフック（参照が変わったときだけ再計算） */
export function usePeople(): Person[] {
  const m = useStore((s) => s.people);
  return useMemo(() => Object.values(m), [m]);
}
export function useMeetings(): Meeting[] {
  const m = useStore((s) => s.meetings);
  return useMemo(() => Object.values(m), [m]);
}
export function useFaces(): FaceEmbedding[] {
  const m = useStore((s) => s.faces);
  return useMemo(() => Object.values(m), [m]);
}
export function useRelations(): PersonRelation[] {
  const m = useStore((s) => s.relations);
  return useMemo(() => Object.values(m), [m]);
}
export function useFaceRegisteredSet(): Set<string> {
  const faces = useFaces();
  return useMemo(() => new Set(faces.map((f) => f.personId)), [faces]);
}
