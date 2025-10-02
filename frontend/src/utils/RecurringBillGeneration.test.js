// Test suite for Recurring Bill Generation feature
import { RecurringBillManager } from './RecurringBillManager';

describe('RecurringBillManager - Bill Generation', () => {
  const mockGenerateBillId = () => `test_bill_${Date.now()}`;

  describe('generateBillsFromTemplate', () => {
    it('should generate bills with recurringTemplateId field', () => {
      const template = {
        id: 'template_123',
        name: 'Netflix Subscription',
        amount: 15.99,
        category: 'Subscriptions',
        frequency: 'monthly',
        nextOccurrence: '2025-10-15',
        autoPay: true,
        linkedAccount: 'bofa'
      };

      const bills = RecurringBillManager.generateBillsFromTemplate(
        template,
        3,
        mockGenerateBillId
      );

      // Verify bills have recurringTemplateId
      expect(bills.length).toBeGreaterThan(0);
      bills.forEach(bill => {
        expect(bill.recurringTemplateId).toBe('template_123');
        expect(bill.name).toBe('Netflix Subscription');
        expect(bill.amount).toBe(15.99);
      });
    });

    it('should generate multiple bills for future months', () => {
      const template = {
        id: 'template_456',
        name: 'Car Insurance',
        amount: 125.00,
        category: 'Bills & Utilities',
        frequency: 'monthly',
        nextOccurrence: '2025-10-12',
        autoPay: true
      };

      const bills = RecurringBillManager.generateBillsFromTemplate(
        template,
        3,
        mockGenerateBillId
      );

      // Should generate up to 3 bills for future dates
      expect(bills.length).toBeGreaterThanOrEqual(1);
      expect(bills.length).toBeLessThanOrEqual(3);

      // All bills should have unique IDs
      const ids = bills.map(b => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should throw error if template has no ID', () => {
      const template = {
        name: 'Test',
        amount: 10,
        frequency: 'monthly'
      };

      expect(() => {
        RecurringBillManager.generateBillsFromTemplate(template, 3, mockGenerateBillId);
      }).toThrow('Valid recurring template with ID is required');
    });

    it('should map frequency to recurrence correctly', () => {
      const template = {
        id: 'template_789',
        name: 'Weekly Subscription',
        amount: 5.99,
        category: 'Subscriptions',
        frequency: 'weekly',
        nextOccurrence: '2025-10-10'
      };

      const bills = RecurringBillManager.generateBillsFromTemplate(
        template,
        2,
        mockGenerateBillId
      );

      bills.forEach(bill => {
        expect(bill.recurrence).toBe('weekly');
        expect(bill.recurringTemplateId).toBe('template_789');
      });
    });
  });
});
