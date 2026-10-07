import { describe, expect, it } from 'vitest';

describe('variable recurring current-cycle occurrence', () => {
  it('keeps the template variable while giving the current occurrence a concrete amount', () => {
    const pattern = {
      id: 'walmart-card',
      name: 'Walmart Card',
      variableAmount: true,
      amount: null,
      nextOccurrence: '2026-10-10'
    };

    const currentOccurrence = {
      id: `bill_${pattern.id}_${pattern.nextOccurrence}`,
      recurringPatternId: pattern.id,
      dueDate: pattern.nextOccurrence,
      amount: 200,
      variableAmount: true
    };

    expect(pattern.amount).toBeNull();
    expect(pattern.variableAmount).toBe(true);
    expect(currentOccurrence.amount).toBe(200);
    expect(currentOccurrence.id).toBe('bill_walmart-card_2026-10-10');
  });
});
