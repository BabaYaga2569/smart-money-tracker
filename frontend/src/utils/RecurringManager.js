// RecurringManager.js - Manage all recurring incomes, expenses, and subscriptions
import { parseLocalDate, formatDateForInput } from './DateUtils.js';

export class RecurringManager {
    
    /**
     * Calculate the next occurrence date for a recurring item
     * @param {Object} item - Recurring item with frequency and lastOccurrence
     * @param {Date} currentDate - Current date (defaults to today)
     * @returns {Date} Next occurrence date
     */
    static getNextOccurrence(item, currentDate = new Date()) {
        if (!item.frequency || item.frequency === 'one-time') {
            return parseLocalDate(item.nextOccurrence || item.startDate);
        }

        const lastOccurrence = parseLocalDate(item.nextOccurrence || item.startDate || item.lastOccurrence);
        let nextOccurrence;

        switch (item.frequency) {
            case 'weekly':
                nextOccurrence = this.calculateNextWeekly(lastOccurrence, currentDate);
                break;
            case 'bi-weekly':
                nextOccurrence = this.calculateNextBiWeekly(lastOccurrence, currentDate);
                break;
            case 'monthly':
                nextOccurrence = this.calculateNextMonthly(lastOccurrence, currentDate);
                break;
            case 'quarterly':
                nextOccurrence = this.calculateNextQuarterly(lastOccurrence, currentDate);
                break;
            case 'annually':
                nextOccurrence = this.calculateNextAnnually(lastOccurrence, currentDate);
                break;
            default:
                nextOccurrence = parseLocalDate(item.nextOccurrence || item.startDate);
        }

        return nextOccurrence;
    }

    /**
     * Process recurring items with calculated next occurrence dates and status
     * @param {Array} items - Raw recurring items
     * @returns {Array} Processed recurring items with status and dates
     */
    static processRecurringItems(items) {
        return items.map(item => {
            const nextOccurrence = this.getNextOccurrence(item);
            const status = this.determineStatus(item, nextOccurrence);
            
            return {
                ...item,
                nextOccurrence: nextOccurrence,
                status: status,
                amount: parseFloat(item.amount) || 0,
                // Preserve existing history
                history: item.history || []
            };
        });
    }

    /**
     * Determine the status of a recurring item
     * @param {Object} item - Recurring item
     * @param {Date} nextOccurrence - Next occurrence date
     * @returns {string} Status: active, paused, ended, failed
     */
    static determineStatus(item, nextOccurrence) {
        if (item.status === 'paused') return 'paused';
        if (item.status === 'ended') return 'ended';
        if (item.endDate && new Date(item.endDate) < new Date()) return 'ended';
        
        const now = new Date();
        const daysDiff = Math.floor((nextOccurrence - now) / (1000 * 60 * 60 * 24));
        
        // Check if last occurrence failed
        if (item.lastPaymentStatus === 'failed' && daysDiff < -7) {
            return 'failed';
        }
        
        return 'active';
    }

    /**
     * Get recurring items occurring within a date range
     * @param {Array} items - Processed recurring items
     * @param {Date} startDate - Range start
     * @param {Date} endDate - Range end
     * @returns {Array} Items occurring within range
     */
    static getItemsInRange(items, startDate, endDate) {
        return items.filter(item => {
            const nextDate = new Date(item.nextOccurrence);
            return nextDate >= startDate && nextDate <= endDate;
        });
    }

    /**
     * Calculate next weekly occurrence
     */
    static calculateNextWeekly(lastDate, currentDate) {
        let nextDate = new Date(lastDate);
        while (nextDate <= currentDate) {
            nextDate.setDate(nextDate.getDate() + 7);
        }
        return nextDate;
    }

    /**
     * Calculate next bi-weekly occurrence
     */
    static calculateNextBiWeekly(lastDate, currentDate) {
        let nextDate = new Date(lastDate);
        while (nextDate <= currentDate) {
            nextDate.setDate(nextDate.getDate() + 14);
        }
        return nextDate;
    }

    /**
     * Calculate next monthly occurrence
     */
    static calculateNextMonthly(lastDate, currentDate) {
        let nextDate = new Date(lastDate);
        const dayOfMonth = lastDate.getDate();

        while (nextDate <= currentDate) {
            nextDate.setMonth(nextDate.getMonth() + 1);
            
            // Handle month-end dates properly
            if (dayOfMonth > 28) {
                const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
                nextDate.setDate(Math.min(dayOfMonth, lastDayOfMonth));
            }
        }
        return nextDate;
    }

