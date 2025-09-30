// AccountMatcher.js - Utility for matching institution names to Plaid accounts
export class AccountMatcher {
    /**
     * Default legacy-to-Plaid institution mapping
     * Maps common legacy bank names to standardized institution names
     */
    static DEFAULT_INSTITUTION_MAPPING = {
        'bank of america': ['bank of america', 'bofa', 'boa'],
        'usaa': ['usaa', 'usaa federal savings bank'],
        'chase': ['chase', 'jpmorgan chase', 'jp morgan'],
        'wells fargo': ['wells fargo', 'wells fargo bank'],
        'capital one': ['capital one', 'capital one bank', 'capitalone'],
        'citibank': ['citibank', 'citi', 'citigroup'],
        'us bank': ['us bank', 'u.s. bank', 'usbank'],
        'pnc bank': ['pnc', 'pnc bank'],
        'td bank': ['td bank', 'td'],
        'navy federal': ['navy federal', 'navy federal credit union'],
        'ally bank': ['ally', 'ally bank'],
        'discover': ['discover', 'discover bank'],
        'synchrony': ['synchrony', 'synchrony bank'],
        'american express': ['american express', 'amex', 'amex bank']
    };

    /**
     * Match a CSV institution name to a Plaid account
     * @param {string} institutionName - Institution name from CSV
     * @param {Object} accounts - Map of account ID to account data
     * @param {Object} customMapping - User-defined institution mappings
     * @returns {Object} Matching result with account ID and confidence
     */
    static matchInstitution(institutionName, accounts, customMapping = {}) {
        if (!institutionName || !accounts || Object.keys(accounts).length === 0) {
            return { matched: false, accountId: null, confidence: 0 };
        }

        const normalizedInput = this.normalizeInstitutionName(institutionName);
        
        // Try exact match first
        for (const [accountId, account] of Object.entries(accounts)) {
            const accountInstitution = this.normalizeInstitutionName(account.institution || account.name || '');
            
            if (accountInstitution === normalizedInput) {
                return { matched: true, accountId, confidence: 100, method: 'exact' };
            }
        }

        // Try custom mapping
        const customMatch = this.applyCustomMapping(normalizedInput, accounts, customMapping);
        if (customMatch.matched) {
            return customMatch;
        }

        // Try default mapping
        const defaultMatch = this.applyDefaultMapping(normalizedInput, accounts);
        if (defaultMatch.matched) {
            return defaultMatch;
        }

        // Try fuzzy match
        const fuzzyMatch = this.fuzzyMatchInstitution(normalizedInput, accounts);
        if (fuzzyMatch.matched) {
            return fuzzyMatch;
        }

        return { matched: false, accountId: null, confidence: 0 };
    }

    /**
     * Batch match multiple items to accounts
     * @param {Array} items - Array of recurring items with institutionName
     * @param {Object} accounts - Map of account ID to account data
     * @param {Object} customMapping - User-defined institution mappings
     * @returns {Object} Results with matched and unmatched items
     */
    static batchMatch(items, accounts, customMapping = {}) {
        const matched = [];
        const unmatched = [];

        items.forEach(item => {
            const result = this.matchInstitution(item.institutionName, accounts, customMapping);
            
            if (result.matched && result.confidence >= 70) {
                matched.push({
                    ...item,
                    linkedAccount: result.accountId,
                    matchConfidence: result.confidence,
                    matchMethod: result.method
                });
            } else {
                unmatched.push(item);
            }
        });

        return { matched, unmatched };
    }

    /**
     * Apply custom user-defined mappings
     */
    static applyCustomMapping(normalizedInput, accounts, customMapping) {
        for (const [institutionKey, accountId] of Object.entries(customMapping)) {
            const normalizedKey = this.normalizeInstitutionName(institutionKey);
            
            if (normalizedKey === normalizedInput && accounts[accountId]) {
                return { matched: true, accountId, confidence: 95, method: 'custom' };
            }
        }
        
        return { matched: false, accountId: null, confidence: 0 };
    }

