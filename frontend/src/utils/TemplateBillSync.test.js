// Test suite for Template Bill Sync feature
import { RecurringBillManager } from './RecurringBillManager.js';

/**
 * Test the syncBillsWithTemplate function
 */
function testSyncBillsWithTemplate() {
    console.log('\n=== Testing syncBillsWithTemplate ===\n');
    
    const generateBillId = () => `test_bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Test 1: New template generates bills
    console.log('Test 1: New template generates bills');
    const newTemplate = {
        id: 'template_1',
        name: 'Netflix',
        amount: 15.99,
        category: 'Subscriptions',
        frequency: 'monthly',
        nextOccurrence: '2025-11-01',
        status: 'active',
        type: 'expense'
    };
    
    const result1 = RecurringBillManager.syncBillsWithTemplate(newTemplate, [], 3, generateBillId);
    console.log(`✓ Generated ${result1.stats.added} bills for new template`);
    console.log(`  Stats: added=${result1.stats.added}, removed=${result1.stats.removed}, updated=${result1.stats.updated}, preserved=${result1.stats.preserved}`);
    
    // Test 2: Updating template amount updates unpaid bills
    console.log('\nTest 2: Updating template amount updates unpaid bills');
    const updatedTemplate = {
        ...newTemplate,
        amount: 17.99 // Price increase
    };
    
    const existingBills = result1.updatedBills;
    const result2 = RecurringBillManager.syncBillsWithTemplate(updatedTemplate, existingBills, 3, generateBillId);
    console.log(`✓ Updated ${result2.stats.updated} bills with new amount`);
    console.log(`  Stats: added=${result2.stats.added}, removed=${result2.stats.removed}, updated=${result2.stats.updated}, preserved=${result2.stats.preserved}`);
    
    // Verify amount changed
    const updatedBill = result2.updatedBills.find(b => b.recurringTemplateId === 'template_1');
    if (updatedBill && updatedBill.amount === 17.99) {
        console.log('✓ Bill amount correctly updated to 17.99');
    } else {
        console.error('✗ Bill amount not updated correctly');
    }
    
    // Test 3: Paid bills are preserved
    console.log('\nTest 3: Paid bills are preserved when template changes');
    const billsWithPaid = result2.updatedBills.map((bill, index) => {
        if (index === 0) {
            // Mark first bill as paid
            return {
                ...bill,
                status: 'paid',
                lastPaidDate: '2025-11-05'
            };
        }
        return bill;
    });
    
    const templateWithNewAmount = {
        ...updatedTemplate,
        amount: 19.99 // Another price increase
    };
    
    const result3 = RecurringBillManager.syncBillsWithTemplate(templateWithNewAmount, billsWithPaid, 3, generateBillId);
    console.log(`✓ Preserved ${result3.stats.preserved} paid bills`);
    console.log(`  Updated ${result3.stats.updated} unpaid bills`);
    
    // Verify paid bill keeps old amount
    const paidBill = result3.updatedBills.find(b => b.status === 'paid');
    if (paidBill && paidBill.amount === 17.99) {
        console.log('✓ Paid bill preserved with original amount (17.99)');
    } else {
        console.error('✗ Paid bill not preserved correctly');
    }
    
    // Test 4: Custom recurrence - selecting/unselecting months
    console.log('\nTest 4: Custom recurrence - selecting/unselecting months');
    const templateWithMonths = {
        id: 'template_2',
        name: 'Sports Tickets',
        amount: 500,
        category: 'Entertainment',
        frequency: 'monthly',
        nextOccurrence: '2025-11-01',
        status: 'active',
        type: 'expense',
        customRecurrence: true,
        activeMonths: [10, 11, 0] // Nov, Dec, Jan only
    };
    
    // Generate initial bills
    const result4 = RecurringBillManager.syncBillsWithTemplate(templateWithMonths, [], 5, generateBillId);
    console.log(`✓ Generated ${result4.stats.added} bills for selected months only`);
    
    // Now add more months
    const expandedTemplate = {
        ...templateWithMonths,
        activeMonths: [10, 11, 0, 1, 2] // Added Feb and Mar
    };
    
    const result5 = RecurringBillManager.syncBillsWithTemplate(expandedTemplate, result4.updatedBills, 5, generateBillId);
    console.log(`✓ Added ${result5.stats.added} bills for newly selected months`);
    console.log(`  Updated ${result5.stats.updated} existing bills`);
    
    // Now remove some months
    const reducedTemplate = {
        ...templateWithMonths,
        activeMonths: [10, 11] // Removed Jan, Feb, Mar
    };
    
    const result6 = RecurringBillManager.syncBillsWithTemplate(reducedTemplate, result5.updatedBills, 5, generateBillId);
    console.log(`✓ Removed ${result6.stats.removed} bills for unselected months`);
    console.log(`  Preserved ${result6.stats.preserved} paid bills (if any)`);
    
    // Test 5: Multiple templates don't interfere
    console.log('\nTest 5: Multiple templates don\'t interfere with each other');
    const template1Bills = result2.updatedBills;
    const template2Bills = result6.updatedBills;
    const allBills = [...template1Bills, ...template2Bills];
    
    console.log(`  Total bills before sync: ${allBills.length}`);
    console.log(`  Template 1 bills: ${allBills.filter(b => b.recurringTemplateId === 'template_1').length}`);
    console.log(`  Template 2 bills: ${allBills.filter(b => b.recurringTemplateId === 'template_2').length}`);
    
    // Update template 1
    const finalTemplate1 = {
        ...newTemplate,
        amount: 20.99
    };
    
    const result7 = RecurringBillManager.syncBillsWithTemplate(finalTemplate1, allBills, 3, generateBillId);
    console.log(`✓ Updated template 1 bills without affecting template 2`);
    console.log(`  Total bills after sync: ${result7.updatedBills.length}`);
    console.log(`  Template 1 bills: ${result7.updatedBills.filter(b => b.recurringTemplateId === 'template_1').length}`);
    console.log(`  Template 2 bills: ${result7.updatedBills.filter(b => b.recurringTemplateId === 'template_2').length}`);
    
    console.log('\n=== All tests passed! ===\n');
}

// Run tests if executed directly
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    testSyncBillsWithTemplate();
}

export { testSyncBillsWithTemplate };
