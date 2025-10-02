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
            return parseLocalDate(bill.dueDate); // Use local date parsing to prevent timezone shift
        }

        const lastDue = parseLocalDate(bill.lastDueDate || bill.dueDate);
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
                nextDue = parseLocalDate(bill.dueDate); // Use local date parsing for fallback
        }

        return nextDue;
    }

    /**
     * Calculate next monthly due date (handles month-end dates properly)
     */
    static calculateNextMonthlyDate(lastDue, currentDate) {
        let nextDue = new Date(lastDue);
        const dayOfMonth = lastDue.getDate();

        // Keep advancing monthly until we find a future date
        while (nextDue <= currentDate) {
            nextDue.setMonth(nextDue.getMonth() + 1);
            
            // Handle month-end dates (30th, 31st in shorter months)
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
        let nextDue = new Date(lastDue);
        
        // Keep adding weeks until we find a future date
        while (nextDue <= currentDate) {
            nextDue.setDate(nextDue.getDate() + 7);
        }
        
        return nextDue;
    }

    /**
     * Calculate next bi-weekly due date
     */
    static calculateNextBiWeeklyDate(lastDue, currentDate) {
        let nextDue = new Date(lastDue);
        
        // Keep adding 2 weeks until we find a future date
        while (nextDue <= currentDate) {
            nextDue.setDate(nextDue.getDate() + 14);
        }
        
        return nextDue;
    }

    /**
     * Calculate next quarterly due date
     */
    static calculateNextQuarterlyDate(lastDue, currentDate) {
        let nextDue = new Date(lastDue);
        const dayOfMonth = lastDue.getDate();

        // Keep advancing by quarters (3 months) until we find a future date
        while (nextDue <= currentDate) {
            nextDue.setMonth(nextDue.getMonth() + 3);
            
            // Handle month-end dates
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
        let nextDue = new Date(lastDue);
        
        // Keep adding years until we find a future date
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
            
            // Reset isPaid and status flags - they will be recalculated based on payment history
            // This ensures that when we advance to a new billing cycle, the bill shows as unpaid
            return {
                ...bill,
                nextDueDate: nextDueDate,
                // Keep original dueDate for reference
                originalDueDate: bill.dueDate,
                // Reset isPaid - will be recalculated by isBillPaidForCurrentCycle
                isPaid: false,
                // Reset status - will be recalculated by determineBillStatus
                status: undefined
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
            // Skip bills that are paid for the current cycle
            if (this.isBillPaidForCurrentCycle(bill)) {
                return false;
            }
            
            // Get the due date and ensure it's parsed as a Date object
            const dueDateValue = bill.nextDueDate || bill.dueDate;
            const dueDate = typeof dueDateValue === 'string' ? parseLocalDate(dueDateValue) : dueDateValue;
            
            // Check if bill is due before the given date
            return dueDate < beforeDate;
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
            // Skip bills that are paid for the current cycle
            if (this.isBillPaidForCurrentCycle(bill)) {
                return false;
            }
            
            // Get the due date and ensure it's parsed as a Date object
            const dueDateValue = bill.nextDueDate || bill.dueDate;
            const dueDate = typeof dueDateValue === 'string' ? parseLocalDate(dueDateValue) : dueDateValue;
            
            return dueDate >= startDate && dueDate <= endDate;
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
     * @returns {Object} Updated bill object
     */
    static markBillAsPaid(bill, paymentDate = null, paymentOptions = {}) {
        const currentDueDate = bill.nextDueDate || bill.dueDate;
        const paidDate = paymentDate || getPacificTime();
        
        // Create a temporary bill object with the current due date as last due date
        const tempBill = {
            ...bill,
            lastDueDate: currentDueDate,
            dueDate: currentDueDate
        };
        
        // Calculate the next due date for the upcoming billing cycle
        const nextDueDate = this.getNextDueDate(tempBill, paidDate);
        
        // Create payment record for history
        const paymentRecord = {
            amount: parseFloat(bill.amount) || 0,
            paidDate: paidDate,
            dueDate: currentDueDate,
            paymentMethod: paymentOptions.method || 'manual',
            source: paymentOptions.source || 'manual', // 'manual' or 'plaid'
            transactionId: paymentOptions.transactionId || null,
            accountId: paymentOptions.accountId || null,
            timestamp: Date.now()
        };
        
        // Mark as PAID for current cycle - bill stays paid until next due date
        return {
            ...bill,
            lastDueDate: currentDueDate,
            lastPaidDate: paidDate,
            nextDueDate: nextDueDate,
            dueDate: nextDueDate, // Update primary dueDate to next occurrence
            isPaid: true,         // KEEP AS TRUE - bill is paid for current cycle
            status: 'paid',       // KEEP AS PAID until next cycle
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
        // Check payment history for current cycle - this is the ONLY reliable way
        // Do NOT check bill.isPaid or bill.status directly as they persist from previous cycles
        if (bill.lastPaidDate && bill.lastPayment) {
            const currentBillDueDate = new Date(bill.nextDueDate || bill.dueDate);
            const lastPaymentDueDate = new Date(bill.lastPayment.dueDate);
            
            // If the last payment was for a due date that matches or is after the current due date,
            // then this bill has already been paid for the current cycle
            return lastPaymentDueDate.getTime() >= currentBillDueDate.getTime();
        }
        
        return false;
    }

    /**
     * Check if a bill can be paid (not already paid by another transaction)
     * @param {Object} bill - Bill object
     * @returns {Object} { canPay: boolean, reason: string }
     */
    static canPayBill(bill) {
        // Check if already paid for current cycle
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
            
            // Update for next iteration
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

        // Convert recurring template frequency to bill recurrence
        const frequencyMap = {
            'weekly': 'weekly',
            'bi-weekly': 'bi-weekly',
            'monthly': 'monthly',
            'quarterly': 'quarterly',
            'annually': 'annually'
        };

        const recurrence = frequencyMap[recurringTemplate.frequency] || 'monthly';
        
        // Get active months if custom recurrence is enabled
        const activeMonths = recurringTemplate.activeMonths || null;
        const hasCustomRecurrence = activeMonths && Array.isArray(activeMonths) && activeMonths.length > 0;
        
        // Create a base bill object from the template
        const baseBill = {
            name: recurringTemplate.name,
            amount: parseFloat(recurringTemplate.amount) || 0,
            category: recurringTemplate.category || 'Bills & Utilities',
            recurrence: recurrence,
            dueDate: recurringTemplate.nextOccurrence || new Date().toISOString().split('T')[0],
            status: 'pending',
            recurringTemplateId: recurringTemplate.id, // This is the key field for badge display
            autopay: recurringTemplate.autoPay || false,
            account: recurringTemplate.linkedAccount || '',
            originalDueDate: recurringTemplate.nextOccurrence || new Date().toISOString().split('T')[0]
        };

        // Generate bill instances for the specified number of months
        let currentBill = { ...baseBill };
        
        for (let i = 0; i < monthsAhead; i++) {
            const nextDueDate = this.getNextDueDate(currentBill, i === 0 ? today : new Date(currentBill.dueDate));
            
            // Only create bills for future dates
            if (nextDueDate >= today) {
                // Check if this month is active (for custom recurrence)
                const billMonth = nextDueDate.getMonth(); // 0-11 (Jan=0, Dec=11)
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
            
            // Update for next iteration
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
     * This handles:
     * - Generating new bills for newly selected months
     * - Removing unpaid bills for unselected months (preserving paid bills)
     * - Updating bill properties (amount, category, etc.) for existing unpaid bills
     * 
     * @param {Object} updatedTemplate - Updated recurring template object
     * @param {Array} existingBills - Current array of all bills
     * @param {Number} monthsAhead - Number of months to generate bills for (default: 3)
     * @param {Function} generateBillId - Function to generate unique bill IDs
     * @returns {Object} { updatedBills: Array, stats: Object } - Updated bills array and statistics
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

        // Separate bills into those from this template and others
        const billsFromTemplate = existingBills.filter(bill => 
            bill.recurringTemplateId === templateId
        );
        const otherBills = existingBills.filter(bill => 
            bill.recurringTemplateId !== templateId
        );

        // Generate the desired bill instances based on updated template
        const desiredBills = this.generateBillsFromTemplate(updatedTemplate, monthsAhead, generateBillId);
        
        // Create a map of desired bills by due date for easy lookup
        const desiredBillsByDate = new Map();
        desiredBills.forEach(bill => {
            desiredBillsByDate.set(bill.dueDate, bill);
        });

        // Process existing bills from this template
        const updatedBillsFromTemplate = [];
        
        billsFromTemplate.forEach(existingBill => {
            const isPaid = existingBill.status === 'paid' || this.isBillPaidForCurrentCycle(existingBill);
            const dueDate = existingBill.dueDate;
            
            if (isPaid) {
                // Always preserve paid bills for history
                updatedBillsFromTemplate.push(existingBill);
                stats.preserved++;
            } else if (desiredBillsByDate.has(dueDate)) {
                // Bill exists and should continue to exist - update its properties
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
                // Remove from desired map since we've handled it
                desiredBillsByDate.delete(dueDate);
            } else {
                // Bill exists but is no longer desired (month was unselected) - remove it
                stats.removed++;
                // Don't add to updatedBillsFromTemplate
            }
        });

        // Add any remaining desired bills that don't exist yet
        desiredBillsByDate.forEach(desiredBill => {
            updatedBillsFromTemplate.push(desiredBill);
            stats.added++;
        });

        // Combine with other bills
        const allUpdatedBills = [...otherBills, ...updatedBillsFromTemplate];

        return {
            updatedBills: allUpdatedBills,
            stats
        };
    }
}