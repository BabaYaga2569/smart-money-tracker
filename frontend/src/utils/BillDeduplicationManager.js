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
     * Validate if two bills are duplicates using fuzzy matching
     * @param {Object} bill1 - First bill
     * @param {Object} bill2 - Second bill
     * @returns {boolean} True if bills are duplicates
     */
    static areBillsDuplicates(bill1, bill2) {
        // 1. Name similarity (case-insensitive, ignoring special chars)
        const name1 = (bill1.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const name2 = (bill2.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        
        const nameMatch = name1 === name2 || 
                         name1.includes(name2) || 
                         name2.includes(name1) ||
                         this.calculateSimilarity(name1, name2) > 0.85;
        
        // 2. Amount similarity (within $1.00)
        const amount1 = parseFloat(bill1.amount || 0);
        const amount2 = parseFloat(bill2.amount || 0);
        const amountMatch = Math.abs(amount1 - amount2) <= 1.00;
        
        // 3. Due date similarity (within 3 days)
        const date1 = new Date(bill1.dueDate || bill1.nextDueDate);
        const date2 = new Date(bill2.dueDate || bill2.nextDueDate);
        const daysDiff = Math.abs((date1 - date2) / (1000 * 60 * 60 * 24));
        const dateMatch = daysDiff <= 3;
        
        // 4. Frequency match
        const freq1 = (bill1.recurrence || 'one-time').toLowerCase();
        const freq2 = (bill2.recurrence || 'one-time').toLowerCase();
        const freqMatch = freq1 === freq2;
        
        // Bills are duplicates if name + amount + frequency match, and date is close
        return nameMatch && amountMatch && freqMatch && dateMatch;
    }

    /**
     * Calculate string similarity using Levenshtein distance
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Similarity score between 0 and 1
     */
    static calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Calculate Levenshtein distance between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Edit distance
     */
    static levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
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
     * Generate detailed duplicate report showing what will be removed
     * Uses fuzzy matching to find duplicates
     * @param {Array} bills - Array of bill objects
     * @returns {Object} Detailed report with groups
     */
    static generateDetailedDuplicateReport(bills) {
        const processed = new Set();
        const duplicateGroups = [];
        
        // Use pairwise comparison with fuzzy matching
        for (let i = 0; i < bills.length; i++) {
            if (processed.has(i)) continue;
            
            const group = [bills[i]];
            processed.add(i);
            
            // Find all bills that are duplicates of bills[i]
            for (let j = i + 1; j < bills.length; j++) {
                if (processed.has(j)) continue;
                
                if (this.areBillsDuplicates(bills[i], bills[j])) {
                    group.push(bills[j]);
                    processed.add(j);
                }
            }
            
            // Only add groups with duplicates (more than 1 bill)
            if (group.length > 1) {
                duplicateGroups.push({
                    keepBill: group[0], // Keep first
                    removeBills: group.slice(1), // Remove rest
                    count: group.length
                });
            }
        }
        
        return {
            duplicateCount: duplicateGroups.reduce((sum, g) => sum + g.removeBills.length, 0),
            totalGroups: duplicateGroups.length,
            groups: duplicateGroups
        };
    }

    /**
     * Generate a group key for fuzzy matching
     * @param {Object} bill - Bill object
     * @returns {string} Group key
     */
    static generateGroupKey(bill) {
        // Normalize for grouping
        const name = (bill.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const amount = Math.round(parseFloat(bill.amount || 0) * 100) / 100; // Round to cents
        const freq = (bill.recurrence || 'one-time').toLowerCase();
        return `${name}-${amount}-${freq}`;
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