    /**
     * Calculate next quarterly occurrence
     */
    static calculateNextQuarterly(lastDate, currentDate) {
        let nextDate = new Date(lastDate);
        const dayOfMonth = lastDate.getDate();

        while (nextDate <= currentDate) {
            nextDate.setMonth(nextDate.getMonth() + 3);
            
            // Handle month-end dates properly
            if (dayOfMonth > 28) {
                const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
                nextDate.setDate(Math.min(dayOfMonth, lastDayOfMonth));
            }
        }
        return nextDate;
    }

    /**
     * Calculate next annually occurrence
     */
    static calculateNextAnnually(lastDate, currentDate) {
        let nextDate = new Date(lastDate);
        
        while (nextDate <= currentDate) {
            nextDate.setFullYear(nextDate.getFullYear() + 1);
        }
        return nextDate;
    }

    /**
     * Mark a recurring item as processed and update next occurrence
     * @param {Object} item - Recurring item
     * @param {Date} processedDate - Date it was processed
     * @param {string} status - Status: success, failed, skipped
     * @returns {Object} Updated item
     */
    static markAsProcessed(item, processedDate = new Date(), status = 'success') {
        const nextOccurrence = this.getNextOccurrence({
            ...item,
            lastOccurrence: processedDate
        });

        return {
            ...item,
            lastOccurrence: processedDate,
            nextOccurrence: nextOccurrence,
            lastPaymentStatus: status,
            history: [
                ...(item.history || []),
                {
                    date: formatDateForInput(processedDate),
                    status: status,
                    amount: item.amount
                }
            ]
        };
    }

    /**
     * Generate schedule for multiple periods ahead
     * @param {Object} item - Recurring item
     * @param {number} periodsAhead - Number of periods to generate
     * @returns {Array} Array of future occurrence dates
     */
    static generateSchedule(item, periodsAhead = 6) {
        const schedule = [];
        let currentItem = { ...item };
        
        for (let i = 0; i < periodsAhead; i++) {
            const nextDate = this.getNextOccurrence(currentItem);
            schedule.push({
                date: nextDate,
                amount: item.amount,
                name: item.name,
                type: item.type
            });
            
            // Update for next iteration
            currentItem.lastOccurrence = nextDate;
        }
        
        return schedule;
    }

    /**
     * Calculate monthly totals for recurring items
     * @param {Array} items - Processed recurring items
     * @returns {Object} Monthly income and expense totals
     */
    static calculateMonthlyTotals(items) {
        const activeItems = items.filter(item => item.status === 'active');
        
        const monthlyIncome = activeItems
            .filter(item => item.type === 'income')
            .reduce((sum, item) => {
                return sum + this.convertToMonthly(item.amount, item.frequency);
            }, 0);
            
        const monthlyExpenses = activeItems
            .filter(item => item.type === 'expense')
            .reduce((sum, item) => {
                return sum + this.convertToMonthly(item.amount, item.frequency);
            }, 0);
            
        return {
            monthlyIncome,
            monthlyExpenses,
            netRecurring: monthlyIncome - monthlyExpenses
        };
    }

    /**
     * Convert any frequency amount to monthly equivalent
     * @param {number} amount - Amount per frequency period
     * @param {string} frequency - Frequency type
     * @returns {number} Monthly equivalent amount
     */
    static convertToMonthly(amount, frequency) {
        const multipliers = {
            'weekly': 4.33, // Approximate weeks per month
            'bi-weekly': 2.17, // Approximate bi-weeks per month
            'monthly': 1,
            'quarterly': 0.33, // 1/3 of quarterly amount per month
            'annually': 0.083 // 1/12 of annual amount per month
        };
        
        return amount * (multipliers[frequency] || 1);
    }

    /**
     * Detect potential duplicate or overlapping subscriptions
     * @param {Array} items - All recurring items
     * @returns {Array} Potential duplicates
     */
    static detectDuplicates(items) {
        const duplicates = [];
        const subscriptionItems = items.filter(item => 
            item.type === 'expense' && 
            (item.category === 'Subscriptions' || item.category === 'Entertainment')
        );

        // Simple name-based duplicate detection
        for (let i = 0; i < subscriptionItems.length; i++) {
            for (let j = i + 1; j < subscriptionItems.length; j++) {
                const item1 = subscriptionItems[i];
                const item2 = subscriptionItems[j];
                
                if (this.isSimilarName(item1.name, item2.name)) {
                    duplicates.push({
                        items: [item1, item2],
                        type: 'similar_name',
                        message: `Potential duplicate: "${item1.name}" and "${item2.name}"`
                    });
                }
            }
        }

        return duplicates;
    }

    /**
     * Check if two names are similar (basic implementation)
     */
    static isSimilarName(name1, name2) {
        const clean1 = name1.toLowerCase().replace(/[^a-z0-9]/g, '');
        const clean2 = name2.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Check if one is contained in the other
        return clean1.includes(clean2) || clean2.includes(clean1);
    }
}