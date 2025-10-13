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
     * Detect potential duplicate or overlapping subscriptions with advanced matching
     * @param {Array} items - All recurring items
     * @param {Array} newItems - New items to check against existing ones
     * @returns {Array} Potential duplicates with confidence scores
     */
    static detectDuplicates(items, newItems = []) {
        const duplicates = [];
        const itemsToCheck = newItems.length > 0 ? newItems : items;
        
        itemsToCheck.forEach((newItem) => {
            const existingItems = newItems.length > 0 ? items : items.slice(0, items.indexOf(newItem));
            
            existingItems.forEach((existingItem) => {
                if (newItem.id === existingItem.id) return; // Skip same item
                
                const similarity = this.calculateSimilarity(newItem, existingItem);
                
                if (similarity.score >= 70) { // 70% similarity threshold
                    duplicates.push({
                        existing: existingItem,
                        incoming: newItem,
                        similarity: similarity.score,
                        confidence: similarity.confidence,
                        reasons: similarity.reasons,
                        type: similarity.primaryMatch,
                        message: `${similarity.score}% match: "${existingItem.name}" â†” "${newItem.name}"`,
                        recommendations: this.generateRecommendations(existingItem, newItem, similarity)
                    });
                }
            });
        });

        return duplicates;
    }

    /**
     * Calculate similarity score between two recurring items
     * @param {Object} item1 - First item
     * @param {Object} item2 - Second item
     * @returns {Object} Similarity analysis
     */
    static calculateSimilarity(item1, item2) {
        const analysis = {
            score: 0,
            confidence: 0,
            reasons: [],
            primaryMatch: 'unknown'
        };

        // Name similarity (40% weight)
        const nameScore = this.calculateNameSimilarity(item1.name, item2.name);
        if (nameScore > 0) {
            analysis.score += nameScore * 0.4;
            analysis.reasons.push(`Name similarity: ${nameScore}%`);
            if (nameScore >= 80) analysis.primaryMatch = 'name_match';
        }

        // Amount similarity (30% weight)
        const amountScore = this.calculateAmountSimilarity(item1.amount, item2.amount);
        if (amountScore > 0) {
            analysis.score += amountScore * 0.3;
            analysis.reasons.push(`Amount similarity: ${amountScore}%`);
            if (amountScore >= 90 && analysis.primaryMatch === 'unknown') {
                analysis.primaryMatch = 'amount_match';
            }
        }

        // Frequency match (15% weight)
        if (item1.frequency === item2.frequency) {
            analysis.score += 15;
            analysis.reasons.push('Same frequency');
            if (analysis.primaryMatch === 'unknown') analysis.primaryMatch = 'frequency_match';
        }

        // Category match (10% weight)
        if (item1.category === item2.category) {
            analysis.score += 10;
            analysis.reasons.push('Same category');
        }

        // Date pattern similarity (5% weight)
        const dateScore = this.calculateDateSimilarity(item1.nextOccurrence, item2.nextOccurrence);
        if (dateScore > 0) {
            analysis.score += dateScore * 0.05;
            analysis.reasons.push(`Date pattern: ${dateScore}%`);
        }

        // Calculate confidence based on multiple factors matching
        analysis.confidence = Math.min(100, analysis.score + (analysis.reasons.length * 5));
        
        return analysis;
    }

    /**
     * Calculate name similarity using multiple algorithms
     * @param {string} name1 - First name
     * @param {string} name2 - Second name
     * @returns {number} Similarity score (0-100)
     */
    static calculateNameSimilarity(name1, name2) {
        const clean1 = this.cleanName(name1);
        const clean2 = this.cleanName(name2);
        
        // Exact match
        if (clean1 === clean2) return 100;
        
        // One contains the other
        if (clean1.includes(clean2) || clean2.includes(clean1)) {
            return Math.max(80, 100 * Math.min(clean1.length, clean2.length) / Math.max(clean1.length, clean2.length));
        }
        
        // Merchant name variations (Netflix, NETFLIX INC, Netflix.com)
        const merchantScore = this.calculateMerchantSimilarity(clean1, clean2);
        if (merchantScore > 0) return merchantScore;
        
        // Levenshtein distance
        const levenshteinScore = this.calculateLevenshteinSimilarity(clean1, clean2);
        
        return Math.max(0, levenshteinScore);
    }

    /**
     * Clean name for comparison
     * @param {string} name - Raw name
     * @returns {string} Cleaned name
     */
    static cleanName(name) {
        return name.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '') // Remove special characters
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
    }

    /**
     * Calculate merchant name similarity (handles common variations)
     * @param {string} name1 - First name
     * @param {string} name2 - Second name
     * @returns {number} Similarity score
     */
    static calculateMerchantSimilarity(name1, name2) {
        const merchants = {
            'netflix': ['netflix', 'netflix inc', 'netflix com', 'nflx'],
            'spotify': ['spotify', 'spotify usa', 'spotify premium'],
            'amazon': ['amazon', 'amazon prime', 'amzn', 'amazon web services'],
            'apple': ['apple', 'apple music', 'itunes', 'app store'],
            'google': ['google', 'youtube', 'youtube premium', 'google play'],
            'microsoft': ['microsoft', 'office 365', 'xbox', 'msft'],
            'disney': ['disney', 'disney plus', 'disneyplus'],
            'hulu': ['hulu', 'hulu llc'],
            'uber': ['uber', 'uber technologies'],
            'lyft': ['lyft', 'lyft inc']
        };
        
        for (const [, variations] of Object.entries(merchants)) {
            const match1 = variations.some(v => name1.includes(v));
            const match2 = variations.some(v => name2.includes(v));
            
            if (match1 && match2) return 95;
        }
        
        return 0;
    }

    /**
     * Calculate Levenshtein distance similarity
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Similarity score
     */
    static calculateLevenshteinSimilarity(str1, str2) {
        const distance = this.levenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);
        
        if (maxLength === 0) return 100;
        
        const similarity = ((maxLength - distance) / maxLength) * 100;
        return Math.max(0, similarity);
    }

    /**
     * Calculate Levenshtein distance
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
     * Calculate amount similarity
     * @param {number} amount1 - First amount
     * @param {number} amount2 - Second amount
     * @returns {number} Similarity score
     */
    static calculateAmountSimilarity(amount1, amount2) {
        const diff = Math.abs(amount1 - amount2);
        const avg = (amount1 + amount2) / 2;
        
        if (diff === 0) return 100;
        if (avg === 0) return 0;
        
        const percentageDiff = (diff / avg) * 100;
        
        // Allow small differences (price changes)
        if (percentageDiff <= 5) return 95;  // Within 5%
        if (percentageDiff <= 10) return 85; // Within 10%
        if (percentageDiff <= 20) return 70; // Within 20%
        
        return Math.max(0, 100 - percentageDiff);
    }

    /**
     * Calculate date similarity based on day of month
     * @param {string} date1 - First date
     * @param {string} date2 - Second date
     * @returns {number} Similarity score
     */
    static calculateDateSimilarity(date1, date2) {
        try {
            const d1 = new Date(date1);
            const d2 = new Date(date2);
            
            // Same day of month = high similarity
            if (d1.getDate() === d2.getDate()) return 100;
            
            // Close days (within 3 days)
            const dayDiff = Math.abs(d1.getDate() - d2.getDate());
            if (dayDiff <= 3) return 80;
            if (dayDiff <= 7) return 60;
            
            return 0;
        } catch {
            return 0;
        }
    }

    /**
     * Generate recommendations for handling duplicates
     * @param {Object} existing - Existing item
     * @param {Object} incoming - New item
     * @param {Object} similarity - Similarity analysis
     * @returns {Array} Recommendations
     */
    static generateRecommendations(existing, incoming, similarity) {
        const recommendations = [];
        
        if (similarity.score >= 90) {
            recommendations.push({
                action: 'merge',
                label: 'Merge items (Recommended)',
                description: 'Update existing item with new information',
                confidence: 'high'
            });
            recommendations.push({
                action: 'skip',
                label: 'Skip import',
                description: 'Keep existing item unchanged',
                confidence: 'medium'
            });
        } else if (similarity.score >= 75) {
            recommendations.push({
                action: 'merge',
                label: 'Merge items',
                description: 'Combine information from both items',
                confidence: 'medium'
            });
            recommendations.push({
                action: 'keep_both',
                label: 'Keep both separately (Recommended)',
                description: 'Import as separate items',
                confidence: 'high'
            });
        } else {
            recommendations.push({
                action: 'keep_both',
                label: 'Keep both separately (Recommended)',
                description: 'These appear to be different items',
                confidence: 'high'
            });
            recommendations.push({
                action: 'skip',
                label: 'Skip import',
                description: 'Do not import this item',
                confidence: 'low'
            });
        }
        
        return recommendations;
    }

    /**
     * Check if two names are similar (legacy method for compatibility)
     */
    static isSimilarName(name1, name2) {
        return this.calculateNameSimilarity(name1, name2) >= 80;
    }
}
