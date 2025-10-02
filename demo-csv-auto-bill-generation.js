/**
 * Demo Script: CSV Auto-Bill Generation Feature
 * 
 * This script demonstrates the automatic bill generation from CSV import feature.
 * It simulates the workflow of importing recurring templates and automatically
 * generating bill instances.
 */

// Mock the RecurringBillManager for demonstration
class MockRecurringBillManager {
  static generateBillsFromTemplate(recurringTemplate, monthsAhead = 3, generateBillId) {
    if (!recurringTemplate || !recurringTemplate.id) {
      throw new Error('Valid recurring template with ID is required');
    }

    const bills = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const frequencyMap = {
      'weekly': 'weekly',
      'bi-weekly': 'bi-weekly',
      'monthly': 'monthly',
      'quarterly': 'quarterly',
      'annually': 'annually'
    };

    const recurrence = frequencyMap[recurringTemplate.frequency] || 'monthly';
    
    // Generate bills based on frequency
    for (let i = 0; i < monthsAhead; i++) {
      const dueDate = new Date(recurringTemplate.nextOccurrence);
      
      // Calculate next occurrence based on frequency
      if (recurrence === 'monthly') {
        dueDate.setMonth(dueDate.getMonth() + i);
      } else if (recurrence === 'weekly') {
        dueDate.setDate(dueDate.getDate() + (i * 7));
      } else if (recurrence === 'bi-weekly') {
        dueDate.setDate(dueDate.getDate() + (i * 14));
      } else if (recurrence === 'quarterly') {
        dueDate.setMonth(dueDate.getMonth() + (i * 3));
      } else if (recurrence === 'annually') {
        dueDate.setFullYear(dueDate.getFullYear() + i);
      }
      
      // Only create bills for future dates
      if (dueDate >= today) {
        const billInstance = {
          id: generateBillId ? generateBillId() : `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: recurringTemplate.name,
          amount: parseFloat(recurringTemplate.amount) || 0,
          category: recurringTemplate.category || 'Bills & Utilities',
          recurrence: recurrence,
          dueDate: dueDate.toISOString().split('T')[0],
          status: 'pending',
          recurringTemplateId: recurringTemplate.id,
          autopay: recurringTemplate.autoPay || false,
          account: recurringTemplate.linkedAccount || '',
          originalDueDate: recurringTemplate.nextOccurrence || dueDate.toISOString().split('T')[0]
        };
        
        bills.push(billInstance);
      }
    }

    return bills;
  }
}

// Demo data: Simulated CSV import
const csvImportedTemplates = [
  {
    id: 'template_csv_1',
    name: 'Electric Bill',
    amount: 120.50,
    category: 'Bills & Utilities',
    frequency: 'monthly',
    nextOccurrence: '2025-11-15',
    autoPay: false,
    linkedAccount: 'bofa',
    status: 'active',
    type: 'expense'
  },
  {
    id: 'template_csv_2',
    name: 'Internet Service',
    amount: 79.99,
    category: 'Bills & Utilities',
    frequency: 'monthly',
    nextOccurrence: '2025-11-01',
    autoPay: true,
    linkedAccount: 'bofa',
    status: 'active',
    type: 'expense'
  },
  {
    id: 'template_csv_3',
    name: 'Netflix Subscription',
    amount: 15.99,
    category: 'Subscriptions',
    frequency: 'monthly',
    nextOccurrence: '2025-11-05',
    autoPay: true,
    linkedAccount: 'bofa',
    status: 'active',
    type: 'expense'
  },
  {
    id: 'template_csv_4',
    name: 'Car Insurance',
    amount: 125.00,
    category: 'Insurance',
    frequency: 'monthly',
    nextOccurrence: '2025-11-10',
    autoPay: true,
    linkedAccount: 'usaa',
    status: 'active',
    type: 'expense'
  },
  {
    id: 'template_csv_5',
    name: 'Phone Bill',
    amount: 45.00,
    category: 'Bills & Utilities',
    frequency: 'monthly',
    nextOccurrence: '2025-11-08',
    autoPay: false,
    linkedAccount: 'bofa',
    status: 'active',
    type: 'expense'
  },
  {
    id: 'template_csv_6',
    name: 'Monthly Salary',
    amount: 5000.00,
    category: 'Income',
    frequency: 'monthly',
    nextOccurrence: '2025-11-01',
    autoPay: false,
    linkedAccount: 'bofa',
    status: 'active',
    type: 'income'
  },
  {
    id: 'template_csv_7',
    name: 'Paused Subscription',
    amount: 9.99,
    category: 'Subscriptions',
    frequency: 'monthly',
    nextOccurrence: '2025-11-10',
    autoPay: false,
    linkedAccount: 'bofa',
    status: 'paused',
    type: 'expense'
  }
];

// Simulate the CSV import workflow
console.log('='.repeat(80));
console.log('CSV AUTO-BILL GENERATION DEMO');
console.log('='.repeat(80));
console.log();

console.log('📄 Step 1: CSV Upload Simulation');
console.log('-'.repeat(80));
console.log(`Uploaded CSV with ${csvImportedTemplates.length} recurring templates:`);
csvImportedTemplates.forEach((template, idx) => {
  console.log(`  ${idx + 1}. ${template.name} ($${template.amount}) - ${template.status} ${template.type}`);
});
console.log();

console.log('✅ Step 2: Recurring Templates Imported');
console.log('-'.repeat(80));
console.log(`Successfully saved ${csvImportedTemplates.length} recurring templates to database`);
console.log();

console.log('🔄 Step 3: Auto-Generating Bills');
console.log('-'.repeat(80));
console.log('[CSV Import] Auto-generating bills from imported recurring templates...');
console.log();

// Filter for active expense templates (matching the actual implementation)
const activeExpenses = csvImportedTemplates.filter(item => 
  item.status === 'active' && item.type === 'expense'
);

console.log(`Found ${activeExpenses.length} active expense templates (filtered out income and inactive items)`);
console.log();

// Generate bills
const generateBillId = () => `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const allGeneratedBills = [];
const existingBills = []; // Simulating empty Bills Management page

activeExpenses.forEach(template => {
  try {
    console.log(`  Processing: ${template.name}`);
    
    // Generate 3 months of bills from each template
    const generatedBills = MockRecurringBillManager.generateBillsFromTemplate(template, 3, generateBillId);
    console.log(`    Generated ${generatedBills.length} bill instances`);
    
    // Filter out duplicates
    const uniqueBills = generatedBills.filter(newBill => {
      return !existingBills.some(existingBill => 
        existingBill.recurringTemplateId === newBill.recurringTemplateId &&
        existingBill.dueDate === newBill.dueDate
      );
    });
    
    if (uniqueBills.length < generatedBills.length) {
      console.log(`    Filtered out ${generatedBills.length - uniqueBills.length} duplicate(s)`);
    }
    
    allGeneratedBills.push(...uniqueBills);
    
    // Show bill details
    uniqueBills.forEach(bill => {
      console.log(`      - Due: ${bill.dueDate}, Amount: $${bill.amount}, ID: ${bill.id}`);
    });
    
    console.log();
  } catch (error) {
    console.error(`  ❌ Error generating bills from template ${template.name}:`, error.message);
  }
});

console.log('✨ Step 4: Bills Saved to Database');
console.log('-'.repeat(80));
console.log(`Successfully saved ${allGeneratedBills.length} bill instances to Bills Management`);
console.log();

console.log('📊 Step 5: User Notification');
console.log('-'.repeat(80));
const message = `Successfully imported ${activeExpenses.length} recurring items. Auto-generated ${allGeneratedBills.length} bill instance(s) for Bills Management.`;
console.log(`✅ ${message}`);
console.log();

console.log('📋 Summary Report');
console.log('='.repeat(80));
console.log(`Total Templates Imported: ${csvImportedTemplates.length}`);
console.log(`  - Active Expenses: ${activeExpenses.length}`);
console.log(`  - Income Items: ${csvImportedTemplates.filter(t => t.type === 'income').length}`);
console.log(`  - Inactive Items: ${csvImportedTemplates.filter(t => t.status !== 'active').length}`);
console.log();
console.log(`Total Bills Generated: ${allGeneratedBills.length}`);
console.log(`  - Unique Bills Created: ${allGeneratedBills.length}`);
console.log(`  - Duplicates Prevented: 0`);
console.log();

console.log('🔍 Bill Details by Template');
console.log('-'.repeat(80));
activeExpenses.forEach(template => {
  const templateBills = allGeneratedBills.filter(b => b.recurringTemplateId === template.id);
  console.log(`\n${template.name} (${template.id}):`);
  console.log(`  Frequency: ${template.frequency}`);
  console.log(`  Amount: $${template.amount}`);
  console.log(`  Bills Generated: ${templateBills.length}`);
  templateBills.forEach((bill, idx) => {
    console.log(`    ${idx + 1}. Due ${bill.dueDate} - $${bill.amount} - ${bill.status}`);
  });
});

console.log();
console.log('='.repeat(80));
console.log('DEMO COMPLETE');
console.log('='.repeat(80));
console.log();
console.log('✅ Feature Benefits:');
console.log('  1. One-step process - upload CSV and bills are ready');
console.log('  2. No manual "Generate Bills" button needed');
console.log('  3. Clear feedback on what was created');
console.log('  4. Duplicate prevention ensures data integrity');
console.log('  5. Audit trail in console logs');
console.log();
console.log('📚 See AUTO_BILL_GENERATION_FROM_CSV.md for complete documentation');
console.log();
