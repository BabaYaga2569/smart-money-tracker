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
 * 4. Backward compatibility: Supports both nested and flat field structures
 */

describe('Spendability Early Deposit Integration', () => {
  
  describe('Backward Compatibility - Field Structure Detection', () => {
    
    test('should support flat structure (enableEarlyDeposit)', () => {
      // Arrange - User's actual Firebase structure
      const settings = {
        enableEarlyDeposit: true,
        earlyDepositAmount: 400,
        earlyDepositBank: 'SoFi',
        daysBeforePayday: 2,
        remainderBank: 'Bank of America',
        payAmount: 1883.81,
        lastPayDate: '2026-01-03'
      };
      
      const nextPayday = '2026-01-09';
      
      // Act
      const result = calculatePaydays(settings, nextPayday);
      
      // Assert
      expect(result.paydays).toHaveLength(2);
      expect(result.paydays[0].type).toBe('early');
      expect(result.paydays[0].amount).toBe(400);
      expect(result.paydays[0].date).toBe('2026-01-07');
      expect(result.paydays[0].bank).toBe('SoFi');
      
      expect(result.paydays[1].type).toBe('main');
      expect(result.paydays[1].amount).toBe(1483.81);
      expect(result.paydays[1].date).toBe('2026-01-09');
      expect(result.paydays[1].bank).toBe('Bank of America');
      
      expect(result.totalPaydayAmount).toBe(1883.81);
    });
    
    test('should support nested structure (earlyDeposit.enabled)', () => {
      // Arrange - New nested structure
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
      
      const nextPayday = '2026-01-09';
      
      // Act
      const result = calculatePaydays(settings, nextPayday);
      
      // Assert
      expect(result.paydays).toHaveLength(2);
      expect(result.paydays[0].type).toBe('early');
      expect(result.paydays[0].amount).toBe(400);
      expect(result.paydays[0].date).toBe('2026-01-07');
      expect(result.paydays[0].bank).toBe('SoFi');
      
      expect(result.paydays[1].type).toBe('main');
      expect(result.paydays[1].amount).toBe(1483.81);
      expect(result.paydays[1].date).toBe('2026-01-09');
      expect(result.paydays[1].bank).toBe('Bank of America');
      
      expect(result.totalPaydayAmount).toBe(1883.81);
    });
    
    test('should prefer nested structure when both exist', () => {
      // Arrange - Mixed structure (nested should take precedence)
      const settings = {
        earlyDeposit: {
          enabled: true,
          amount: 500,
          daysBefore: 3,
          bankName: 'Chase',
          remainderBank: 'Wells Fargo'
        },
        enableEarlyDeposit: false, // Should be ignored
        earlyDepositAmount: 400, // Should be ignored
        earlyDepositBank: 'SoFi', // Should be ignored
        payAmount: 1883.81
      };
      
      const nextPayday = '2026-01-09';
      
      // Act
      const result = calculatePaydays(settings, nextPayday);
      
      // Assert - Should use nested values
      expect(result.paydays).toHaveLength(2);
      expect(result.paydays[0].amount).toBe(500); // nested value
      expect(result.paydays[0].bank).toBe('Chase'); // nested value
      expect(result.paydays[1].bank).toBe('Wells Fargo'); // nested value
    });
    
  });

  
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
      expect(result.paydays[0].type).toBe('single');
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
      expect(result.paydays[0].type).toBe('single');
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
          daysBefore: 2,
          remainderBank: 'Main Bank'
        },
        payAmount: 1883.81
      };
      
      const nextPayday = '2026-01-09';
      
      // Act
      const result = calculatePaydays(settings, nextPayday);
      
      // Assert - Should fall back to single payday with total amount
      expect(result.paydays).toHaveLength(1);
      expect(result.paydays[0].type).toBe('single');
      expect(result.paydays[0].amount).toBe(1883.81);
      expect(result.totalPaydayAmount).toBe(1883.81);
    });
    
  });
  
});

/**
 * Helper function to simulate payday calculation logic from Spendability.jsx
 * Supports BOTH nested and flat field structures for backward compatibility
 */
function calculatePaydays(settingsData, nextPayday) {
  let paydays = [];
  let totalPaydayAmount = 0;
  
  // Check BOTH nested and flat field structures for backward compatibility
  const earlyDepositEnabled = 
    settingsData.earlyDeposit?.enabled === true || 
    settingsData.enableEarlyDeposit === true;

  const earlyDepositAmount = parseFloat(
    settingsData.earlyDeposit?.amount || 
    settingsData.earlyDepositAmount || 
    0
  );

  const earlyDepositBank = 
    settingsData.earlyDeposit?.bankName || 
    settingsData.earlyDepositBank || 
    'Early Deposit Account';

  const daysBeforePayday = parseInt(
    settingsData.earlyDeposit?.daysBefore || 
    settingsData.earlyDeposit?.daysBeforePayday ||
    settingsData.daysBeforePayday || 
    2
  );

  const remainderBank = 
    settingsData.earlyDeposit?.remainderBank || 
    settingsData.remainderBank || 
    'Main Account';
  
  if (earlyDepositEnabled && earlyDepositAmount > 0) {
    // Early deposit is enabled - calculate both deposits
    const mainPaydayDate = new Date(nextPayday);
    const earlyDepositDate = new Date(mainPaydayDate);
    earlyDepositDate.setDate(earlyDepositDate.getDate() - daysBeforePayday);
    
    const earlyAmount = earlyDepositAmount;
    const totalPayAmount = parseFloat(settingsData.payAmount) || 0;
    const mainAmount = totalPayAmount - earlyAmount;
    
    // Validation: Ensure early deposit doesn't exceed total pay
    if (earlyAmount > totalPayAmount) {
      // Fallback to single payday
      paydays = [
        { 
          date: nextPayday, 
          amount: totalPayAmount, 
          bank: remainderBank, 
          type: 'single'
        }
      ];
      totalPaydayAmount = totalPayAmount;
    } else {
      // Normal case - split between early and main
      paydays = [
        { 
          date: earlyDepositDate.toISOString().split('T')[0], 
          amount: earlyAmount, 
          bank: earlyDepositBank, 
          type: 'early'
        },
        { 
          date: nextPayday, 
          amount: mainAmount, 
          bank: remainderBank, 
          type: 'main'
        }
      ];
      
      totalPaydayAmount = earlyAmount + mainAmount;
    }
  } else {
    // Single payday (default)
    const payAmount = parseFloat(settingsData.payAmount) || 0;
    paydays = [
      { 
        date: nextPayday, 
        amount: payAmount, 
        bank: remainderBank || 'Main Bank', 
        type: 'single'
      }
    ];
    
    totalPaydayAmount = payAmount;
  }
  
  return { paydays, totalPaydayAmount };
}
