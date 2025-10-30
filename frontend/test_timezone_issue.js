import { RecurringBillManager } from './src/utils/RecurringBillManager.js';
import { parseLocalDate } from './src/utils/DateUtils.js';

console.log('🧪 Testing timezone issue with bills due on payday...\n');

// Simulate the exact scenario from the problem statement
const payday = new Date('2025-10-30'); // This might be interpreted as midnight UTC
console.log('Payday Date:', payday);
console.log('Payday ISO:', payday.toISOString());
console.log('Payday time:', payday.getTime());

const bills = [
    {
        name: 'Food',
        amount: '800',
        dueDate: '2025-10-30',
        nextDueDate: '2025-10-30',
        recurrence: 'monthly',
        status: 'pending'
    },
    {
        name: 'Rent',
        amount: '350',
        dueDate: '2025-10-30',
        nextDueDate: '2025-10-30',
        recurrence: 'monthly',
        status: 'pending'
    },
    {
        name: 'Southwest Gas',
        amount: '23.43',
        dueDate: '2025-10-29',
        nextDueDate: '2025-10-29',
        recurrence: 'monthly',
        status: 'pending'
    }
];

// Parse bill dates and log them
bills.forEach(bill => {
    const parsedDate = parseLocalDate(bill.dueDate);
    console.log(`\n${bill.name}:`);
    console.log('  Due Date String:', bill.dueDate);
    console.log('  Parsed Date:', parsedDate);
    console.log('  Parsed ISO:', parsedDate.toISOString());
    console.log('  Parsed time:', parsedDate.getTime());
    console.log('  Compare with payday:', parsedDate.getTime(), '<=', payday.getTime(), '=', parsedDate.getTime() <= payday.getTime());
});

console.log('\n--- Running getBillsDueBefore ---');
const billsDue = RecurringBillManager.getBillsDueBefore(bills, payday);

console.log('\nBills Due Before Payday:');
billsDue.forEach(bill => {
    console.log(`  - ${bill.name}: $${bill.amount} (due ${bill.dueDate})`);
});

console.log('\nTotal bills found:', billsDue.length);
console.log('Expected:', 3, '(Food, Rent, Southwest Gas)');

if (billsDue.length === 3) {
    console.log('✅ Test PASSED - All bills including those on payday are included');
} else {
    console.log('❌ Test FAILED - Bills due on payday are missing!');
    process.exit(1);
}
