// CSVImporter.js - Reusable CSV import utility for recurring items
import { parseLocalDate, formatDateForInput } from './DateUtils.js';
import { TRANSACTION_CATEGORIES } from '../constants/categories.js';

export class CSVImporter {
    /**
     * Parse CSV file and extract recurring items
     * @param {File} file - CSV file
     * @returns {Promise<Object>} Parsed data with items and errors
     */
    static async parseCSVFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const result = this.parseCSVText(e.target.result);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Parse CSV text content
     * @param {string} text - CSV text content
     * @returns {Object} Parsed data with items and errors
     */
    static parseCSVText(text) {
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
            throw new Error('CSV file must have header and data rows');
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const data = lines.slice(1).map(line => {
            const values = this.parseCSVLine(line);
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            return row;
        });

        const columnMapping = this.detectColumnMapping(headers);
        const items = [];
        const errors = [];

        data.forEach((row, index) => {
            try {
                const item = this.processRow(row, columnMapping, index + 2); // +2 for header and 0-based index
                if (item) {
                    items.push(item);
                }
            } catch (error) {
                errors.push({
                    row: index + 2,
                    error: error.message,
                    data: row
                });
            }
        });

        return {
            items,
            errors,
            totalRows: data.length,
            columnMapping,
            headers
        };
    }

    /**
     * Parse a CSV line handling quoted values
     * @param {string} line - CSV line
     * @returns {Array} Array of values
     */
    static parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        let i = 0;

