// BillSortingManager.js - Smart sorting for bills by due date proximity
import { parseLocalDate } from './DateUtils.js';

export class BillSortingManager {
    
    /**
     * Calculate days until due date (can be negative for overdue)
     * @param {string|Date} dueDate - Due date
     * @returns {number} Days until due (negative if overdue)
     */
    static calculateDaysUntilDue(dueDate) {
        if (!dueDate) return 999; // Bills without due dates go to the end
        
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to start of day
        
        const due = parseLocalDate(dueDate);
        if (!due) return 999;
        
        due.setHours(0, 0, 0, 0); // Reset time to start of day
        
        const diffTime = due.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays;
    }

    /**
     * Get urgency category based on days until due
     * @param {number} daysUntilDue - Days until due date
     * @returns {Object} Urgency information
     */
    static getUrgencyInfo(daysUntilDue) {
        if (daysUntilDue < 0) {
            return {
                category: 'overdue',
                indicator: '🔴',
                label: 'OVERDUE',
                priority: 1,
                className: 'urgency-overdue'
            };
        } else if (daysUntilDue <= 7) {
            return {
                category: 'urgent',
                indicator: '🟠',
                label: 'DUE SOON',
                priority: 2,
                className: 'urgency-urgent'
            };
        } else if (daysUntilDue <= 30) {
            return {
                category: 'upcoming',
                indicator: '🟡',
                label: 'THIS MONTH',
                priority: 3,
                className: 'urgency-upcoming'
            };
        } else {
            return {
                category: 'future',
                indicator: '🟢',
                label: 'NEXT MONTH',
                priority: 4,
                className: 'urgency-future'
            };
        }
    }

    /**
     * Sort bills by due date proximity (smart sorting with paid bills at bottom)
     * @param {Array} bills - Array of bills/recurring items
     * @param {string} sortOrder - 'dueDate' (default), 'alphabetical', 'amount', 'custom'
     * @returns {Array} Sorted bills array
     */
    static sortBillsByUrgency(bills, sortOrder = 'dueDate') {
        if (!Array.isArray(bills) || bills.length === 0) {
            return bills;
        }

        // Create a copy to avoid mutating original array
        const billsCopy = [...bills];

        switch (sortOrder) {
            case 'alphabetical':
                return billsCopy.sort((a, b) => {
                    return (a.name || '').localeCompare(b.name || '');
                });
            
            case 'amount':
                return billsCopy.sort((a, b) => {
                    return (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0);
                });
            
            case 'custom':
                // For custom sorting, maintain existing order or use a custom order field
                return billsCopy.sort((a, b) => {
                    return (a.customOrder || 0) - (b.customOrder || 0);
                });
            
            case 'dueDate':
            default:
                return billsCopy.sort((a, b) => {
                    // Sort by urgency - overdue first, then by days until due
                    const aDays = this.calculateDaysUntilDue(a.nextOccurrence || a.nextDueDate || a.dueDate);
                    const bDays = this.calculateDaysUntilDue(b.nextOccurrence || b.nextDueDate || b.dueDate);
                    
                    // Primary sort: by days until due (overdue bills first)
                    if (aDays !== bDays) {
                        return aDays - bDays;
                    }
                    
                    // Secondary sort: by amount (higher first) if same due date
                    const aAmount = parseFloat(a.amount) || 0;
                    const bAmount = parseFloat(b.amount) || 0;
                    if (aAmount !== bAmount) {
                        return bAmount - aAmount;
                    }
                    
                    // Tertiary sort: alphabetically
                    return (a.name || '').localeCompare(b.name || '');
                });
        }
    }

    /**
     * Process bills with urgency information and sorting
     * @param {Array} bills - Raw bills array
     * @param {string} sortOrder - Sorting preference
     * @returns {Array} Processed and sorted bills with urgency info
     */
    static processBillsWithUrgency(bills, sortOrder = 'dueDate') {
        if (!Array.isArray(bills)) {
            return [];
        }

        // Add urgency information to each bill
        const billsWithUrgency = bills.map(bill => {
            const daysUntilDue = this.calculateDaysUntilDue(bill.nextOccurrence || bill.dueDate);
            const urgencyInfo = this.getUrgencyInfo(daysUntilDue);
            
            return {
                ...bill,
                daysUntilDue,
                urgencyInfo,
                formattedDueDate: this.formatDueDate(bill.nextOccurrence || bill.dueDate, daysUntilDue)
            };
        });

        // Sort the bills
        return this.sortBillsByUrgency(billsWithUrgency, sortOrder);
    }

    /**
     * Format due date for display
     * @param {string|Date} dueDate - Due date
     * @param {number} daysUntilDue - Days until due
     * @returns {string} Formatted date string
     */
    static formatDueDate(dueDate, daysUntilDue) {
        if (!dueDate) return 'No due date';
        
        const due = parseLocalDate(dueDate);
        if (!due) return 'Invalid date';
        
        const options = { month: 'short', day: 'numeric' };
        const dateStr = due.toLocaleDateString('en-US', options);
        
        if (daysUntilDue === 0) {
            return `${dateStr} (Today)`;
        } else if (daysUntilDue === 1) {
            return `${dateStr} (Tomorrow)`;
        } else if (daysUntilDue === -1) {
            return `${dateStr} (Yesterday)`;
        } else if (daysUntilDue < 0) {
            return `${dateStr} (${Math.abs(daysUntilDue)} days ago)`;
        } else {
            return `${dateStr} (${daysUntilDue} days)`;
        }
    }

    /**
     * Group bills by urgency category
     * @param {Array} processedBills - Bills with urgency info
     * @returns {Object} Bills grouped by urgency
     */
    static groupBillsByUrgency(processedBills) {
        return processedBills.reduce((groups, bill) => {
            const category = bill.urgencyInfo.category;
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(bill);
            return groups;
        }, {});
    }

    /**
     * Get summary statistics for bills urgency
     * @param {Array} processedBills - Bills with urgency info
     * @returns {Object} Summary statistics
     */
    static getBillsUrgencySummary(processedBills) {
        const grouped = this.groupBillsByUrgency(processedBills);
        
        return {
            overdue: (grouped.overdue || []).length,
            urgent: (grouped.urgent || []).length,
            upcoming: (grouped.upcoming || []).length,
            future: (grouped.future || []).length,
            total: processedBills.length,
            totalOverdueAmount: (grouped.overdue || []).reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0),
            totalUrgentAmount: (grouped.urgent || []).reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0)
        };
    }
}