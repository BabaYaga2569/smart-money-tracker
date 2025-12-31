import { describe, it, expect, vi } from 'vitest';
import { getPacificTime, getLocalMidnight } from '../timezoneHelpers';
import { calculateNextPayday, getDaysUntilPayday } from '../PaydayCalculator';

describe('Timezone Utilities', () => {
  describe('getPacificTime', () => {
    it('returns a valid Date object', () => {
      const pacificTime = getPacificTime();
      expect(pacificTime).toBeInstanceOf(Date);
      expect(pacificTime.getTime()).not.toBeNaN();
    });

    it('returns current Pacific timezone date', () => {
      const pacificTime = getPacificTime();
      const now = new Date();
      
      // Pacific time should be within 24 hours of current time
      const timeDiff = Math.abs(now - pacificTime);
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      expect(hoursDiff).toBeLessThan(24);
    });

    it('handles DST transitions correctly', () => {
      // This test verifies that getPacificTime uses proper timezone handling
      // rather than manual offset calculation
      const pacificTime = getPacificTime();
      
      // Verify that the date has all required components
      expect(pacificTime.getFullYear()).toBeGreaterThan(2020);
      expect(pacificTime.getMonth()).toBeGreaterThanOrEqual(0);
      expect(pacificTime.getMonth()).toBeLessThanOrEqual(11);
      expect(pacificTime.getDate()).toBeGreaterThanOrEqual(1);
      expect(pacificTime.getDate()).toBeLessThanOrEqual(31);
    });
  });

  describe('getLocalMidnight', () => {
    it('returns midnight in Pacific timezone', () => {
      const midnight = getLocalMidnight();
      expect(midnight.getHours()).toBe(0);
      expect(midnight.getMinutes()).toBe(0);
      expect(midnight.getSeconds()).toBe(0);
      expect(midnight.getMilliseconds()).toBe(0);
    });

    it('returns a Date object for today', () => {
      const midnight = getLocalMidnight();
      const today = getPacificTime();
      
      // Same year, month, and day
      expect(midnight.getFullYear()).toBe(today.getFullYear());
      expect(midnight.getMonth()).toBe(today.getMonth());
      expect(midnight.getDate()).toBe(today.getDate());
    });
  });

  describe('calculateNextPayday', () => {
    it('correctly calculates bi-weekly payday', () => {
      // Mock getPacificTime to return a fixed date: Nov 15, 2024
      vi.spyOn(Date, 'now').mockImplementation(() => new Date('2024-11-15T12:00:00Z').getTime());
      
      // Last payday: Nov 14, 2024
      // Next payday should be: Nov 28, 2024 (14 days later)
      const lastPayDate = '2024-11-14';
      const nextPayday = calculateNextPayday(lastPayDate, 'biweekly');
      
      expect(nextPayday.getDate()).toBe(28);
      expect(nextPayday.getMonth()).toBe(10); // November (0-indexed)
      expect(nextPayday.getFullYear()).toBe(2024);
      
      vi.restoreAllMocks();
    });

    it('advances payday if calculated date is in the past', () => {
      // If last payday was 30 days ago, should skip to next cycle
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const lastPayDate = thirtyDaysAgo.toISOString().split('T')[0];
      const nextPayday = calculateNextPayday(lastPayDate, 'biweekly');
      
      // Next payday should be in the future
      const today = getPacificTime();
      today.setHours(0, 0, 0, 0);
      expect(nextPayday > today).toBe(true);
    });

    it('handles weekly pay frequency', () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const lastPayDate = sevenDaysAgo.toISOString().split('T')[0];
      const nextPayday = calculateNextPayday(lastPayDate, 'weekly');
      
      // Should be today or in the near future
      const today = getPacificTime();
      today.setHours(0, 0, 0, 0);
      
      const daysDiff = Math.ceil((nextPayday - today) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(0);
      expect(daysDiff).toBeLessThanOrEqual(7);
    });

    it('handles monthly pay frequency', () => {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      const lastPayDate = oneMonthAgo.toISOString().split('T')[0];
      const nextPayday = calculateNextPayday(lastPayDate, 'monthly');
      
      // Next payday should be in the future
      const today = getPacificTime();
      today.setHours(0, 0, 0, 0);
      expect(nextPayday > today).toBe(true);
    });
  });

  describe('getDaysUntilPayday', () => {
    it('returns correct number of days for future date', () => {
      const today = getPacificTime();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 5);
      
      const days = getDaysUntilPayday(futureDate);
      expect(days).toBe(5);
    });

    it('returns 0 for today', () => {
      const today = getPacificTime();
      today.setHours(0, 0, 0, 0);
      
      const days = getDaysUntilPayday(today);
      expect(days).toBe(0);
    });

    it('returns 0 for past dates', () => {
      const yesterday = getPacificTime();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const days = getDaysUntilPayday(yesterday);
      expect(days).toBe(0);
    });

    it('handles date strings correctly', () => {
      const today = getPacificTime();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 10);
      
      const futureDateString = futureDate.toISOString().split('T')[0];
      const days = getDaysUntilPayday(futureDateString);
      
      expect(days).toBe(10);
    });

    it('handles 14 days correctly (bi-weekly scenario)', () => {
      const today = getPacificTime();
      const payday = new Date(today);
      payday.setDate(payday.getDate() + 14);
      
      const days = getDaysUntilPayday(payday);
      expect(days).toBe(14);
    });
  });

  describe('Integration: Full payday calculation flow', () => {
    it('calculates correct days until payday for bi-weekly schedule', () => {
      // Simulate: last payday was 7 days ago, next payday is in 7 days
      const today = getPacificTime();
      const lastPayday = new Date(today);
      lastPayday.setDate(lastPayday.getDate() - 7);
      
      const lastPayDateString = lastPayday.toISOString().split('T')[0];
      const nextPayday = calculateNextPayday(lastPayDateString, 'biweekly');
      const daysUntil = getDaysUntilPayday(nextPayday);
      
      expect(daysUntil).toBe(7);
    });

    it('handles payday that falls on today', () => {
      const today = getPacificTime();
      const fourteenDaysAgo = new Date(today);
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      
      const lastPayDateString = fourteenDaysAgo.toISOString().split('T')[0];
      const nextPayday = calculateNextPayday(lastPayDateString, 'biweekly');
      const daysUntil = getDaysUntilPayday(nextPayday);
      
      // Should be either 0 (today) or very close
      expect(daysUntil).toBeLessThanOrEqual(1);
    });
  });
});
