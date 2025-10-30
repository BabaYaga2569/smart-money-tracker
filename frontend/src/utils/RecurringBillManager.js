// RecurringBillManager.js - Automatic bill date calculations
import { parseLocalDate } from './DateUtils.js';
import { getPacificTime } from './DateUtils.js';

export class RecurringBillManager {
    
    /**
     * Calculate the next due date for a recurring bill
     * @param {Object} bill - Bill object with name, amount, lastDueDate, recurrence
     * @param {Date} currentDate - Current date (defaults to today)
     * @returns {Date} Next due date for the bill
     */
    static getNextDueDate(bill, currentDate = new Date()) {
        if (!bill.recurrence || bill.recurrence === 'one-time') {
            return parseLocalDate(bill.dueDate);
        }

        const lastDue = parseLocalDate(bill.lastDueDate || bill.dueDate);
        
        if (!lastDue) {
            console.error('getNextDueDate: Failed to parse lastDueDate or dueDate', {
                lastDueDate: bill.lastDueDate,
                dueDate: bill.dueDate
            });
            return new Date();
        }
        
        let nextDue;

        switch (bill.recurrence) {
            case 'monthly':
                nextDue = this.calculateNextMonthlyDate(lastDue, currentDate);
                break;
            case 'weekly':
                nextDue = this.calculateNextWeeklyDate(lastDue, currentDate);
                break;
            case 'bi-weekly':
                nextDue = this.calculateNextBiWeeklyDate(lastDue, currentDate);
                break;
            case 'quarterly':
                nextDue = this.calculateNextQuarterlyDate(lastDue, currentDate);
                break;
            case 'annually':
                nextDue = this.calculateNextAnnualDate(lastDue, currentDate);
                break;
            default:
                nextDue = parseLocalDate(bill.dueDate);
        }

        return nextDue || new Date();
    }

    /**
     * Calculate next monthly due date (handles month-end dates properly)
     */
    static calculateNextMonthlyDate(lastDue, currentDate) {
        if (!lastDue) {
            console.error('calculateNextMonthlyDate: lastDue is null');
            return new Date();
        }
        
        let nextDue = new Date(lastDue);
        const dayOfMonth = lastDue.getDate();

        while (nextDue <= currentDate) {
            nextDue.setMonth(nextDue.getMonth() + 1);
            
            if (dayOfMonth > 28) {
                const lastDayOfMonth = new Date(nextDue.getFullYear(), nextDue.getMonth() + 1, 0).getDate();
                nextDue.setDate(Math.min(dayOfMonth, lastDayOfMonth));
            }
        }

        return nextDue;
    }

    /**
     * Calculate next weekly due date
     */
    static calculateNextWeeklyDate(lastDue, currentDate) {
        if (!lastDue) {
            console.error('calculateNextWeeklyDate: lastDue is null');
            return new Date();
        }
        
        let nextDue = new Date(lastDue);
        
        while (nextDue <= currentDate) {
            nextDue.setDate(nextDue.getDate() + 7);
        }
        
        return nextDue;
    }

    /**
     * Calculate next bi-weekly due date
     */
    static calculateNextBiWeeklyDate(lastDue, currentDate) {
        if (!lastDue) {
            console.error('calculateNextBiWeeklyDate: lastDue is null');
            return new Date();
        }
        
        let nextDue = new Date(lastDue);
        
        while (nextDue <= currentDate) {
            nextDue.setDate(nextDue.getDate() + 14);
        }
        
        return nextDue;
    }

    /**
     * Calculate next quarterly due date
     */
    static calculateNextQuarterlyDate(lastDue, currentDate) {
        if (!lastDue) {
            console.error('calculateNextQuarterlyDate: lastDue is null');
            return new Date();
        }
        
        let nextDue = new Date(lastDue);
        const dayOfMonth = lastDue.getDate();

        while (nextDue <= currentDate) {
            nextDue.setMonth(nextDue.getMonth() + 3);
            
            if (dayOfMonth > 28) {
                const lastDayOfMonth = new Date(nextDue.getFullYear(), nextDue.getMonth() + 1, 0).getDate();
                nextDue.setDate(Math.min(dayOfMonth, lastDayOfMonth));
            }
        }

        return nextDue;
    }

