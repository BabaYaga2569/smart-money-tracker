// PlaidIntegrationManager.js - Auto-payment detection and bill matching
import { NotificationManager } from './NotificationManager.js';

export class PlaidIntegrationManager {
    static isEnabled = false;
    static transactionQueue = [];
    static billMatchingCallbacks = [];

    /**
     * Initialize Plaid integration
     * @param {Object} config - Configuration options
     */
    static async initialize(config = {}) {
        console.log('Initializing Plaid Integration Manager...');
        
        // Placeholder for actual Plaid SDK initialization
        // In a real implementation, this would initialize the Plaid Link SDK
        this.isEnabled = config.enabled || false;
        this.transactionTolerance = config.transactionTolerance || 0.05; // 5% tolerance
        this.autoMarkPaid = config.autoMarkPaid || true;
        
        if (this.isEnabled) {
            console.log('Plaid integration enabled - Auto-payment detection active');
        } else {
            console.log('Plaid integration disabled - Using placeholder functionality');
        }
    }

    /**
     * Process incoming transaction from Plaid webhook
     * @param {Object} transaction - Transaction data from Plaid
     */
    static async processTransaction(transaction) {
        if (!this.isEnabled) {
            console.log('Plaid integration disabled, skipping transaction processing');
            return;
        }

        const {
            amount,
            merchant_name,
            date,
            transaction_id
        } = transaction;

        // Only process outgoing payments (negative amounts in Plaid)
        if (amount >= 0) {
            console.log('Skipping incoming transaction:', transaction_id);
            return;
        }

        // Check if this transaction has already been used to pay a bill
        const allBills = await this.getCurrentBills();
        const existingMatch = this.checkTransactionAlreadyUsed(transaction_id, allBills);
        if (existingMatch) {
            console.log(`Transaction ${transaction_id} already used to pay ${existingMatch.name}`);
            return;
        }

        console.log('Processing potential bill payment transaction:', transaction_id);

        // Find matching bills using smart matching algorithm
        const matchingBills = await this.findMatchingBills({
            amount: Math.abs(amount),
            merchantName: merchant_name,
            date: date,
            tolerance: this.transactionTolerance
        });

        // Process matches
        for (const bill of matchingBills) {
            const paymentCheck = this.canPayBill(bill);
            if (paymentCheck.canPay) {
                await this.autoMarkBillAsPaid(bill, transaction);
                break; // Only match one bill per transaction
            } else {
                console.log(`Cannot pay ${bill.name}: ${paymentCheck.reason}`);
            }
        }
    }

    /**
     * Find bills that match a transaction using fuzzy matching
     * @param {Object} transactionData - Transaction matching criteria
     * @returns {Array} Array of matching bills
     */
    static async findMatchingBills({ amount, merchantName, date, tolerance = 0.05 }) {
        // Get current bills from the application
        const allBills = await this.getCurrentBills();
        
        const matchingBills = allBills.filter(bill => {
            // Skip already paid bills
            if (bill.status === 'paid' || bill.isPaid) {
                return false;
            }

            // Amount matching with tolerance
            const billAmount = parseFloat(bill.amount);
            const amountDiff = Math.abs(billAmount - amount);
            const amountMatch = amountDiff <= (billAmount * tolerance);

            // Merchant name fuzzy matching
            const nameMatch = this.fuzzyMatch(
                bill.name || '',
                merchantName || '',
                0.65 // 65% similarity threshold for better matching
            );

            // Date proximity matching (within 5 days of due date)
            const transactionDate = new Date(date);
            const dueDate = new Date(bill.nextDueDate || bill.dueDate);
            const daysDiff = Math.abs((transactionDate - dueDate) / (1000 * 60 * 60 * 24));
            const dateMatch = daysDiff <= 5;

            const match = amountMatch && nameMatch && dateMatch;
            
            if (match) {
                console.log(`Match found: ${bill.name} - Amount: ${amountMatch}, Name: ${nameMatch}, Date: ${dateMatch}`);
            }

            return match;
        });

        return matchingBills;
    }

