// BillSortingManager.js - Smart sorting for bills by due date proximity
import { getLocalMidnight, parseDueDateLocal } from './dateHelpers.js';

export class BillSortingManager {
    
    /**
     * Calculate days until due date (can be negative for overdue)
     * Uses timezone-aware date parsing to avoid off-by-one errors
     * @param {string|Date} dueDate - Due date
     * @returns {number} Days until due (negative if overdue)
     */
    static calculateDaysUntilDue(dueDate) {
        if (!dueDate) return 999; // Bills without due dates go to the end
        
        // Use timezone-aware helpers to avoid off-by-one errors
        const today = getLocalMidnight();
        
        // Parse due date as LOCAL date, not UTC
        const due = typeof dueDate === 'string' ? parseDueDateLocal(dueDate) : new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 0, 0, 0, 0);
        
        if (!due || isNaN(due.getTime())) return 999;
        
        const diffTime = due.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays;
    }

    /**
     * Get urgency category based on days until due and date comparison
     * @param {number} daysUntilDue - Days until due date
     * @param {string|Date|null} dueDate - The actual due date (optional, used for month comparison to determine "THIS MONTH" badge)
     * @returns {Object} Urgency information including category, indicator, label, priority, and className
     */
    static getUrgencyInfo(daysUntilDue, dueDate = null) {
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
        } else {
            // FIX: Check if due date is in the CURRENT calendar month
            // This fixes the bug where January 2026 bills show "THIS MONTH" in December 2025
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            let isThisMonth = false;
            if (dueDate) {
                const due = typeof dueDate === 'string' ? parseDueDateLocal(dueDate) : dueDate;
                if (due && !isNaN(due.getTime())) {
                    isThisMonth = due.getMonth() === currentMonth && due.getFullYear() === currentYear;
                }
            }
            
            if (isThisMonth) {
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
                    // CRITICAL FIX: Separate paid bills from unpaid bills
                    const aPaid = a.status === 'paid' || a.isPaid;
                    const bPaid = b.status === 'paid' || b.isPaid;
                    
                    // Paid bills always go to bottom
                    if (aPaid && !bPaid) return 1;
                    if (!aPaid && bPaid) return -1;
                    
                    // If both paid, sort by last paid date (most recent first)
                    if (aPaid && bPaid) {
                        const aDate = new Date(a.lastPaidDate || 0);
                        const bDate = new Date(b.lastPaidDate || 0);
                        return bDate - aDate;
                    }
                    
                    // For unpaid bills: Calculate days until due
                    const aDays = this.calculateDaysUntilDue(a.nextOccurrence || a.nextDueDate || a.dueDate);
                    const bDays = this.calculateDaysUntilDue(b.nextOccurrence || b.nextDueDate || b.dueDate);
                    
                    const aOverdue = aDays < 0;
                    const bOverdue = bDays < 0;
                    
                    // Priority 1: OVERDUE bills ALWAYS at top
                    if (aOverdue && !bOverdue) return -1;
                    if (!aOverdue && bOverdue) return 1;
                    
                    // Priority 2: If both overdue, most overdue first (most negative days)
                    if (aOverdue && bOverdue) {
                        return aDays - bDays; // More negative = more overdue = higher priority
                    }
                    
                    // Priority 3: For upcoming bills, sort by due date (closest first)
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
            const dueDate = bill.nextOccurrence || bill.nextDueDate || bill.dueDate;
            const daysUntilDue = this.calculateDaysUntilDue(dueDate);
            const urgencyInfo = this.getUrgencyInfo(daysUntilDue, dueDate);
            
            return {
                ...bill,
                daysUntilDue,
                urgencyInfo,
                formattedDueDate: this.formatDueDate(dueDate, daysUntilDue)
            };
        });

        // Sort the bills
        return this.sortBillsByUrgency(billsWithUrgency, sortOrder);
    }

    /**
     * Format due date for display
     * Uses timezone-aware parsing to ensure correct date display
     * @param {string|Date} dueDate - Due date
     * @param {number} daysUntilDue - Days until due
     * @returns {string} Formatted date string
     */
    static formatDueDate(dueDate, daysUntilDue) {
        if (!dueDate) return 'No due date';
        
        // Use timezone-aware parsing to avoid off-by-one day errors
        const due = typeof dueDate === 'string' ? parseDueDateLocal(dueDate) : new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 0, 0, 0, 0);
        
        if (!due || isNaN(due.getTime())) return 'Invalid date';
        
        const options = { month: 'short', day: 'numeric' };
        const dateStr = due.toLocaleDateString('en-US', options);
        
        if (daysUntilDue === 0) {
            return `${dateStr} (Due today)`;
        } else if (daysUntilDue === 1) {
            return `${dateStr} (Due tomorrow)`;
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