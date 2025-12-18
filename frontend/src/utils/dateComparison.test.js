import { describe, it, expect } from 'vitest';
import { getDateOnly, getMonthOnly, normalizeToDateString } from './dateNormalization';

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

describe('getMonthOnly - Month Extraction', () => {
  it('should extract month from full ISO timestamp', () => {
    expect(getMonthOnly('2025-12-23T00:00:00.000Z')).toBe('2025-12');
  });

  it('should extract month from date-only format', () => {
    expect(getMonthOnly('2025-12-23')).toBe('2025-12');
  });

  it('should handle null input', () => {
    expect(getMonthOnly(null)).toBe(null);
  });

  it('should handle undefined input', () => {
    expect(getMonthOnly(undefined)).toBe(null);
  });

  it('should handle empty string', () => {
    expect(getMonthOnly('')).toBe(null);
  });

  it('should make different formats comparable by month', () => {
    const month1 = getMonthOnly('2025-12-23T00:00:00.000Z');
    const month2 = getMonthOnly('2025-12-15');
    expect(month1).toBe(month2);
  });
});

describe('normalizeToDateString - Prevent Timezone Conversion', () => {
  it('should return YYYY-MM-DD string as-is', () => {
    expect(normalizeToDateString('2026-01-13')).toBe('2026-01-13');
  });

  it('should extract date from ISO timestamp without timezone conversion', () => {
    expect(normalizeToDateString('2026-01-13T00:00:00.000Z')).toBe('2026-01-13');
  });

  it('should handle Date objects using local timezone', () => {
    const date = new Date(2026, 0, 13); // January 13, 2026 in local time
    expect(normalizeToDateString(date)).toBe('2026-01-13');
  });

  it('should handle null input', () => {
    expect(normalizeToDateString(null)).toBe(null);
  });

  it('should handle undefined input', () => {
    expect(normalizeToDateString(undefined)).toBe(null);
  });

  it('should handle empty string', () => {
    expect(normalizeToDateString('')).toBe(null);
  });

  it('should prevent timezone shifts that cause 1-day differences', () => {
    // This is the core issue: template stores "2026-01-13"
    const templateDate = '2026-01-13';
    const normalized = normalizeToDateString(templateDate);
    
    // Should remain the same date, not shift to 01-14 or 01-12
    expect(normalized).toBe('2026-01-13');
  });

  it('should handle various ISO formats consistently', () => {
    const formats = [
      '2026-01-13',
      '2026-01-13T00:00:00.000Z',
      '2026-01-13T08:00:00.000-08:00'
    ];
    
    // All should normalize to the same date
    const results = formats.map(normalizeToDateString);
    expect(results[0]).toBe('2026-01-13');
    expect(results[1]).toBe('2026-01-13');
    expect(results[2]).toBe('2026-01-13');
  });
});