    /**
     * Automatically mark a bill as paid based on transaction
     * @param {Object} bill - Bill object
     * @param {Object} transaction - Transaction object
     */
    static async autoMarkBillAsPaid(bill, transaction) {
        try {
            console.log(`Auto-marking bill as paid: ${bill.name}`);

            // Create payment data
            const paymentData = {
                paidDate: new Date(transaction.date),
                amount: Math.abs(transaction.amount),
                method: 'auto-detected',
                transactionId: transaction.transaction_id,
                source: 'plaid',
                accountId: transaction.account_id,
                merchantName: transaction.merchant_name || transaction.name
            };

            // Call bill payment processing (this would be injected by the application)
            if (this.billPaymentProcessor) {
                await this.billPaymentProcessor(bill.id || bill.name, paymentData);
            }

            // Show notification to user
            NotificationManager.showAutoPaymentDetected(bill, transaction);

            console.log(`Successfully auto-marked ${bill.name} as paid`);
        } catch (error) {
            console.error('Error auto-marking bill as paid:', error);
            NotificationManager.showError(
                `Failed to auto-mark ${bill.name} as paid`,
                error
            );
        }
    }

    /**
     * Fuzzy string matching using Levenshtein distance
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @param {number} threshold - Similarity threshold (0-1)
     * @returns {boolean} Whether strings match above threshold
     */
    static fuzzyMatch(str1, str2, threshold = 0.8) {
        if (!str1 || !str2) return false;

        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();

        if (s1 === s2) return true;

        // Check if one string contains the other
        if (s1.includes(s2) || s2.includes(s1)) return true;

        // Tokenize into words for partial word matching
        const words1 = s1.split(/\s+/).filter(w => w.length > 0);
        const words2 = s2.split(/\s+/).filter(w => w.length > 0);

        // Enhanced partial matching: check if any significant word (3+ chars) 
        // from one string has a match in the other
        let significantMatches = 0;
        let totalSignificantWords = 0;

        for (const word1 of words1) {
            if (word1.length >= 3) {
                totalSignificantWords++;
                let foundMatch = false;
                
                for (const word2 of words2) {
                    if (word2.length >= 3) {
                        // Direct word-level substring match (e.g., "geico" in "geico")
                        if (word1.includes(word2) || word2.includes(word1)) {
                            foundMatch = true;
                            break;
                        }
                        
                        // Check for exact word match after normalization
                        if (word1 === word2) {
                            foundMatch = true;
                            break;
                        }
                        
                        // Check for common prefix (helps match 'geico' variations)
                        const minLength = Math.min(word1.length, word2.length);
                        if (minLength >= 4) {
                            const prefix1 = word1.substring(0, 4);
                            const prefix2 = word2.substring(0, 4);
                            if (prefix1 === prefix2) {
                                // If first 4 chars match, check overall similarity
                                const wordDistance = this.levenshteinDistance(word1, word2);
                                const maxWordLength = Math.max(word1.length, word2.length);
                                const wordSimilarity = 1 - (wordDistance / maxWordLength);
                                // Accept match with 60% similarity for matching prefix
                                if (wordSimilarity >= 0.6) {
                                    foundMatch = true;
                                    break;
                                }
                            }
                        }
                        
                        // Check for close word similarity (helps with typos)
                        const wordDistance = this.levenshteinDistance(word1, word2);
                        const maxWordLength = Math.max(word1.length, word2.length);
                        const wordSimilarity = 1 - (wordDistance / maxWordLength);
                        // Accept 70% word similarity
                        if (wordSimilarity >= 0.70) {
                            foundMatch = true;
                            break;
                        }
                    }
                }
                
                if (foundMatch) {
                    significantMatches++;
                }
            }
        }

        // If at least one significant word matches, consider it a match
        // This handles cases like "Geico SXS" matching "Geico Insurance"
        if (totalSignificantWords > 0 && significantMatches > 0) {
            return true;
        }

        // Fallback: Calculate overall Levenshtein distance
        const distance = this.levenshteinDistance(s1, s2);
        const maxLength = Math.max(s1.length, s2.length);
        const similarity = 1 - (distance / maxLength);

        // Use the minimum of the provided threshold and 0.6 for lenient matching
        return similarity >= Math.min(threshold, 0.6);
    }

