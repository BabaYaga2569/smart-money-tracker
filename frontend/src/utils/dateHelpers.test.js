// dateHelpers.test.js - Tests for date calculation utilities
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  normalizeToMidnight,
  daysBetween,
  daysUntil,
  getRelativeDateText,
  getBillStatusText
} from './dateHelpers';

describe('dateHelpers', () => {
  let originalDate;

  beforeEach(() => {
    // Store the original Date
    originalDate = global.Date;
  });

  afterEach(() => {
    // Restore the original Date
    global.Date = originalDate;
  });

  describe('normalizeToMidnight', () => {
    it('should normalize a date to midnight', () => {
      const date = new Date('2025-11-11T14:30:00');
      const normalized = normalizeToMidnight(date);
      
      expect(normalized.getHours()).toBe(0);
      expect(normalized.getMinutes()).toBe(0);
      expect(normalized.getSeconds()).toBe(0);
      expect(normalized.getMilliseconds()).toBe(0);
    });

    it('should handle string dates', () => {
      const normalized = normalizeToMidnight('2025-11-11');
      
      expect(normalized.getHours()).toBe(0);
      expect(normalized.getMinutes()).toBe(0);
      expect(normalized.getSeconds()).toBe(0);
      expect(normalized.getMilliseconds()).toBe(0);
    });

    it('should not modify dates already at midnight', () => {
      const date = new Date('2025-11-11T00:00:00');
      const normalized = normalizeToMidnight(date);
      
      expect(normalized.getHours()).toBe(0);
      expect(normalized.getMinutes()).toBe(0);
      expect(normalized.getSeconds()).toBe(0);
      expect(normalized.getMilliseconds()).toBe(0);
    });
  });

  describe('daysBetween', () => {
    it('should calculate days between two dates correctly', () => {
      const date1 = new Date('2025-11-11');
      const date2 = new Date('2025-11-16');
      
      expect(daysBetween(date1, date2)).toBe(5);
    });

    it('should return negative days for past dates', () => {
      const date1 = new Date('2025-11-11');
      const date2 = new Date('2025-11-09');
      
      expect(daysBetween(date1, date2)).toBe(-2);
    });

    it('should return 0 for same day', () => {
      const date1 = new Date('2025-11-11T08:00:00');
      const date2 = new Date('2025-11-11T20:00:00');
      
      expect(daysBetween(date1, date2)).toBe(0);
    });

    it('should handle dates with different time components correctly', () => {
      const date1 = new Date('2025-11-11T23:59:59');
      const date2 = new Date('2025-11-12T00:00:01');
      
      expect(daysBetween(date1, date2)).toBe(1);
    });

    it('should handle string date inputs', () => {
      expect(daysBetween('2025-11-11', '2025-11-16')).toBe(5);
    });
  });

  describe('daysUntil', () => {
    it('should calculate days until future date', () => {
      // Mock today as 2025-11-11
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const futureDate = new Date('2025-11-16');
      expect(daysUntil(futureDate)).toBe(5);
    });

    it('should return 0 for today', () => {
      // Mock today as 2025-11-11 at 2:30 PM
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      // Bill due today at midnight
      const today = new Date('2025-11-11T00:00:00');
      expect(daysUntil(today)).toBe(0);
    });

    it('should return negative for past dates', () => {
      // Mock today as 2025-11-11
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const pastDate = new Date('2025-11-09');
      expect(daysUntil(pastDate)).toBe(-2);
    });

    it('should handle the edge case where current time is afternoon', () => {
      // This is the key test case from the issue
      // Today is 2025-11-11 at 2:30 PM
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      // Bill due today (stored as midnight)
      const dueToday = new Date('2025-11-11T00:00:00');
      
      // Should return 0 (due today), not -1 (1 day ago)
      expect(daysUntil(dueToday)).toBe(0);
    });
  });

  describe('getRelativeDateText', () => {
    it('should return "Due today" for bills due today', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const dueToday = new Date('2025-11-11');
      expect(getRelativeDateText(dueToday)).toBe('Due today');
    });

    it('should return "Due tomorrow" for bills due tomorrow', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const dueTomorrow = new Date('2025-11-12');
      expect(getRelativeDateText(dueTomorrow)).toBe('Due tomorrow');
    });

    it('should return "Due in X days" for future bills', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const dueInFiveDays = new Date('2025-11-16');
      expect(getRelativeDateText(dueInFiveDays)).toBe('Due in 5 days');
    });

    it('should return "X days ago" for overdue bills', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const twoDaysAgo = new Date('2025-11-09');
      expect(getRelativeDateText(twoDaysAgo)).toBe('2 days ago');
    });

    it('should handle singular "day" correctly', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const oneDayAgo = new Date('2025-11-10');
      expect(getRelativeDateText(oneDayAgo)).toBe('1 day ago');

      const inOneDay = new Date('2025-11-12');
      expect(getRelativeDateText(inOneDay)).toBe('Due tomorrow');
    });
  });

  describe('getBillStatusText', () => {
    it('should return "DUE TODAY" for bills due today', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const dueToday = new Date('2025-11-11');
      expect(getBillStatusText(dueToday)).toBe('DUE TODAY');
    });

    it('should return "OVERDUE by X days" for overdue bills', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const threeDaysAgo = new Date('2025-11-08');
      expect(getBillStatusText(threeDaysAgo)).toBe('OVERDUE by 3 days');
    });

    it('should return "Due in X days" for upcoming bills', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const inFiveDays = new Date('2025-11-16');
      expect(getBillStatusText(inFiveDays)).toBe('Due in 5 days');
    });

    it('should handle singular forms correctly', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const oneDayAgo = new Date('2025-11-10');
      expect(getBillStatusText(oneDayAgo)).toBe('OVERDUE by 1 day');
    });
  });

  describe('Bug fix verification - Issue: Shows "1 day ago" When Due Today', () => {
    it('should correctly identify bill as due today when current time is afternoon', () => {
      // Simulate the exact bug scenario
      // Current time: 2025-11-11 at 2:30 PM
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      // Bill due date stored as midnight
      const billDueDate = new Date('2025-11-11T00:00:00');

      // This was showing "1 day ago" before the fix
      // Should now correctly show "Due today"
      expect(getRelativeDateText(billDueDate)).toBe('Due today');
      expect(getBillStatusText(billDueDate)).toBe('DUE TODAY');
      expect(daysUntil(billDueDate)).toBe(0);
    });

    it('should correctly calculate days for bill due tomorrow', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const billDueDate = new Date('2025-11-12T00:00:00');

      // This was showing "Due today" before the fix
      // Should now correctly show "Due tomorrow"
      expect(daysUntil(billDueDate)).toBe(1);
      expect(getRelativeDateText(billDueDate)).toBe('Due tomorrow');
    });

    it('should correctly calculate days for bill due in 5 days', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const billDueDate = new Date('2025-11-16T00:00:00');

      // This was showing "Due in 4 days" before the fix
      // Should now correctly show "Due in 5 days"
      expect(daysUntil(billDueDate)).toBe(5);
      expect(getRelativeDateText(billDueDate)).toBe('Due in 5 days');
    });

    it('should correctly calculate days for bill overdue by 2 days', () => {
      const mockDate = new Date('2025-11-11T14:30:00');
      vi.setSystemTime(mockDate);

      const billDueDate = new Date('2025-11-09T00:00:00');

      // This was showing "3 days ago" before the fix
      // Should now correctly show "2 days ago"
      expect(daysUntil(billDueDate)).toBe(-2);
      expect(getRelativeDateText(billDueDate)).toBe('2 days ago');
    });
  });
});
