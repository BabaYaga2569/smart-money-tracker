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
        return bills.map(bill => ({
            ...bill,
            nextDueDate: this.getNextDueDate(bill, currentDate),
            // Keep original dueDate for reference
            originalDueDate: bill.dueDate
        }));
    }

    /**
     * Filter bills that are due before a specific date
     * @param {Array} bills - Array of processed bills (with nextDueDate)
     * @param {Date} beforeDate - Filter bills due before this date
     * @returns {Array} Filtered bills
     */
    static getBillsDueBefore(bills, beforeDate) {
        return bills.filter(bill => {
            // Skip bills that are marked as paid
            if (bill.isPaid || bill.status === 'paid') {
                return false;
            }
            
            const dueDate = bill.nextDueDate || parseLocalDate(bill.dueDate);
            
            // Check if bill is due before the given date
            if (dueDate >= beforeDate) {
                return false;
            }
            
            // Enhanced payment check: If bill was recently paid for the current billing cycle,
            // exclude it from bills due before payday
            if (bill.lastPaidDate && bill.lastPayment) {
                const lastPaidDate = new Date(bill.lastPaidDate);
                const lastPaymentDueDate = new Date(bill.lastPayment.dueDate);
                const currentBillDueDate = new Date(dueDate);
                
                // If the last payment was for a due date that matches or is after the current due date,
                // then this bill has already been paid for the current cycle
                if (lastPaymentDueDate.getTime() >= currentBillDueDate.getTime()) {
                    return false;
                }
                
                // Fallback: If paid within last 7 days, also exclude
                const daysSincePaid = (Date.now() - lastPaidDate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSincePaid <= 7) {
                    return false;
                }
            }
            
            return true;
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
            // Skip bills that are marked as paid
            if (bill.isPaid || bill.status === 'paid') {
                return false;
            }
            
            const dueDate = bill.nextDueDate || parseLocalDate(bill.dueDate);
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
     * @returns {Object} Updated bill object
     */
    static markBillAsPaid(bill, paymentDate = null) {
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
            paymentMethod: 'manual',
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
}