    /**
     * Calculate Levenshtein distance between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Edit distance
     */
    static levenshteinDistance(str1, str2) {
        const matrix = Array(str2.length + 1).fill(null).map(() => 
            Array(str1.length + 1).fill(null)
        );

        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,     // deletion
                    matrix[j - 1][i] + 1,     // insertion
                    matrix[j - 1][i - 1] + indicator // substitution
                );
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Register bill payment processor callback
     * @param {Function} processor - Function to process bill payments
     */
    static setBillPaymentProcessor(processor) {
        this.billPaymentProcessor = processor;
    }

    /**
     * Register bills provider callback
     * @param {Function} provider - Function to get current bills
     */
    static setBillsProvider(provider) {
        this.billsProvider = provider;
    }

    /**
     * Get current bills from the application
     * @returns {Array} Current bills array
     */
    static async getCurrentBills() {
        if (this.billsProvider) {
            return await this.billsProvider();
        }
        return [];
    }

    /**
     * Simulate Plaid transaction for testing
     * @param {Object} transactionData - Mock transaction data
     */
    static async simulateTransaction(transactionData) {
        console.log('Simulating Plaid transaction:', transactionData);
        
        const mockTransaction = {
            transaction_id: `mock_${Date.now()}`,
            account_id: 'mock_account',
            amount: -Math.abs(transactionData.amount), // Negative for outgoing
            merchant_name: transactionData.merchantName,
            date: transactionData.date || new Date().toISOString().split('T')[0],
            category: ['Payment', 'Bills'],
            ...transactionData
        };

        await this.processTransaction(mockTransaction);
    }

