import { describe, expect, it } from 'vitest';
import { filterCurrentRecurringOccurrences } from './BillMatchingService.js';

function fakeDb(patterns) {
  return {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: (id) => ({
            get: async () => ({
              exists: Boolean(patterns[id]),
              data: () => patterns[id]
            })
          })
        })
      })
    })
  };
}

describe('stale recurring occurrence guard', () => {
  it('ignores an old occurrence after the recurring pattern has advanced', async () => {
    const db = fakeDb({
      affirm: { nextOccurrence: '2026-11-07' }
    });

    const result = await filterCurrentRecurringOccurrences(db, 'user-1', [
      {
        id: 'old-affirm',
        name: 'Affirm Dog Water Bowl and Vacuum',
        recurringPatternId: 'affirm',
        dueDate: '2026-10-07',
        isPaid: false
      },
      {
        id: 'current-affirm',
        name: 'Affirm Dog Water Bowl and Vacuum',
        recurringPatternId: 'affirm',
        dueDate: '2026-11-07',
        isPaid: false
      }
    ]);

    expect(result.current.map(b => b.id)).toEqual(['current-affirm']);
    expect(result.stale.map(b => b.id)).toEqual(['old-affirm']);
  });

  it('keeps unlinked one-time bills eligible for matching', async () => {
    const result = await filterCurrentRecurringOccurrences(fakeDb({}), 'user-1', [
      { id: 'one-time', name: 'One Time Bill', dueDate: '2026-10-10', isPaid: false }
    ]);

    expect(result.current.map(b => b.id)).toEqual(['one-time']);
    expect(result.stale).toEqual([]);
  });
});
