import { describe, it, expect } from 'vitest';

// Helper function to extract date-only portion (YYYY-MM-DD) from date strings
const getDateOnly = (dateStr) => {
  if (!dateStr) return null;
  return dateStr.split('T')[0];
};

describe('getDateOnly - Date Format Normalization', () => {
  it('should extract date from full ISO timestamp', () => {
    expect(getDateOnly('2025-12-23T00:00:00.000Z')).toBe('2025-12-23');
  });

  it('should handle date-only format (YYYY-MM-DD)', () => {
    expect(getDateOnly('2025-12-23')).toBe('2025-12-23');
  });

  it('should handle null input', () => {
    expect(getDateOnly(null)).toBe(null);
  });

  it('should handle undefined input', () => {
    expect(getDateOnly(undefined)).toBe(null);
  });

  it('should handle empty string', () => {
    expect(getDateOnly('')).toBe(null);
  });

  it('should extract date from ISO timestamp with timezone', () => {
    expect(getDateOnly('2025-12-23T14:30:00.000-08:00')).toBe('2025-12-23');
  });

  it('should make different timestamp formats comparable', () => {
    const isoDate = getDateOnly('2025-12-23T00:00:00.000Z');
    const simpleDate = getDateOnly('2025-12-23');
    expect(isoDate).toBe(simpleDate);
  });

  it('should correctly identify same dates', () => {
    const billDate = '2025-12-23T00:00:00.000Z';
    const patternDate = '2025-12-23';
    expect(getDateOnly(billDate)).toBe(getDateOnly(patternDate));
  });

  it('should correctly identify different dates', () => {
    const billDate = '2025-12-23T00:00:00.000Z';
    const patternDate = '2025-12-24';
    expect(getDateOnly(billDate)).not.toBe(getDateOnly(patternDate));
  });

  it('should extract month correctly for month-based comparison', () => {
    const date = getDateOnly('2025-12-23T00:00:00.000Z');
    const month = date?.substring(0, 7);
    expect(month).toBe('2025-12');
  });
});
