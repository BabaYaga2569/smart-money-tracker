import { RecurringBillManager } from './src/utils/RecurringBillManager.js';
import { parseLocalDate } from './src/utils/DateUtils.js';

console.log('🧪 Testing Pacific timezone scenario...\n');

// Simulate a date created at a specific time in Pacific timezone
// When user is in Pacific timezone and creates a date for "today" at 1:32 PM Pacific
// That's 2025-10-30 13:32:34 Pacific = 2025-10-30 20:32:34 UTC
const paydayPacificTime = new Date('2025-10-30T20:32:34.000Z'); // 1:32 PM Pacific = 8:32 PM UTC (PDT is UTC-7)

console.log('Payday (as created in Pacific timezone at 1:32 PM):');
console.log('  ISO:', paydayPacificTime.toISOString());
console.log('  time:', paydayPacificTime.getTime());

// Bills parsed from string dates will be at local midnight
// In Pacific timezone, midnight is 00:00:00-07:00 which is 07:00:00 UTC
const billsWithPacificMidnight = [
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
    }
];

// parseLocalDate creates dates at midnight in system local time
// In UTC, that's midnight UTC, but if the system were Pacific, it would be 7 hours later in UTC
billsWithPacificMidnight.forEach(bill => {
    const parsedDate = parseLocalDate(bill.dueDate);
    console.log(`\n${bill.name}:`);
    console.log('  Due Date String:', bill.dueDate);
    console.log('  Parsed ISO:', parsedDate.toISOString());
    console.log('  Parsed time:', parsedDate.getTime());
    console.log('  Compare:', parsedDate.getTime(), '<=', paydayPacificTime.getTime(), '=', parsedDate.getTime() <= paydayPacificTime.getTime());
});

// Let's manually simulate what happens when dates are interpreted differently
// If parseLocalDate creates 2025-10-30T00:00:00 in local (Pacific) time
// That would be stored as 2025-10-30T07:00:00Z in UTC
console.log('\n--- Simulating Pacific midnight as UTC ---');
const foodDatePacificMidnight = new Date('2025-10-30T07:00:00.000Z'); // Pacific midnight
const rentDatePacificMidnight = new Date('2025-10-30T07:00:00.000Z'); // Pacific midnight

console.log('\nFood bill due date (Pacific midnight):');
console.log('  ISO:', foodDatePacificMidnight.toISOString());
console.log('  time:', foodDatePacificMidnight.getTime());
console.log('  Compare with payday:', foodDatePacificMidnight.getTime(), '<=', paydayPacificTime.getTime(), '=', foodDatePacificMidnight.getTime() <= paydayPacificTime.getTime());

console.log('\n--- Testing with ACTUAL current time as payday ---');
// In reality, when user views spendability "today", the payday date might be created differently
// Let's test with a payday created at UTC midnight
const paydayUTCMidnight = new Date('2025-10-30T00:00:00.000Z');
console.log('Payday at UTC midnight:', paydayUTCMidnight.toISOString());
console.log('Food at Pacific midnight (UTC 7am):', foodDatePacificMidnight.toISOString());
console.log('Compare:', foodDatePacificMidnight.getTime(), '<=', paydayUTCMidnight.getTime(), '=', foodDatePacificMidnight.getTime() <= paydayUTCMidnight.getTime());

if (foodDatePacificMidnight.getTime() <= paydayUTCMidnight.getTime()) {
    console.log('✅ Bill would be included');
} else {
    console.log('❌ Bill would be EXCLUDED - This is the bug!');
}

console.log('\n--- Running actual getBillsDueBefore test ---');
const billsDue = RecurringBillManager.getBillsDueBefore(billsWithPacificMidnight, paydayUTCMidnight);
console.log('Bills returned:', billsDue.length);
billsDue.forEach(bill => {
    console.log(`  - ${bill.name}`);
});
