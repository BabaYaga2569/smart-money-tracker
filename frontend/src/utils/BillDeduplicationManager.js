/**
 * BillDeduplicationManager.js
 * 
 * Manages duplicate detection and cleanup for bills.
 * Identifies duplicates based on name, amount, due date, recurrence, and template ID.
 */

export class BillDeduplicationManager {
    /**
     * Find duplicate bills in an array
     * @param {Array} bills - Array of bill objects
     * @returns {Object} { duplicates: Array, uniqueBills: Array, stats: Object }
     */
    static findDuplicates(bills) {
        if (!bills || bills.length === 0) {
            return { duplicates: [], uniqueBills: [], stats: { total: 0, unique: 0, duplicates: 0 } };
        }

        const seen = new Map();
        const duplicates = [];
        const uniqueBills = [];

        bills.forEach((bill) => {
            const key = this.generateBillKey(bill);
            
            if (seen.has(key)) {
                // This is a duplicate
                duplicates.push({
                    bill: bill,
                    duplicateOf: seen.get(key),
                    key: key
                });
            } else {
                // First occurrence - keep it
                seen.set(key, bill);
                uniqueBills.push(bill);
            }
        });

        const stats = {
            total: bills.length,
            unique: uniqueBills.length,
            duplicates: duplicates.length
        };

        return { duplicates, uniqueBills, stats };
    }

    /**
     * Generate a unique key for a bill based on its identifying properties
     * @param {Object} bill - Bill object
     * @returns {string} Unique key for the bill
     */
    static generateBillKey(bill) {
        // Normalize name (lowercase, trim whitespace)
        const name = (bill.name || '').toLowerCase().trim();
        
        // Normalize amount (parse as float, fix to 2 decimals)
        const amount = parseFloat(bill.amount || 0).toFixed(2);
        
        // Normalize due date to YYYY-MM-DD format (handle string, Date object, or other types)
        let dueDate = '';
        if (bill.dueDate) {
            if (bill.dueDate instanceof Date) {
                // Date object - convert to YYYY-MM-DD
                dueDate = bill.dueDate.toISOString().split('T')[0];
            } else if (typeof bill.dueDate === 'string') {
                // String - just trim it
                dueDate = bill.dueDate.trim();
            } else {
                // Number or other type - convert to string first
                dueDate = String(bill.dueDate).trim();
            }
        }
        
        // Normalize recurrence
        const recurrence = (bill.recurrence || 'one-time').toLowerCase().trim();
        
        // Include recurring template ID if present (important for auto-generated bills)
        const templateId = bill.recurringTemplateId || '';
        
        // Create composite key
        return `${name}|${amount}|${dueDate}|${recurrence}|${templateId}`;
    }

    /**
     * Remove duplicate bills from an array, keeping only the first occurrence
     * @param {Array} bills - Array of bill objects
     * @returns {Object} { cleanedBills: Array, removedBills: Array, stats: Object }
     */
    static removeDuplicates(bills) {
        const result = this.findDuplicates(bills);
        
        return {
            cleanedBills: result.uniqueBills,
            removedBills: result.duplicates.map(d => d.bill),
            stats: result.stats
        };
    }

    /**
     * Generate a detailed report of duplicate bills
     * @param {Array} bills - Array of bill objects
     * @returns {Object} Detailed duplicate report
     */
    static generateDuplicateReport(bills) {
        const result = this.findDuplicates(bills);
        
        // Group duplicates by their key
        const duplicateGroups = new Map();
        result.duplicates.forEach(dup => {
            if (!duplicateGroups.has(dup.key)) {
                duplicateGroups.set(dup.key, {
                    original: dup.duplicateOf,
                    duplicates: []
                });
            }
            duplicateGroups.get(dup.key).duplicates.push(dup.bill);
        });

        // Convert to array format
        const groups = Array.from(duplicateGroups.entries()).map(([key, group]) => ({
            key,
            original: group.original,
            duplicates: group.duplicates,
            count: group.duplicates.length + 1 // +1 for original
        }));

        return {
            totalBills: bills.length,
            uniqueBills: result.uniqueBills.length,
            duplicateCount: result.duplicates.length,
            duplicateGroups: groups,
            stats: result.stats
        };
    }

    /**
     * Get a human-readable summary of deduplication results
     * @param {Object} stats - Stats object from removeDuplicates or findDuplicates
     * @returns {string} Human-readable summary
     */
    static getSummaryMessage(stats) {
        if (stats.duplicates === 0) {
            return `No duplicates found. All ${stats.unique} bills are unique.`;
        }
        
        const plural = stats.duplicates === 1 ? 'duplicate' : 'duplicates';
        return `Found and removed ${stats.duplicates} ${plural}. Kept ${stats.unique} unique bills out of ${stats.total} total.`;
    }

    /**
     * Validate if two bills are duplicates
     * @param {Object} bill1 - First bill
     * @param {Object} bill2 - Second bill
     * @returns {boolean} True if bills are duplicates
     */
    static areBillsDuplicates(bill1, bill2) {
        return this.generateBillKey(bill1) === this.generateBillKey(bill2);
    }

    /**
     * Check if a new bill would be a duplicate of any existing bills
     * @param {Object} newBill - New bill to check
     * @param {Array} existingBills - Array of existing bills
     * @returns {Object} { isDuplicate: boolean, duplicateOf: Object|null }
     */
    static checkForDuplicate(newBill, existingBills) {
        const newKey = this.generateBillKey(newBill);
        
        for (const existingBill of existingBills) {
            const existingKey = this.generateBillKey(existingBill);
            if (newKey === existingKey) {
                return {
                    isDuplicate: true,
                    duplicateOf: existingBill
                };
            }
        }
        
        return {
            isDuplicate: false,
            duplicateOf: null
        };
    }

    /**
     * Log deduplication activity
     * @param {Object} result - Result from removeDuplicates
     * @param {string} context - Context of the deduplication (e.g., 'manual', 'auto-load')
     */
    static logDeduplication(result, context = 'unknown') {
        console.log(`[Bill Deduplication - ${context}]`);
        console.log(`  Total bills processed: ${result.stats.total}`);
        console.log(`  Unique bills kept: ${result.stats.unique}`);
        console.log(`  Duplicates removed: ${result.stats.duplicates}`);
        
        if (result.removedBills && result.removedBills.length > 0) {
            console.log(`  Removed bills:`, result.removedBills.map(b => ({
                name: b.name,
                amount: b.amount,
                dueDate: b.dueDate,
                recurrence: b.recurrence
            })));
        }
    }
}
