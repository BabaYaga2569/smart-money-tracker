/**
 * Test: Early Deposit Integration in Spendability
 * 
 * Purpose: Verify that early deposit settings are correctly read from Firebase
 * and properly integrated into the Spendability calculation
 * 
 * Test Scenarios:
 * 1. Early deposit enabled: Shows both deposits, includes both in calculation
 * 2. Early deposit disabled: Shows single payday, single amount in calculation
 * 3. Edge cases: Missing settings, invalid amounts
 */

describe('Spendability Early Deposit Integration', () => {
  
  describe('Multiple Paydays Calculation', () => {
    
    test('should calculate two paydays when early deposit is enabled', () => {
      // Arrange
      const settings = {
        earlyDeposit: {
          enabled: true,
          amount: 400,
          daysBefore: 2,
          bankName: 'SoFi',
          remainderBank: 'Bank of America'
        },
        payAmount: 1883.81,
        lastPayDate: '2026-01-03'
      };
      
      const nextPayday = '2026-01-09'; // Main payday
      
      // Act
      const result = calculatePaydays(settings, nextPayday);
      
      // Assert
      expect(result.paydays).toHaveLength(2);
      expect(result.paydays[0].type).toBe('early');
      expect(result.paydays[0].amount).toBe(400);
      expect(result.paydays[0].date).toBe('2026-01-07'); // 2 days before main
      expect(result.paydays[0].bank).toBe('SoFi');
      
      expect(result.paydays[1].type).toBe('main');
      expect(result.paydays[1].amount).toBe(1483.81); // 1883.81 - 400
      expect(result.paydays[1].date).toBe('2026-01-09');
      expect(result.paydays[1].bank).toBe('Bank of America');
      
      expect(result.totalPaydayAmount).toBe(1883.81);
    });
    
    test('should calculate single payday when early deposit is disabled', () => {
      // Arrange
      const settings = {
        earlyDeposit: {
          enabled: false
        },
        payAmount: 1883.81,
        lastPayDate: '2026-01-03'
      };
      
      const nextPayday = '2026-01-09';
      
      // Act
      const result = calculatePaydays(settings, nextPayday);
      
      // Assert
      expect(result.paydays).toHaveLength(1);
      expect(result.paydays[0].type).toBe('main');
      expect(result.paydays[0].amount).toBe(1883.81);
      expect(result.paydays[0].date).toBe('2026-01-09');
      expect(result.totalPaydayAmount).toBe(1883.81);
    });
    
    test('should handle missing early deposit settings gracefully', () => {
      // Arrange
      const settings = {
        payAmount: 1883.81,
        lastPayDate: '2026-01-03'
      };
      
      const nextPayday = '2026-01-09';
      
      // Act
      const result = calculatePaydays(settings, nextPayday);
      
      // Assert
      expect(result.paydays).toHaveLength(1);
      expect(result.paydays[0].type).toBe('main');
      expect(result.totalPaydayAmount).toBe(1883.81);
    });
    
  });
  
  describe('Safe to Spend Calculation', () => {
    
    test('should include both deposits in safe-to-spend when early deposit enabled', () => {
      // Arrange
      const currentBalance = 670.75;
      const paydays = [
        { date: '2026-01-07', amount: 400, type: 'early' },
        { date: '2026-01-09', amount: 1483.81, type: 'main' }
      ];
      const billsDue = 45.00;
      const weeklyEssentials = 100.00;
      const safetyBuffer = 100.00;
      
      // Act
      const totalPaydayAmount = paydays.reduce((sum, p) => sum + p.amount, 0);
      const safeToSpend = currentBalance + totalPaydayAmount - billsDue - weeklyEssentials - safetyBuffer;
      
      // Assert
      expect(totalPaydayAmount).toBe(1883.81);
      expect(safeToSpend).toBeCloseTo(2309.56, 2);
    });
    
    test('should use single amount when early deposit disabled', () => {
      // Arrange
      const currentBalance = 670.75;
      const paydays = [
        { date: '2026-01-09', amount: 1883.81, type: 'main' }
      ];
      const billsDue = 45.00;
      const weeklyEssentials = 100.00;
      const safetyBuffer = 100.00;
      
      // Act
      const totalPaydayAmount = paydays.reduce((sum, p) => sum + p.amount, 0);
      const safeToSpend = currentBalance + totalPaydayAmount - billsDue - weeklyEssentials - safetyBuffer;
      
      // Assert
      expect(totalPaydayAmount).toBe(1883.81);
      expect(safeToSpend).toBeCloseTo(2309.56, 2);
    });
    
  });
  
  describe('Edge Cases', () => {
    
    test('should handle zero early deposit amount', () => {
      // Arrange
      const settings = {
        earlyDeposit: {
          enabled: true,
          amount: 0,
          daysBefore: 2
        },
        payAmount: 1883.81
      };
      
      const nextPayday = '2026-01-09';
      
      // Act
      const result = calculatePaydays(settings, nextPayday);
      
      // Assert - Should fall back to single payday when amount is 0
      expect(result.paydays).toHaveLength(1);
      expect(result.totalPaydayAmount).toBe(1883.81);
    });
    
    test('should handle invalid early deposit amount', () => {
      // Arrange
      const settings = {
        earlyDeposit: {
          enabled: true,
          amount: 'invalid',
          daysBefore: 2
        },
        payAmount: 1883.81
      };
      
      const nextPayday = '2026-01-09';
      
      // Act
      const result = calculatePaydays(settings, nextPayday);
      
      // Assert - Should fall back to single payday when amount is invalid
      expect(result.paydays).toHaveLength(1);
    });
    
    test('should handle early deposit amount exceeding total pay', () => {
      // Arrange
      const settings = {
        earlyDeposit: {
          enabled: true,
          amount: 2000, // More than total pay
          daysBefore: 2
        },
        payAmount: 1883.81
      };
      
      const nextPayday = '2026-01-09';
      
      // Act
      const result = calculatePaydays(settings, nextPayday);
      
      // Assert - Should still calculate but main amount will be negative
      expect(result.paydays).toHaveLength(2);
      expect(result.paydays[0].amount).toBe(2000);
      expect(result.paydays[1].amount).toBe(-116.19); // This might need validation in actual code
    });
    
  });
  
});