    /**
     * Apply default institution mappings
     */
    static applyDefaultMapping(normalizedInput, accounts) {
        for (const [standardName, aliases] of Object.entries(this.DEFAULT_INSTITUTION_MAPPING)) {
            const normalizedAliases = aliases.map(a => this.normalizeInstitutionName(a));
            
            if (normalizedAliases.includes(normalizedInput)) {
                // Find account with matching institution
                for (const [accountId, account] of Object.entries(accounts)) {
                    const accountInstitution = this.normalizeInstitutionName(account.institution || account.name || '');
                    const accountNameNorm = this.normalizeInstitutionName(account.name || '');
                    
                    // Check if account matches the standard name or any alias
                    if (normalizedAliases.includes(accountInstitution) || 
                        normalizedAliases.includes(accountNameNorm) ||
                        accountInstitution.includes(standardName) ||
                        accountNameNorm.includes(standardName)) {
                        return { matched: true, accountId, confidence: 90, method: 'default' };
                    }
                }
            }
        }
        
        return { matched: false, accountId: null, confidence: 0 };
    }

    /**
     * Fuzzy match using string similarity
     */
    static fuzzyMatchInstitution(normalizedInput, accounts) {
        let bestMatch = { matched: false, accountId: null, confidence: 0 };

        for (const [accountId, account] of Object.entries(accounts)) {
            const accountInstitution = this.normalizeInstitutionName(account.institution || account.name || '');
            
            const similarity = this.calculateSimilarity(normalizedInput, accountInstitution);
            
            if (similarity > bestMatch.confidence && similarity >= 70) {
                bestMatch = { 
                    matched: true, 
                    accountId, 
                    confidence: similarity,
                    method: 'fuzzy'
                };
            }
        }

        return bestMatch;
    }

    /**
     * Normalize institution name for comparison
     */
    static normalizeInstitutionName(name) {
        if (!name) return '';
        
        return name.toLowerCase()
            .trim()
            .replace(/[^\w\s]/g, '') // Remove special characters
            .replace(/\s+/g, ' ') // Normalize spaces
            .replace(/\b(bank|credit union|cu|federal|savings|fsb|n\.?a\.?)\b/g, '') // Remove common suffixes
            .trim();
    }

    /**
     * Calculate string similarity (0-100)
     * Uses a simple Levenshtein-like algorithm
     */
    static calculateSimilarity(str1, str2) {
        if (str1 === str2) return 100;
        if (!str1 || !str2) return 0;

        // Check if one contains the other
        if (str1.includes(str2) || str2.includes(str1)) {
            return 85;
        }

        // Simple word-based matching
        const words1 = str1.split(' ');
        const words2 = str2.split(' ');
        
        let matchingWords = 0;
        for (const word1 of words1) {
            if (words2.some(word2 => word1 === word2 || word1.includes(word2) || word2.includes(word1))) {
                matchingWords++;
            }
        }

        const similarity = (matchingWords / Math.max(words1.length, words2.length)) * 100;
        return Math.round(similarity);
    }

    /**
     * Get all unique institutions from accounts
     */
    static getInstitutionList(accounts) {
        const institutions = new Set();
        
        Object.values(accounts).forEach(account => {
            if (account.institution) {
                institutions.add(account.institution);
            }
        });

        return Array.from(institutions).sort();
    }

    /**
     * Create a suggested mapping based on items and accounts
     */
    static suggestMappings(items, accounts) {
        const suggestions = {};
        const unmatchedInstitutions = new Set();

        items.forEach(item => {
            if (item.institutionName) {
                const match = this.matchInstitution(item.institutionName, accounts);
                
                if (match.matched && match.confidence >= 80) {
                    suggestions[item.institutionName] = {
                        accountId: match.accountId,
                        confidence: match.confidence,
                        method: match.method
                    };
                } else {
                    unmatchedInstitutions.add(item.institutionName);
                }
            }
        });

        return {
            suggestions,
            unmatchedInstitutions: Array.from(unmatchedInstitutions)
        };
    }
}
