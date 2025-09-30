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
            account_id,
            transaction_id,
            category
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
                0.7 // 70% similarity threshold
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
                accountId: transaction.account_id
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

        // Calculate Levenshtein distance
        const distance = this.levenshteinDistance(s1, s2);
        const maxLength = Math.max(s1.length, s2.length);
        const similarity = 1 - (distance / maxLength);

        return similarity >= threshold;
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
}