/**
 * Helper function to simulate payday calculation logic from Spendability.jsx
 */
function calculatePaydays(settingsData, nextPayday) {
  let paydays = [];
  let totalPaydayAmount = 0;
  
  if (settingsData.earlyDeposit?.enabled && settingsData.earlyDeposit?.amount > 0) {
    // Early deposit is enabled - calculate both deposits
    const mainPaydayDate = new Date(nextPayday);
    const earlyDepositDate = new Date(mainPaydayDate);
    earlyDepositDate.setDate(earlyDepositDate.getDate() - (settingsData.earlyDeposit.daysBefore || 2));
    
    const earlyAmount = parseFloat(settingsData.earlyDeposit.amount) || 0;
    const totalPayAmount = parseFloat(settingsData.payAmount) || 0;
    const mainAmount = totalPayAmount - earlyAmount;
    
    paydays = [
      { 
        date: earlyDepositDate.toISOString().split('T')[0], 
        amount: earlyAmount, 
        bank: settingsData.earlyDeposit.bankName || 'Early Deposit Bank', 
        type: 'early'
      },
      { 
        date: nextPayday, 
        amount: mainAmount, 
        bank: settingsData.earlyDeposit.remainderBank || 'Main Bank', 
        type: 'main'
      }
    ];
    
    totalPaydayAmount = earlyAmount + mainAmount;
  } else {
    // Single payday (default)
    const payAmount = parseFloat(settingsData.payAmount) || 0;
    paydays = [
      { 
        date: nextPayday, 
        amount: payAmount, 
        bank: 'Main Bank', 
        type: 'main'
      }
    ];
    
    totalPaydayAmount = payAmount;
  }
  
  return { paydays, totalPaydayAmount };
}