    /**
     * Calculate next annual due date
     */
    static calculateNextAnnualDate(lastDue, currentDate) {
        if (!lastDue) {
            console.error('calculateNextAnnualDate: lastDue is null');
            return new Date();
        }
        
        let nextDue = new Date(lastDue);
        
        while (nextDue <= currentDate) {
            nextDue.setFullYear(nextDue.getFullYear() + 1);
        }
        
        return nextDue;
    }

    /**
     * Process a list of bills and return them with calculated next due dates
     * @param {Array} bills - Array of bill objects
     * @param {Date} currentDate - Current date (defaults to today)
     * @returns {Array} Bills with nextDueDate calculated
     */
    static processBills(bills, currentDate = new Date()) {
        return bills.map(bill => {
            const nextDueDate = this.getNextDueDate(bill, currentDate);
            
            // CRITICAL FIX: Don't reset isPaid status - preserve it if bill was paid
            const wasPaid = this.isBillPaidForCurrentCycle(bill);
            
            return {
                ...bill,
                nextDueDate: nextDueDate,
                originalDueDate: bill.dueDate,
                isPaid: wasPaid,
                status: bill.status === 'skipped' ? 'skipped' : undefined
            };
        });
    }

    /**
     * Filter bills that are due before a specific date
     * @param {Array} bills - Array of processed bills (with nextDueDate)
     * @param {Date} beforeDate - Filter bills due before this date
     * @returns {Array} Filtered bills
     */
    static getBillsDueBefore(bills, beforeDate) {
        return bills.filter(bill => {
            if (this.isBillPaidForCurrentCycle(bill)) {
                return false;
            }
            
            const dueDateValue = bill.nextDueDate || bill.dueDate;
            const dueDate = typeof dueDateValue === 'string' ? parseLocalDate(dueDateValue) : dueDateValue;
            
            return dueDate && dueDate <= beforeDate;
        });
    }

    /**
     * Get bills due within a date range
     * @param {Array} bills - Array of processed bills
     * @param {Date} startDate - Start of range
     * @param {Date} endDate - End of range
     * @returns {Array} Bills due within the range
     */
    static getBillsInRange(bills, startDate, endDate) {
        return bills.filter(bill => {
            if (this.isBillPaidForCurrentCycle(bill)) {
                return false;
            }
            
            const dueDateValue = bill.nextDueDate || bill.dueDate;
            const dueDate = typeof dueDateValue === 'string' ? parseLocalDate(dueDateValue) : dueDateValue;
            
            return dueDate && dueDate >= startDate && dueDate <= endDate;
        });
    }

    /**
     * Calculate total amount of bills due within a date range
     * @param {Array} bills - Array of processed bills
     * @param {Date} startDate - Start of range
     * @param {Date} endDate - End of range
     * @returns {Number} Total amount
     */
    static getTotalAmountInRange(bills, startDate, endDate) {
        const billsInRange = this.getBillsInRange(bills, startDate, endDate);
        return billsInRange.reduce((total, bill) => total + parseFloat(bill.amount || 0), 0);
    }

    /**
     * Mark a bill as paid and update its next due date for the upcoming cycle
     * @param {Object} bill - Bill object
     * @param {Date} paymentDate - Date the bill was paid
     * @param {Object} paymentOptions - Additional payment options (source, transactionId, etc.)
     * @returns {Object} Updated bill object with status='paid' and payment history
     */
    static markBillAsPaid(bill, paymentDate = null, paymentOptions = {}) {
        const currentDueDate = bill.nextDueDate || bill.dueDate;
        const paidDate = paymentDate || getPacificTime();
        
        const tempBill = {
            ...bill,
            lastDueDate: currentDueDate,
            dueDate: currentDueDate
        };
        
        // CRITICAL FIX: Always advance from the bill's due date, not the payment date
        const currentDueDateObj = parseLocalDate(currentDueDate);
        const nextDueDate = this.getNextDueDate(tempBill, currentDueDateObj);
        
        const paymentRecord = {
            amount: parseFloat(bill.amount) || 0,
            paidDate: paidDate,
            dueDate: currentDueDate,
            paymentMethod: paymentOptions.method || 'manual',
            source: paymentOptions.source || 'manual',
            transactionId: paymentOptions.transactionId || null,
            accountId: paymentOptions.accountId || null,
            timestamp: Date.now()
        };
        
        return {
            ...bill,
            lastDueDate: currentDueDate,
            lastPaidDate: paidDate,
            nextDueDate: nextDueDate,
            dueDate: nextDueDate,
            isPaid: true,
            status: 'paid',
            paymentHistory: [...(bill.paymentHistory || []), paymentRecord],
            lastPayment: paymentRecord
        };
    }

