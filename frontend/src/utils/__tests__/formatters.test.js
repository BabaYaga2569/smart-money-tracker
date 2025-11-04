import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatPercentage,
  formatNumber,
  abbreviateNumber,
} from '../formatters';

describe('formatCurrency', () => {
  it('formats positive amounts correctly', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCurrency(0.99)).toBe('$0.99');
    expect(formatCurrency(1000000)).toBe('$1,000,000.00');
  });

  it('formats negative amounts correctly', () => {
    expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
  });

  it('handles zero correctly', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('handles null, undefined, and NaN', () => {
    expect(formatCurrency(null)).toBe('$0.00');
    expect(formatCurrency(undefined)).toBe('$0.00');
    expect(formatCurrency(NaN)).toBe('$0.00');
  });

  it('rounds to two decimal places', () => {
    expect(formatCurrency(1234.567)).toBe('$1,234.57');
    expect(formatCurrency(1234.564)).toBe('$1,234.56');
  });
});

describe('formatDate', () => {
  it('formats dates in short format', () => {
    const date = new Date('2024-03-15');
    const formatted = formatDate(date, 'short');
    expect(formatted).toMatch(/Mar 1[45], 2024/); // Account for timezone differences
  });

  it('formats dates in long format', () => {
    const date = new Date('2024-03-15');
    const formatted = formatDate(date, 'long');
    expect(formatted).toMatch(/March 1[45], 2024/);
  });

  it('formats dates in numeric format', () => {
    const date = new Date('2024-03-15');
    const formatted = formatDate(date, 'numeric');
    expect(formatted).toMatch(/03\/1[45]\/2024/);
  });

  it('handles string dates', () => {
    const formatted = formatDate('2024-03-15', 'short');
    expect(formatted).toMatch(/Mar 1[45], 2024/);
  });

  it('handles invalid dates', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('invalid')).toBe('');
  });
});

describe('formatPercentage', () => {
  it('formats decimal percentages correctly', () => {
    expect(formatPercentage(0.5, true)).toBe('50.0%');
    expect(formatPercentage(0.123, true)).toBe('12.3%');
    expect(formatPercentage(1, true)).toBe('100.0%');
  });

  it('formats non-decimal percentages correctly', () => {
    expect(formatPercentage(50, false)).toBe('50.0%');
    expect(formatPercentage(12.3, false)).toBe('12.3%');
    expect(formatPercentage(100, false)).toBe('100.0%');
  });

  it('handles zero correctly', () => {
    expect(formatPercentage(0, true)).toBe('0.0%');
    expect(formatPercentage(0, false)).toBe('0.0%');
  });

  it('handles null, undefined, and NaN', () => {
    expect(formatPercentage(null)).toBe('0%');
    expect(formatPercentage(undefined)).toBe('0%');
    expect(formatPercentage(NaN)).toBe('0%');
  });
});

describe('formatNumber', () => {
  it('formats numbers with commas', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(1000)).toBe('1,000');
  });

  it('handles zero correctly', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('handles null, undefined, and NaN', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
    expect(formatNumber(NaN)).toBe('0');
  });

  it('handles decimal numbers', () => {
    expect(formatNumber(1234.56)).toBe('1,234.56');
  });
});

describe('abbreviateNumber', () => {
  it('does not abbreviate small numbers', () => {
    expect(abbreviateNumber(999)).toBe('999');
    expect(abbreviateNumber(500)).toBe('500');
    expect(abbreviateNumber(0)).toBe('0');
  });

  it('abbreviates thousands', () => {
    expect(abbreviateNumber(1000)).toBe('1.0K');
    expect(abbreviateNumber(5500)).toBe('5.5K');
    expect(abbreviateNumber(999999)).toBe('1000.0K');
  });

  it('abbreviates millions', () => {
    expect(abbreviateNumber(1000000)).toBe('1.0M');
    expect(abbreviateNumber(5500000)).toBe('5.5M');
  });

  it('abbreviates billions', () => {
    expect(abbreviateNumber(1000000000)).toBe('1.0B');
    expect(abbreviateNumber(5500000000)).toBe('5.5B');
  });

  it('handles null, undefined, and NaN', () => {
    expect(abbreviateNumber(null)).toBe('0');
    expect(abbreviateNumber(undefined)).toBe('0');
    expect(abbreviateNumber(NaN)).toBe('0');
  });
});
