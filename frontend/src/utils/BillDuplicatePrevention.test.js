// BillDuplicatePrevention.test.js - Test for enhanced duplicate prevention with Plaid integration
import { RecurringBillManager } from './RecurringBillManager.js';
import { PlaidIntegrationManager } from './PlaidIntegrationManager.js';

// Simple test assertion helper
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
};

const test = (name, fn) => {
    try {
        fn();
        console.log(`✅ ${name}`);
        return true;
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   Error: ${error.message}`);
        return false;
    }
};

export const runDuplicatePreventionTests = () => {
    console.log('🧪 Testing Enhanced Bill Duplicate Prevention with Plaid Integration\n');

    let passedTests = 0;
    let totalTests = 0;

    // Test 1: Bill cannot be paid twice manually
    totalTests++;
    if (test('Manual payment duplicate prevention', () => {
        const mockBill = {
            name: 'Electric Bill',
            amount: '125.50',
            dueDate: '2025-01-30',
            nextDueDate: '2025-01-30',
            recurrence: 'monthly',
            status: 'pending'
        };

        // First payment should succeed
        const paymentCheck1 = RecurringBillManager.canPayBill(mockBill);
        assert(paymentCheck1.canPay === true, 'First payment should be allowed');

        // Mark as paid
        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, new Date('2025-01-30'));
        
        // Second payment should be prevented
        const paymentCheck2 = RecurringBillManager.canPayBill(paidBill);
        assert(paymentCheck2.canPay === false, 'Second payment should be prevented');
        assert(paymentCheck2.reason.includes('Already paid'), 'Should indicate already paid');
    })) {
        passedTests++;
    }

    // Test 2: Plaid transaction cannot pay already-paid bill
    totalTests++;
    if (test('Plaid transaction duplicate prevention', () => {
        const mockBill = {
            name: 'Internet Service',
            amount: '89.99',
            dueDate: '2025-01-25',
            nextDueDate: '2025-01-25',
            recurrence: 'monthly',
            status: 'pending'
        };

        // Manual payment first
        const manuallyPaidBill = RecurringBillManager.markBillAsPaid(mockBill, new Date('2025-01-25'), {
            method: 'manual',
            source: 'manual'
        });

        // Plaid transaction should not pay it again
        const paymentCheck = RecurringBillManager.canPayBill(manuallyPaidBill);
        assert(paymentCheck.canPay === false, 'Plaid should not pay already-paid bill');
    })) {
        passedTests++;
    }

    // Test 3: Transaction ID tracking prevents duplicates
    totalTests++;
    if (test('Transaction ID prevents duplicate usage', () => {
        const transactionId = 'txn_12345';
        const mockBill = {
            name: 'Water Bill',
            amount: '45.00',
            dueDate: '2025-01-28',
            nextDueDate: '2025-01-28',
            recurrence: 'monthly',
            status: 'pending',
            paymentHistory: []
        };

        // Pay with transaction ID
        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, new Date('2025-01-28'), {
            transactionId: transactionId,
            source: 'plaid'
        });

        // Check if transaction was already used
        const alreadyUsed = RecurringBillManager.findBillPaidByTransaction(transactionId, [paidBill]);
        assert(alreadyUsed !== null, 'Transaction should be found in payment history');
        assert(alreadyUsed.name === 'Water Bill', 'Correct bill should be found');
    })) {
        passedTests++;
    }

    // Test 4: Payment source tracking (Plaid vs Manual)
    totalTests++;
    if (test('Payment source is tracked correctly', () => {
        const mockBill = {
            name: 'Gas Bill',
            amount: '67.50',
            dueDate: '2025-01-29',
            nextDueDate: '2025-01-29',
            recurrence: 'monthly'
        };

        const paidBillPlaid = RecurringBillManager.markBillAsPaid(mockBill, new Date('2025-01-29'), {
            source: 'plaid',
            method: 'auto-detected',
            transactionId: 'plaid_txn_123'
        });

        assert(paidBillPlaid.lastPayment.source === 'plaid', 'Source should be plaid');
        assert(paidBillPlaid.lastPayment.method === 'auto-detected', 'Method should be auto-detected');
        assert(paidBillPlaid.lastPayment.transactionId === 'plaid_txn_123', 'Transaction ID should be stored');
    })) {
        passedTests++;
    }

    // Test 5: Check transaction already used by PlaidIntegrationManager
    totalTests++;
    if (test('PlaidIntegrationManager checks transaction usage', () => {
        const transactionId = 'txn_unique_123';
        const bills = [
            {
                name: 'Phone Bill',
                amount: '55.00',
                paymentHistory: [
                    { transactionId: 'txn_unique_123', paidDate: new Date('2025-01-20') }
                ]
            }
        ];

        const alreadyUsed = PlaidIntegrationManager.checkTransactionAlreadyUsed(transactionId, bills);
        assert(alreadyUsed !== null, 'Transaction should be found as already used');
        assert(alreadyUsed.name === 'Phone Bill', 'Correct bill should be returned');
    })) {
        passedTests++;
    }

    // Test 6: Bill status after payment
    totalTests++;
    if (test('Bill status updates correctly after payment', () => {
        const mockBill = {
            name: 'Trash Service',
            amount: '30.00',
            dueDate: '2025-01-15',
            nextDueDate: '2025-01-15',
            recurrence: 'monthly',
            status: 'pending'
        };

        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, new Date('2025-01-15'));
        
        assert(paidBill.status === 'paid', 'Status should be paid');
        assert(paidBill.isPaid === true, 'isPaid flag should be true');
        assert(paidBill.lastPaidDate !== null, 'lastPaidDate should be set');
    })) {
        passedTests++;
    }

    console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All duplicate prevention tests passed!');
    } else {
        console.log(`⚠️  ${totalTests - passedTests} test(s) failed`);
    }

    return {
        passed: passedTests,
        total: totalTests,
        success: passedTests === totalTests
    };
};

// Auto-run if called directly
if (typeof window !== 'undefined' && window.location) {
    window.runDuplicatePreventionTests = runDuplicatePreventionTests;
}