   /**
 * Check if a bill has already been paid for its current billing cycle
 * @param {Object} bill - Bill object
 * @returns {boolean} True if bill is paid for current cycle
 */
static isBillPaidForCurrentCycle(bill) {
    if (bill.lastPaidDate && bill.lastPayment) {
        // Use parseLocalDate to handle Firebase Timestamps properly
        const lastPaymentDueDate = parseLocalDate(bill.lastPayment.dueDate);
        
        if (bill.lastDueDate) {
            const lastDueDateValue = parseLocalDate(bill.lastDueDate);
            
            if (!lastPaymentDueDate || !lastDueDateValue) {
                return false;
            }
            
            // Compare just the date part (ignore time)
            return lastPaymentDueDate.toDateString() === lastDueDateValue.toDateString();
        }
        
        const currentDueDate = parseLocalDate(bill.nextDueDate || bill.dueDate);
        
        if (!lastPaymentDueDate || !currentDueDate) {
            return false;
        }
        
        return lastPaymentDueDate.toDateString() === currentDueDate.toDateString();
    }
    
    return false;
}

    /**
     * Check if a bill can be paid (not already paid by another transaction)
     * @param {Object} bill - Bill object
     * @returns {Object} { canPay: boolean, reason: string }
     */
    static canPayBill(bill) {
        if (this.isBillPaidForCurrentCycle(bill)) {
            const lastPayment = bill.lastPayment;
            const source = lastPayment?.source || 'manual';
            const method = lastPayment?.paymentMethod || 'unknown';
            
            return {
                canPay: false,
                reason: `Already paid for this billing cycle via ${source} (${method})`,
                lastPayment: lastPayment
            };
        }
        
        return { canPay: true, reason: null };
    }

    /**
     * Check if a transaction has already been used to pay a bill
     * @param {string} transactionId - Transaction ID to check
     * @param {Array} bills - Array of bills to check against
     * @returns {Object|null} The bill that was paid by this transaction, or null
     */
    static findBillPaidByTransaction(transactionId, bills) {
        if (!transactionId) return null;
        
        return bills.find(bill => {
            const paymentHistory = bill.paymentHistory || [];
            return paymentHistory.some(payment => 
                payment.transactionId === transactionId
            );
        });
    }

    /**
     * Generate a bill schedule for multiple months ahead
     * @param {Object} bill - Bill object
     * @param {Number} monthsAhead - Number of months to generate
     * @param {Date} startDate - Starting date (defaults to today)
     * @returns {Array} Array of future due dates
     */
    static generateSchedule(bill, monthsAhead = 6, startDate = new Date()) {
        const schedule = [];
        let currentBill = { ...bill };
        
        for (let i = 0; i < monthsAhead; i++) {
            const nextDue = this.getNextDueDate(currentBill, startDate);
            schedule.push({
                date: nextDue,
                amount: bill.amount,
                name: bill.name
            });
            
            currentBill.lastDueDate = nextDue;
            startDate = nextDue;
        }
        
        return schedule;
    }

    /**
     * Generate bill instances from a recurring template
     * @param {Object} recurringTemplate - Recurring template object
     * @param {Number} monthsAhead - Number of months to generate bills for (default: 3)
     * @param {Function} generateBillId - Function to generate unique bill IDs
     * @returns {Array} Array of bill instances
     */
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
        
        const activeMonths = recurringTemplate.activeMonths || null;
        const hasCustomRecurrence = activeMonths && Array.isArray(activeMonths) && activeMonths.length > 0;
        
