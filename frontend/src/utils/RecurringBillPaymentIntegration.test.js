// RecurringBillPaymentIntegration.test.js - Integration test simulating bill payment workflow
import { RecurringManager } from './RecurringManager.js';
import { RecurringBillManager } from './RecurringBillManager.js';
import { parseLocalDate } from './DateUtils.js';

// Simulate the complete workflow from recurring template to bill payment
const runIntegrationTests = () => {
    console.log('🧪 Testing Recurring Bill Payment Integration...\n');

    let passedTests = 0;
    let failedTests = 0;

    const assert = (condition, message) => {
        if (!condition) {
            console.error(`❌ FAILED: ${message}`);
            failedTests++;
            throw new Error(message);
        }
        passedTests++;
    };

    const test = (name, fn) => {
        try {
            console.log(`\n🧪 ${name}`);
            fn();
            console.log(`✅ PASSED: ${name}`);
        } catch (error) {
            console.error(`❌ FAILED: ${name}`);
            console.error(error.message);
        }
    };

    // Integration Test 1: Full workflow - recurring template with bill due today
    test('Full workflow: Bill due today stays visible until paid', () => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        // Step 1: User has recurring template with nextOccurrence = today
        const recurringTemplate = {
            id: 'template-food-1',
            name: 'Food Bill',
            amount: 100,
            frequency: 'monthly',
            nextOccurrence: todayStr,
            status: 'active',
            type: 'expense',
            category: 'Bills & Utilities'
        };

        // Step 2: User opens Recurring page - should NOT auto-advance
        const processedTemplates = RecurringManager.processRecurringItems([recurringTemplate]);
        
        assert(
            processedTemplates[0].nextOccurrence === todayStr,
            `Template should keep nextOccurrence at ${todayStr}, not advance`
        );
        console.log(`   ✓ Step 1: Template stays at ${todayStr} (not auto-advanced)`);

        // Step 3: Bill instance generated from template (this would be in Bills page)
        const generateBillId = () => 'bill-test-1';
        const billInstances = RecurringBillManager.generateBillsFromTemplate(
            recurringTemplate, 
            1, // Just 1 month ahead
            generateBillId
        );

        assert(billInstances.length === 1, 'Should generate 1 bill instance');
        const billInstance = billInstances[0];
        
        assert(
            billInstance.dueDate === todayStr,
            `Bill should be due today: ${todayStr}`
        );
        console.log(`   ✓ Step 2: Bill instance created for ${todayStr}`);

        // Step 4: Bill appears in spendability calculator (due today)
        const billsDueToday = RecurringBillManager.getBillsDueBefore([billInstance], today);
        assert(
            billsDueToday.length === 1,
            'Bill due today should appear in spendability calculator'
        );
        console.log(`   ✓ Step 3: Bill visible in spendability calculator`);

        // Step 5: User marks bill as paid
        const paidBill = RecurringBillManager.markBillAsPaid(billInstance, today);
        
        assert(paidBill.isPaid === true, 'Bill should be marked as paid');
        assert(paidBill.status === 'paid', 'Bill status should be "paid"');
        console.log(`   ✓ Step 4: Bill marked as paid`);

        // Step 6: Recurring template should advance (this happens in Bills.jsx)
        const advancedNextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(
            todayStr,
            recurringTemplate.frequency
        );

        const daysDiff = Math.floor((advancedNextOccurrence - today) / (1000 * 60 * 60 * 24));
        assert(
            daysDiff >= 28 && daysDiff <= 31,
            `Template should advance to next month (~30 days), got ${daysDiff} days`
        );
        console.log(`   ✓ Step 5: Template advanced to ${advancedNextOccurrence.toISOString().split('T')[0]}`);

        // Step 7: Verify bill no longer appears in spendability (it's paid)
        const billsAfterPayment = RecurringBillManager.getBillsDueBefore([paidBill], today);
        assert(
            billsAfterPayment.length === 0,
            'Paid bill should NOT appear in spendability calculator'
        );
        console.log(`   ✓ Step 6: Paid bill removed from spendability calculator`);
    });

    // Integration Test 2: Overdue unpaid bill workflow
    test('Overdue bill workflow: Bill stays visible until paid', () => {
        const today = new Date();
        const threeDaysAgo = new Date(today);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const overdueStr = threeDaysAgo.toISOString().split('T')[0];

        // Step 1: Recurring template has nextOccurrence 3 days ago
        const recurringTemplate = {
            id: 'template-internet-1',
            name: 'Internet Bill',
            amount: 89.99,
            frequency: 'monthly',
            nextOccurrence: overdueStr,
            status: 'active',
            type: 'expense'
        };

        // Step 2: User opens Recurring page - should NOT auto-advance
        const processedTemplates = RecurringManager.processRecurringItems([recurringTemplate]);
        
        assert(
            processedTemplates[0].nextOccurrence === overdueStr,
            'Overdue template should NOT auto-advance'
        );
        console.log(`   ✓ Step 1: Overdue template stays at ${overdueStr}`);

        // Step 3: Bill instance still visible and overdue
        const generateBillId = () => 'bill-overdue-1';
        const billInstances = RecurringBillManager.generateBillsFromTemplate(
            recurringTemplate,
            1,
            generateBillId
        );

        const billInstance = billInstances[0];
        const billsDueBeforeToday = RecurringBillManager.getBillsDueBefore([billInstance], today);
        
        assert(
            billsDueBeforeToday.length === 1,
            'Overdue bill should be visible'
        );
        console.log(`   ✓ Step 2: Overdue bill visible in calculator`);

        // Step 4: User finally pays the overdue bill
        const paidBill = RecurringBillManager.markBillAsPaid(billInstance, today);
        
        assert(paidBill.isPaid === true, 'Overdue bill should be marked as paid');
        console.log(`   ✓ Step 3: Overdue bill marked as paid`);

        // Step 5: Template advances ONLY after payment
        const advancedNextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(
            overdueStr,
            recurringTemplate.frequency
        );

        // Should be ~1 month from the original due date (not from today)
        const daysDiffFromOriginal = Math.floor((advancedNextOccurrence - threeDaysAgo) / (1000 * 60 * 60 * 24));
        assert(
            daysDiffFromOriginal >= 28 && daysDiffFromOriginal <= 31,
            'Template should advance by ~1 month from original due date'
        );
        console.log(`   ✓ Step 4: Template advanced from ${overdueStr} to ${advancedNextOccurrence.toISOString().split('T')[0]}`);
    });

    // Integration Test 3: Multiple recurring bills - only paid ones advance
    test('Multiple bills: Only paid bills advance their templates', () => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        // Two recurring templates due today
        const template1 = {
            id: 'template-electric',
            name: 'Electric Bill',
            amount: 125,
            frequency: 'monthly',
            nextOccurrence: todayStr,
            status: 'active',
            type: 'expense'
        };

        const template2 = {
            id: 'template-water',
            name: 'Water Bill',
            amount: 45,
            frequency: 'monthly',
            nextOccurrence: todayStr,
            status: 'active',
            type: 'expense'
        };

        // Process templates - neither should auto-advance
        const processed = RecurringManager.processRecurringItems([template1, template2]);
        
        assert(
            processed[0].nextOccurrence === todayStr && processed[1].nextOccurrence === todayStr,
            'Both templates should stay at today'
        );
        console.log(`   ✓ Step 1: Both templates stay at ${todayStr}`);

        // User pays only the electric bill
        const electricBill = {
            id: 'bill-electric-1',
            name: 'Electric Bill',
            amount: 125,
            dueDate: todayStr,
            recurringTemplateId: 'template-electric',
            recurrence: 'monthly'
        };

        const paidElectricBill = RecurringBillManager.markBillAsPaid(electricBill, today);
        
        assert(paidElectricBill.isPaid === true, 'Electric bill should be paid');
        console.log(`   ✓ Step 2: Electric bill paid`);

        // Only electric template should advance
        const advancedElectric = RecurringManager.calculateNextOccurrenceAfterPayment(
            todayStr,
            template1.frequency
        );

        const daysDiff = Math.floor((advancedElectric - today) / (1000 * 60 * 60 * 24));
        assert(
            daysDiff >= 28 && daysDiff <= 31,
            'Electric template should advance to next month'
        );
        console.log(`   ✓ Step 3: Electric template advanced to ${advancedElectric.toISOString().split('T')[0]}`);

        // Water template should stay at today (not paid yet)
        assert(
            processed[1].nextOccurrence === todayStr,
            'Water template should stay at today (unpaid)'
        );
        console.log(`   ✓ Step 4: Water template stays at ${todayStr} (unpaid)`);
    });

    // Integration Test 4: User manually edits nextOccurrence
    test('User manually edits nextOccurrence - change is preserved', () => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        // User has template with wrong date (tomorrow)
        const recurringTemplate = {
            id: 'template-rent',
            name: 'Rent',
            amount: 1200,
            frequency: 'monthly',
            nextOccurrence: tomorrowStr,
            status: 'active'
        };

        // User realizes it should be today, edits it
        const editedTemplate = {
            ...recurringTemplate,
            nextOccurrence: today.toISOString().split('T')[0]
        };

        // After save and reload, should preserve user's edit
        const processed = RecurringManager.processRecurringItems([editedTemplate]);
        
        assert(
            processed[0].nextOccurrence === editedTemplate.nextOccurrence,
            'Manual edit should be preserved'
        );
        console.log(`   ✓ Manual edit preserved: ${editedTemplate.nextOccurrence}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Integration Test Results: ${passedTests} passed, ${failedTests} failed`);
    console.log('='.repeat(60));

    return { passedTests, failedTests };
};

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
    runIntegrationTests();
}

export { runIntegrationTests };
