import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Person } from '../types';

export function sample(name: string): ArrayBuffer {
  const b = readFileSync(join(__dirname, '../../sample-data', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

export function person(p: Partial<Person> & { fullName: string }): Person {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), tags: [], sourceRefs: [{ source: 'manual' }], createdAt: now, updatedAt: now, ...p };
}