        const baseBill = {
            name: recurringTemplate.name,
            amount: parseFloat(recurringTemplate.amount) || 0,
            category: recurringTemplate.category || 'Bills & Utilities',
            recurrence: recurrence,
            dueDate: recurringTemplate.nextOccurrence || new Date().toISOString().split('T')[0],
            status: 'pending',
            recurringTemplateId: recurringTemplate.id,
            autopay: recurringTemplate.autoPay || false,
            account: recurringTemplate.linkedAccount || '',
            originalDueDate: recurringTemplate.nextOccurrence || new Date().toISOString().split('T')[0]
        };

        let currentBill = { ...baseBill };
        
        for (let i = 0; i < monthsAhead; i++) {
            const nextDueDate = this.getNextDueDate(currentBill, i === 0 ? today : new Date(currentBill.dueDate));
            
            if (nextDueDate >= today) {
                const billMonth = nextDueDate.getMonth();
                const isMonthActive = !hasCustomRecurrence || activeMonths.includes(billMonth);
                
                if (isMonthActive) {
                    const billInstance = {
                        ...baseBill,
                        id: generateBillId ? generateBillId() : `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        dueDate: nextDueDate.toISOString().split('T')[0],
                        originalDueDate: nextDueDate.toISOString().split('T')[0],
                        lastDueDate: currentBill.dueDate
                    };
                    
                    bills.push(billInstance);
                }
            }
            
            currentBill = {
                ...currentBill,
                dueDate: nextDueDate.toISOString().split('T')[0],
                lastDueDate: nextDueDate.toISOString().split('T')[0]
            };
        }

        return bills;
    }

    /**
     * Sync bill instances when a recurring template is updated
     * @param {Object} updatedTemplate - Updated recurring template object
     * @param {Array} existingBills - Current array of all bills
     * @param {Number} monthsAhead - Number of months to generate bills for (default: 3)
     * @param {Function} generateBillId - Function to generate unique bill IDs
     * @returns {Object} { updatedBills: Array, stats: Object }
     */
    static syncBillsWithTemplate(updatedTemplate, existingBills, monthsAhead = 3, generateBillId) {
        if (!updatedTemplate || !updatedTemplate.id) {
            throw new Error('Valid recurring template with ID is required');
        }

        const templateId = updatedTemplate.id;
        const stats = {
            added: 0,
            removed: 0,
            updated: 0,
            preserved: 0
        };

        const billsFromTemplate = existingBills.filter(bill => 
            bill.recurringTemplateId === templateId
        );
        const otherBills = existingBills.filter(bill => 
            bill.recurringTemplateId !== templateId
        );

        const desiredBills = this.generateBillsFromTemplate(updatedTemplate, monthsAhead, generateBillId);
        
        const desiredBillsByDate = new Map();
        desiredBills.forEach(bill => {
            desiredBillsByDate.set(bill.dueDate, bill);
        });

        const updatedBillsFromTemplate = [];
        
        billsFromTemplate.forEach(existingBill => {
            const isPaid = existingBill.status === 'paid' || this.isBillPaidForCurrentCycle(existingBill);
            const dueDate = existingBill.dueDate;
            
            if (isPaid) {
                updatedBillsFromTemplate.push(existingBill);
                stats.preserved++;
            } else if (desiredBillsByDate.has(dueDate)) {
                const desiredBill = desiredBillsByDate.get(dueDate);
                updatedBillsFromTemplate.push({
                    ...existingBill,
                    name: desiredBill.name,
                    amount: desiredBill.amount,
                    category: desiredBill.category,
                    autopay: desiredBill.autopay,
                    account: desiredBill.account,
                    recurrence: desiredBill.recurrence
                });
                stats.updated++;
                desiredBillsByDate.delete(dueDate);
            } else {
                stats.removed++;
            }
        });

        desiredBillsByDate.forEach(desiredBill => {
            updatedBillsFromTemplate.push(desiredBill);
            stats.added++;
        });

        const allUpdatedBills = [...otherBills, ...updatedBillsFromTemplate];

        return {
            updatedBills: allUpdatedBills,
            stats
        };
    }
}