        while (i < line.length) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    // Escaped quote
                    current += '"';
                    i += 2;
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                    i++;
                }
            } else if (char === ',' && !inQuotes) {
                // End of field
                result.push(current.trim());
                current = '';
                i++;
            } else {
                current += char;
                i++;
            }
        }
        
        // Add the last field
        result.push(current.trim());
        return result;
    }

    /**
     * Detect column mapping from headers
     * @param {Array} headers - CSV headers
     * @returns {Object} Column mapping
     */
    static detectColumnMapping(headers) {
        const mapping = {};
        
        // Name/Description mapping
        mapping.name = this.findColumn(headers, [
            'name', 'bill', 'description', 'merchant', 'payee', 'title', 'subscription'
        ]);
        
        // Amount mapping
        mapping.amount = this.findColumn(headers, [
            'amount', 'cost', 'price', 'payment', 'total', 'value'
        ]);
        
        // Date mapping (including "Day of Month Due" support)
        mapping.date = this.findColumn(headers, [
            'date', 'due', 'next', 'start', 'occurrence', 'payment_date', 
            'day of month', 'day of month due', 'due day', 'payment day'
        ]);
        
        // Frequency mapping
        mapping.frequency = this.findColumn(headers, [
            'frequency', 'period', 'recurring', 'schedule', 'interval'
        ]);
        
        // Category mapping
        mapping.category = this.findColumn(headers, [
            'category', 'type', 'group', 'classification'
        ]);
        
        // Account mapping
        mapping.account = this.findColumn(headers, [
            'account', 'bank', 'card', 'source'
        ]);
        
        // Institution/Bank Name mapping (more specific patterns first)
        mapping.institution = this.findColumn(headers, [
            'institution name', 'bank name', 'financial institution', 'institution', 'bank'
        ]);

        return mapping;
    }

    /**
     * Find the best matching column for a field
     * @param {Array} headers - Available headers
     * @param {Array} candidates - Candidate column names
     * @returns {string|null} Best matching header
     */
    static findColumn(headers, candidates) {
        // First pass: try exact matches
        for (const candidate of candidates) {
            const exactMatch = headers.find(h => h === candidate);
            if (exactMatch) return exactMatch;
        }
        
        // Second pass: try substring matches, but prefer longer candidates first
        // This ensures "institution name" is checked before "name" or "institution"
        const sortedCandidates = [...candidates].sort((a, b) => b.length - a.length);
        for (const candidate of sortedCandidates) {
            const match = headers.find(h => h.includes(candidate));
            if (match) return match;
        }
        
        return null;
    }

    /**
     * Process a single CSV row into a recurring item
     * @param {Object} row - CSV row data
     * @param {Object} mapping - Column mapping
     * @param {number} rowNumber - Row number for error reporting
     * @returns {Object|null} Processed recurring item
     */
    static processRow(row, mapping, rowNumber) {
        const name = row[mapping.name] || '';
        const amountStr = row[mapping.amount] || '';
        
        if (!name.trim()) {
            throw new Error('Name is required');
        }
        
        const amount = this.parseAmount(amountStr);
        if (!amount || amount <= 0) {
            throw new Error('Valid amount is required');
        }

        // Parse date or day of month
        let nextOccurrence = formatDateForInput(new Date());
        if (mapping.date && row[mapping.date]) {
            const dateValue = row[mapping.date].trim();
            
            // Check if it's just a day number (e.g., "15" for 15th of month)
            if (/^\d{1,2}$/.test(dateValue)) {
                const dayOfMonth = parseInt(dateValue, 10);
                if (dayOfMonth >= 1 && dayOfMonth <= 31) {
                    // Create a date with the specified day in the current or next month
                    const today = new Date();
                    const currentDay = today.getDate();
                    let targetDate = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
                    
                    // If the day has already passed this month, use next month
                    if (dayOfMonth < currentDay) {
                        targetDate = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
                    }
                    
                    nextOccurrence = formatDateForInput(targetDate);
                }
            } else {
                // Try to parse as full date
                const parsedDate = parseLocalDate(dateValue);
                if (parsedDate) {
                    nextOccurrence = formatDateForInput(parsedDate);
                }
            }
        }

        // Parse frequency
        let frequency = 'monthly';
        if (mapping.frequency && row[mapping.frequency]) {
            frequency = this.normalizeFrequency(row[mapping.frequency]);
        }

        // Parse category
        let category = this.suggestCategory(name);
        if (mapping.category && row[mapping.category]) {
            const mappedCategory = this.mapCategory(row[mapping.category]);
            if (mappedCategory) {
                category = mappedCategory;
            }
        }

        return {
            id: `csv-import-${Date.now()}-${rowNumber}`,
            name: name.trim(),
            type: 'expense', // Default to expense, can be changed later
            amount: amount,
            category: category,
            frequency: frequency,
            nextOccurrence: nextOccurrence,
            linkedAccount: row[mapping.account] || '',
            institutionName: row[mapping.institution] ? row[mapping.institution].trim() : '',
            autoPay: false,
            description: `Imported from CSV`,
            status: 'active',
            dataSource: 'csv_import',
            confidence: 90,
            userConfirmed: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    /**
     * Parse amount from string, handling various formats
     * @param {string} amountStr - Amount string
     * @returns {number} Parsed amount
     */
    static parseAmount(amountStr) {
        if (!amountStr) return 0;
        
        // Remove currency symbols, commas, and whitespace
        const cleaned = amountStr.toString()
            .replace(/[$€£¥₹,\s]/g, '')
            .replace(/[()]/g, ''); // Remove parentheses
        
        const amount = parseFloat(cleaned);
        return isNaN(amount) ? 0 : Math.abs(amount);
    }

    /**
     * Normalize frequency values
     * @param {string} frequency - Raw frequency value
     * @returns {string} Normalized frequency
     */
    static normalizeFrequency(frequency) {
        const freq = frequency.toLowerCase().trim();
        
        const mapping = {
            'week': 'weekly',
            'weekly': 'weekly',
            'biweekly': 'bi-weekly',
            'bi-weekly': 'bi-weekly',
            'bimonthly': 'bi-weekly',
            'month': 'monthly',
            'monthly': 'monthly',
            'quarter': 'quarterly',
            'quarterly': 'quarterly',
            'year': 'annually',
            'yearly': 'annually',
            'annual': 'annually',
            'annually': 'annually'
        };

        return mapping[freq] || 'monthly';
    }

    /**
     * Map category from various formats to standard categories
     * @param {string} category - Raw category
     * @returns {string|null} Mapped category
     */
    static mapCategory(category) {
        const cat = category.toLowerCase().trim();
        
        // Simple mapping - could be enhanced with more sophisticated matching
        const mapping = {
            'subscription': 'Subscriptions',
            'subscriptions': 'Subscriptions',
            'streaming': 'Subscriptions',
            'entertainment': 'Entertainment',
            'utility': 'Bills & Utilities',
            'utilities': 'Bills & Utilities',
            'bill': 'Bills & Utilities',
            'bills': 'Bills & Utilities',
            'rent': 'Bills & Utilities',
            'insurance': 'Bills & Utilities',
            'food': 'Food & Dining',
            'dining': 'Food & Dining',
            'grocery': 'Food & Dining',
            'groceries': 'Food & Dining',
            'transport': 'Transportation',
            'transportation': 'Transportation',
            'gas': 'Transportation',
            'fuel': 'Transportation',
            'health': 'Healthcare',
            'healthcare': 'Healthcare',
            'medical': 'Healthcare',
            'fitness': 'Health & Fitness',
            'gym': 'Health & Fitness',
            'shopping': 'Shopping',
            'education': 'Education',
            'travel': 'Travel',
            'income': 'Income',
            'salary': 'Income',
            'wage': 'Income'
        };

        return mapping[cat] || null;
    }

    /**
     * Suggest category based on item name
     * @param {string} name - Item name
     * @returns {string} Suggested category
     */
    static suggestCategory(name) {
        const nameLower = name.toLowerCase();
        
        // Subscription services
        if (nameLower.includes('netflix') || nameLower.includes('spotify') || 
            nameLower.includes('amazon prime') || nameLower.includes('hulu') ||
            nameLower.includes('disney') || nameLower.includes('youtube')) {
            return 'Subscriptions';
        }
        
        // Utilities
        if (nameLower.includes('electric') || nameLower.includes('gas') || 
            nameLower.includes('water') || nameLower.includes('internet') ||
            nameLower.includes('phone') || nameLower.includes('utility')) {
            return 'Bills & Utilities';
        }
        
        // Insurance
        if (nameLower.includes('insurance') || nameLower.includes('policy')) {
            return 'Bills & Utilities';
        }
        
        // Rent/Mortgage
        if (nameLower.includes('rent') || nameLower.includes('mortgage') || 
            nameLower.includes('apartment') || nameLower.includes('housing')) {
            return 'Bills & Utilities';
        }
        
        // Income
        if (nameLower.includes('salary') || nameLower.includes('wage') || 
            nameLower.includes('income') || nameLower.includes('pay')) {
            return 'Income';
        }
        
        // Default
        return 'Bills & Utilities';
    }

    /**
     * Validate imported items
     * @param {Array} items - Imported items
     * @returns {Object} Validation results
     */
    static validateItems(items) {
        const valid = [];
        const invalid = [];
        
        items.forEach((item, index) => {
            const errors = [];
            
            if (!item.name || !item.name.trim()) {
                errors.push('Name is required');
            }
            
            if (!item.amount || item.amount <= 0) {
                errors.push('Valid amount is required');
            }
            
            if (!TRANSACTION_CATEGORIES.includes(item.category)) {
                errors.push('Invalid category');
            }
            
            if (errors.length > 0) {
                invalid.push({
                    index,
                    item,
                    errors
                });
            } else {
                valid.push(item);
            }
        });
        
        return { valid, invalid };
    }
}