import { describe, expect, it, vi } from 'vitest';
import { generateId } from '../store/ids';
import { inspectRecords, resetStore, upsert } from '../store/store';

const create = (id?: string) =>
  upsert({ type: 'default', custom: false, content: 'Hello', options: { id } });

describe('toast IDs', () => {
  it('uses crypto.randomUUID() when it is available', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-from-crypto' });
    expect(create()).toBe('uuid-from-crypto');
  });

  it('falls back to a deterministic counter without crypto.randomUUID()', () => {
    vi.stubGlobal('crypto', undefined);
    expect([create(), create(), create()]).toEqual(['ret-1', 'ret-2', 'ret-3']);
  });

  it('skips IDs that are already stored', () => {
    vi.stubGlobal('crypto', undefined);
    expect(create('ret-1')).toBe('ret-1');
    expect(create()).toBe('ret-2');

    const uuids = ['taken', 'taken', 'fresh'];
    vi.stubGlobal('crypto', { randomUUID: () => uuids.shift() });
    expect(create('taken')).toBe('taken');
    expect(create()).toBe('fresh');
    expect(inspectRecords().map(record => record.id)).toEqual(['ret-1', 'ret-2', 'taken', 'fresh']);
  });

  it('asks the store whether a candidate is taken', () => {
    vi.stubGlobal('crypto', undefined);
    const taken = new Set(['ret-1', 'ret-2']);
    expect(generateId(id => taken.has(id))).toBe('ret-3');
  });

  it('restarts the fallback counter on resetStore', () => {
    vi.stubGlobal('crypto', undefined);
    create();
    resetStore();
    expect(create()).toBe('ret-1');
  });
});