    /**
     * Enable/disable auto-payment detection
     * @param {boolean} enabled - Whether to enable auto-payment detection  
     */
    static setAutoPaymentEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`Plaid auto-payment detection ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get integration status
     * @returns {Object} Status information
     */
    static getStatus() {
        return {
            enabled: this.isEnabled,
            transactionTolerance: this.transactionTolerance,
            autoMarkPaid: this.autoMarkPaid,
            queuedTransactions: this.transactionQueue.length
        };
    }

    /**
     * Check if a bill can be paid (duplicate prevention)
     * @param {Object} bill - Bill to check
     * @returns {Object} { canPay: boolean, reason: string }
     */
    static canPayBill(bill) {
        // Import logic from RecurringBillManager if available
        if (typeof window !== 'undefined' && window.RecurringBillManager) {
            return window.RecurringBillManager.canPayBill(bill);
        }
        
        // Fallback: basic check
        if (bill.isPaid || bill.status === 'paid') {
            return {
                canPay: false,
                reason: 'Bill is already marked as paid for this cycle'
            };
        }
        
        return { canPay: true, reason: null };
    }

    /**
     * Check if a transaction has already been used to pay a bill
     * @param {string} transactionId - Transaction ID
     * @param {Array} bills - Array of bills
     * @returns {Object|null} Bill paid by this transaction, or null
     */
    static checkTransactionAlreadyUsed(transactionId, bills) {
        if (!transactionId) return null;
        
        return bills.find(bill => {
            const paymentHistory = bill.paymentHistory || [];
            return paymentHistory.some(payment => 
                payment.transactionId === transactionId
            );
        });
    }

    /**
     * Fetch recent transactions from Plaid and match with bills
     * @param {string} accessToken - Plaid access token
     * @param {Object} options - Options for date range and processing
     * @returns {Object} Results with matched bills and transactions
     */
    static async fetchAndMatchTransactions(accessToken, options = {}) {
        try {
            const { 
                startDate = null, 
                endDate = null,
                autoMarkPaid = this.autoMarkPaid 
            } = options;

            console.log('Fetching transactions from Plaid...');

            // Determine backend URL - try production first, fallback to local
            const backendUrl = window.location.hostname === 'localhost' 
                ? 'http://localhost:5000' 
                : 'https://smart-money-tracker-09ks.onrender.com';

            // Fetch transactions from backend API
            const response = await fetch(`${backendUrl}/api/plaid/get_transactions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    access_token: accessToken,
                    start_date: startDate,
                    end_date: endDate
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                // Enhanced error handling with more specific messages
                const errorMessage = data.error || `Failed to fetch transactions: ${response.statusText}`;
                throw new Error(errorMessage);
            }

            const transactions = data.transactions || [];

            console.log(`Fetched ${transactions.length} transactions from Plaid`);

            // Process each transaction and find matches
            const matches = [];
            const processedTransactionIds = new Set();

            for (const transaction of transactions) {
                // Only process negative amounts (outgoing payments)
                if (transaction.amount <= 0) {
                    continue;
                }

                // Check if already processed
                if (processedTransactionIds.has(transaction.transaction_id)) {
                    continue;
                }

                // Find matching bills
                const matchingBills = await this.findMatchingBills({
                    amount: transaction.amount,
                    merchantName: transaction.merchant_name || transaction.name,
                    date: transaction.date,
                    tolerance: this.transactionTolerance
                });

                if (matchingBills.length > 0) {
                    for (const bill of matchingBills) {
                        const paymentCheck = this.canPayBill(bill);
                        
                        if (paymentCheck.canPay) {
                            matches.push({
                                bill: bill,
                                transaction: transaction,
                                confidence: this.calculateMatchConfidence(bill, transaction)
                            });

                            // Auto-mark if enabled
                            if (autoMarkPaid) {
                                await this.autoMarkBillAsPaid(bill, transaction);
                            }

                            processedTransactionIds.add(transaction.transaction_id);
                            break; // Only match one bill per transaction
                        }
                    }
                }
            }

            console.log(`Found ${matches.length} bill-transaction matches`);

            return {
                success: true,
                matches: matches,
                totalTransactions: transactions.length,
                processedCount: matches.length
            };

        } catch (error) {
            console.error('Error fetching and matching transactions:', error);
            
            // Provide more user-friendly error messages
            let errorMessage = error.message;
            
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Unable to connect to the server. Please check your internet connection.';
            } else if (error.message.includes('NetworkError') || error.message.includes('network')) {
                errorMessage = 'Network error. Please check your connection and try again.';
            }
            
            return {
                success: false,
                error: errorMessage,
                matches: [],
                totalTransactions: 0,
                processedCount: 0
            };
        }
    }

    /**
     * Calculate confidence score for a bill-transaction match
     * @param {Object} bill - Bill object
     * @param {Object} transaction - Transaction object
     * @returns {number} Confidence score (0-100)
     */
    static calculateMatchConfidence(bill, transaction) {
        let confidence = 0;

        // Amount match (40 points)
        const billAmount = parseFloat(bill.amount);
        const transactionAmount = transaction.amount;
        const amountDiff = Math.abs(billAmount - transactionAmount);
        const amountTolerance = billAmount * this.transactionTolerance;
        
        if (amountDiff === 0) {
            confidence += 40;
        } else if (amountDiff <= amountTolerance) {
            confidence += 40 * (1 - (amountDiff / amountTolerance));
        }

        // Name match (40 points)
        const merchantName = transaction.merchant_name || transaction.name || '';
        const billName = bill.name || '';
        
        if (merchantName && billName) {
            const s1 = merchantName.toLowerCase().trim();
            const s2 = billName.toLowerCase().trim();
            
            if (s1 === s2) {
                confidence += 40;
            } else if (s1.includes(s2) || s2.includes(s1)) {
                confidence += 35;
            } else {
                const distance = this.levenshteinDistance(s1, s2);
                const maxLength = Math.max(s1.length, s2.length);
                const similarity = 1 - (distance / maxLength);
                confidence += 40 * similarity;
            }
        }

        // Date match (20 points)
        const transactionDate = new Date(transaction.date);
        const dueDate = new Date(bill.nextDueDate || bill.dueDate);
        const daysDiff = Math.abs((transactionDate - dueDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 0) {
            confidence += 20;
        } else if (daysDiff <= 5) {
            confidence += 20 * (1 - (daysDiff / 5));
        }

        return Math.round(confidence);
    }

    /**
     * Manual refresh - fetch and match transactions for a specific access token
     * @param {string} accessToken - Plaid access token
     * @returns {Object} Matching results
     */
    static async refreshBillMatching(accessToken) {
        console.log('Manual bill matching refresh triggered');
        
        // Fetch last 30 days of transactions
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const result = await this.fetchAndMatchTransactions(accessToken, {
            startDate,
            endDate,
            autoMarkPaid: this.autoMarkPaid
        });

        if (result.success) {
            NotificationManager.showSuccess(
                `Bill matching complete: ${result.processedCount} bills matched from ${result.totalTransactions} transactions`
            );
        } else {
            NotificationManager.showError(
                'Bill matching failed',
                result.error
            );
        }

        return result;
    }
}