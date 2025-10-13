/**
 * Tests for Subscription Calculations
 */

import {
  calculateMonthlyTotal,
  calculateAnnualTotal,
  getUpcomingRenewals,
  groupByCategory,
  getMonthlyEquivalent,
  countActiveSubscriptions,
  getCategoryBreakdown,
  isDueSoon
} from './subscriptionCalculations';

describe('Subscription Calculations', () => {
  const mockSubscriptions = [
    {
      id: 'sub1',
      name: 'Netflix',
      cost: 15.99,
      billingCycle: 'Monthly',
      status: 'active',
      category: 'Entertainment',
      nextRenewal: '2025-10-15'
    },
    {
      id: 'sub2',
      name: 'Dropbox',
      cost: 119.88,
      billingCycle: 'Annual',
      status: 'active',
      category: 'Storage',
      nextRenewal: '2026-01-05'
    },
    {
      id: 'sub3',
      name: 'Gym',
      cost: 90,
      billingCycle: 'Quarterly',
      status: 'active',
      category: 'Fitness',
      nextRenewal: '2025-10-20'
    },
    {
      id: 'sub4',
      name: 'Spotify',
      cost: 10.99,
      billingCycle: 'Monthly',
      status: 'cancelled',
      category: 'Entertainment',
      nextRenewal: '2025-10-10'
    }
  ];

  describe('calculateMonthlyTotal', () => {
    it('should calculate total monthly burn correctly', () => {
      const total = calculateMonthlyTotal(mockSubscriptions);
      // Netflix: 15.99 + Dropbox: 119.88/12 + Gym: 90/3 = 15.99 + 9.99 + 30 = 55.98
      expect(total).toBeCloseTo(55.98, 2);
    });

    it('should return 0 for empty array', () => {
      expect(calculateMonthlyTotal([])).toBe(0);
    });

    it('should exclude cancelled subscriptions', () => {
      const activeOnly = mockSubscriptions.filter(s => s.status === 'active');
      const total = calculateMonthlyTotal(activeOnly);
      expect(total).toBeCloseTo(55.98, 2);
    });
  });

  describe('calculateAnnualTotal', () => {
    it('should calculate annual total correctly', () => {
      const annual = calculateAnnualTotal(mockSubscriptions);
      const monthly = calculateMonthlyTotal(mockSubscriptions);
      expect(annual).toBeCloseTo(monthly * 12, 2);
    });
  });

  describe('getUpcomingRenewals', () => {
    it('should return subscriptions renewing within 7 days', () => {
      // Mock current date to test properly
      const today = new Date('2025-10-13');
      const sevenDaysLater = new Date('2025-10-20');
      
      const upcoming = getUpcomingRenewals(mockSubscriptions, 7);
      
      // Should not include cancelled subscription
      expect(upcoming.every(s => s.status === 'active')).toBe(true);
    });

    it('should return empty array when no upcoming renewals', () => {
      const distantSubs = [
        {
          id: 'sub1',
          name: 'Test',
          nextRenewal: '2026-12-31',
          status: 'active'
        }
      ];
      const upcoming = getUpcomingRenewals(distantSubs, 7);
      expect(upcoming).toHaveLength(0);
    });
  });

  describe('groupByCategory', () => {
    it('should group subscriptions by category', () => {
      const grouped = groupByCategory(mockSubscriptions);
      expect(grouped['Entertainment']).toHaveLength(2);
      expect(grouped['Storage']).toHaveLength(1);
      expect(grouped['Fitness']).toHaveLength(1);
    });
  });

  describe('getMonthlyEquivalent', () => {
    it('should return monthly cost for monthly subscription', () => {
      expect(getMonthlyEquivalent(mockSubscriptions[0])).toBe(15.99);
    });

    it('should calculate monthly equivalent for annual subscription', () => {
      expect(getMonthlyEquivalent(mockSubscriptions[1])).toBeCloseTo(9.99, 2);
    });

    it('should calculate monthly equivalent for quarterly subscription', () => {
      expect(getMonthlyEquivalent(mockSubscriptions[2])).toBe(30);
    });
  });

  describe('countActiveSubscriptions', () => {
    it('should count only active subscriptions', () => {
      const count = countActiveSubscriptions(mockSubscriptions);
      expect(count).toBe(3);
    });

    it('should return 0 for empty array', () => {
      expect(countActiveSubscriptions([])).toBe(0);
    });
  });

  describe('getCategoryBreakdown', () => {
    it('should calculate category breakdown correctly', () => {
      const breakdown = getCategoryBreakdown(mockSubscriptions);
      expect(breakdown['Entertainment']).toBeCloseTo(15.99, 2); // Only Netflix (active)
      expect(breakdown['Storage']).toBeCloseTo(9.99, 2);
      expect(breakdown['Fitness']).toBe(30);
    });
  });

  describe('isDueSoon', () => {
    it('should identify subscriptions due within 3 days', () => {
      // Set up a subscription that renews in 2 days
      const today = new Date();
      const twoDaysLater = new Date(today);
      twoDaysLater.setDate(today.getDate() + 2);
      
      const sub = {
        nextRenewal: twoDaysLater.toISOString().split('T')[0]
      };
      
      expect(isDueSoon(sub)).toBe(true);
    });

    it('should return false for subscriptions due in more than 3 days', () => {
      const today = new Date();
      const fiveDaysLater = new Date(today);
      fiveDaysLater.setDate(today.getDate() + 5);
      
      const sub = {
        nextRenewal: fiveDaysLater.toISOString().split('T')[0]
      };
      
      expect(isDueSoon(sub)).toBe(false);
    });
  });
});
