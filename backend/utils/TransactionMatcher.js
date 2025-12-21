/**
 * TransactionMatcher.js
 * 
 * Multi-strategy matching engine for linking transactions to bills
 * Implements 4 strategies with priority ordering:
 * 1. User-defined rules (highest priority, 0.95 confidence)
 * 2. Payment pattern matching (Zelle/Venmo/etc, 0.90 confidence)
 * 3. Merchant aliases (existing system, 0.85 confidence)
 * 4. Fuzzy name matching (fallback, 0.67-0.80 confidence)
 * 
 * Usage:
 *   const matcher = new TransactionMatcher(db, userId);
 *   await matcher.initialize();
 *   const match = await matcher.findMatch(bill, transactions);
 */

import { PaymentPatternMatcher } from './PaymentPatternMatcher.js';

export class TransactionMatcher {
  constructor(db, userId) {
    this.db = db;
    this.userId = userId;
    this.paymentPatternMatcher = new PaymentPatternMatcher();
    this.userRules = [];
    this.merchantAliases = null;
    this.initialized = false;
  }

  /**
   * Initialize the matcher by loading rules and aliases
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load user-defined payment rules
      await this.loadPaymentRules();
      
      // Load merchant aliases
      await this.loadMerchantAliases();
      
      this.initialized = true;
      console.log('✅ TransactionMatcher initialized:', {
        rules: this.userRules.length,
        merchantProfiles: this.merchantAliases ? Object.keys(this.merchantAliases.merchants || {}).length : 0
      });
    } catch (error) {
      console.error('❌ Error initializing TransactionMatcher:', error);
      throw error;
    }
  }

  /**
   * Load user-defined payment rules from Firestore
   */
  async loadPaymentRules() {
    try {
      const rulesSnapshot = await this.db
        .collection('users')
        .doc(this.userId)
        .collection('paymentRules')
        .where('enabled', '==', true)
        .get();

      this.userRules = rulesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`   Loaded ${this.userRules.length} payment rules`);
    } catch (error) {
      console.error('   ⚠️  Error loading payment rules:', error.message);
      this.userRules = [];
    }
  }

  /**
   * Load merchant aliases from aiLearning collection
   */
  async loadMerchantAliases() {
    try {
      const aliasesDoc = await this.db
        .collection('users')
        .doc(this.userId)
        .collection('aiLearning')
        .doc('merchantAliases')
        .get();

      if (aliasesDoc.exists) {
        this.merchantAliases = aliasesDoc.data();
        console.log(`   Loaded merchant aliases`);
      } else {
        console.log('   ⚠️  No merchant aliases found');
        this.merchantAliases = null;
      }
    } catch (error) {
      console.error('   ⚠️  Error loading merchant aliases:', error.message);
      this.merchantAliases = null;
    }
  }

  /**
   * Find best matching transaction for a bill using all strategies
   * @param {Object} bill - Bill object
   * @param {Array} transactions - Array of transaction objects
   * @returns {Object|null} - Match result with transaction, confidence, and strategy
   */
  async findMatch(bill, transactions) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Try each strategy in priority order
    let match = null;

    // Strategy 1: User-defined rules (highest priority)
    match = this.matchByUserRule(bill, transactions);
    if (match && match.confidence >= 0.70) {
      return match;
    }

    // Strategy 2: Payment pattern matching
    match = this.matchByPaymentPattern(bill, transactions);
    if (match && match.confidence >= 0.70) {
      return match;
    }

    // Strategy 3: Merchant aliases
    match = this.matchByMerchantAlias(bill, transactions);
    if (match && match.confidence >= 0.70) {
      return match;
    }

    // Strategy 4: Fuzzy name matching (fallback)
    match = this.matchByFuzzyName(bill, transactions);
    if (match && match.confidence >= 0.70) {
      return match;
    }

    return null;
  }

  /**
   * Strategy 1: Match using user-defined rules
   */
  matchByUserRule(bill, transactions) {
    const billName = (bill.name || '').toLowerCase();
    const billAmount = Math.abs(bill.amount || 0);
    const billDate = this.normalizeToDate(bill.paidDate || bill.dueDate);

    // Find applicable rules
    const applicableRules = this.userRules.filter(rule => {
      // Check if rule applies to this bill
      if (rule.billId && rule.billId !== bill.id) return false;
      if (rule.billName && !this.fuzzyMatch(billName, rule.billName.toLowerCase())) return false;
      return true;
    });

    let bestMatch = null;
    let bestScore = 0;

    for (const rule of applicableRules) {
      for (const tx of transactions) {
        // Skip already linked transactions
        if (tx.data && tx.data.linkedEventId) continue;

        const score = this.evaluateRuleMatch(rule, tx, bill, billAmount, billDate);
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            transaction: tx,
            confidence: 0.95, // User rules have highest confidence
            strategy: 'user_rule',
            ruleId: rule.id,
            ruleName: rule.billName || rule.billId,
            matchScore: score,
            details: {
              rule: rule,
              criteriaMatched: this.getMatchedCriteria(rule, tx, bill, billAmount, billDate)
            }
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Evaluate how well a transaction matches a rule's criteria
   */
  evaluateRuleMatch(rule, tx, bill, billAmount, billDate) {
    const criteria = rule.matchCriteria || {};
    let score = 0;
    let totalCriteria = 0;

    const txName = (tx.data.merchant_name || tx.data.name || '').toLowerCase();
    const txAmount = Math.abs(tx.data.amount || 0);
    const txDate = this.normalizeToDate(tx.data.date);

    // Check amount match
    if (criteria.amountExact !== undefined) {
      totalCriteria++;
      const tolerance = criteria.amountTolerance || 0.50;
      if (this.amountsMatch(txAmount, criteria.amountExact, tolerance)) {
        score++;
      }
    } else if (criteria.amountExact === undefined) {
      // No amount criteria, check against bill amount
      totalCriteria++;
      if (this.amountsMatch(txAmount, billAmount, 0.50)) {
        score++;
      }
    }

    // Check required keywords
    if (criteria.requiredKeywords && criteria.requiredKeywords.length > 0) {
      totalCriteria++;
      const allKeywordsMatch = criteria.requiredKeywords.every(keyword =>
        txName.includes(keyword.toLowerCase())
      );
      if (allKeywordsMatch) {
        score++;
      }
    }

    // Check optional keywords (bonus points)
    if (criteria.optionalKeywords && criteria.optionalKeywords.length > 0) {
      const matchedOptional = criteria.optionalKeywords.filter(keyword =>
        txName.includes(keyword.toLowerCase())
      ).length;
      if (matchedOptional > 0) {
        score += 0.5;
        totalCriteria += 0.5;
      }
    }

    // Check transaction type
    if (criteria.transactionTypes && criteria.transactionTypes.length > 0) {
      totalCriteria++;
      const paymentInfo = this.paymentPatternMatcher.extractPaymentInfo(tx.data);
      if (paymentInfo && criteria.transactionTypes.includes(paymentInfo.paymentType)) {
        score++;
      }
    }

    // Check date window
    if (criteria.dateWindow && txDate && billDate) {
      totalCriteria++;
      const daysBefore = criteria.dateWindow.daysBefore || 3;
      const daysAfter = criteria.dateWindow.daysAfter || 5;
      
      if (this.isWithinDateWindow(txDate, billDate, daysBefore, daysAfter)) {
        score++;
      }
    }

    return totalCriteria > 0 ? score / totalCriteria : 0;
  }

  /**
   * Get list of criteria that matched
   */
  getMatchedCriteria(rule, tx, bill, billAmount, billDate) {
    const criteria = rule.matchCriteria || {};
    const matched = [];

    const txName = (tx.data.merchant_name || tx.data.name || '').toLowerCase();
    const txAmount = Math.abs(tx.data.amount || 0);
    const txDate = this.normalizeToDate(tx.data.date);

    if (criteria.amountExact !== undefined && this.amountsMatch(txAmount, criteria.amountExact, criteria.amountTolerance || 0.50)) {
      matched.push('amount');
    }

    if (criteria.requiredKeywords && criteria.requiredKeywords.length > 0) {
      const allMatch = criteria.requiredKeywords.every(kw => txName.includes(kw.toLowerCase()));
      if (allMatch) matched.push('required_keywords');
    }

    if (criteria.optionalKeywords && criteria.optionalKeywords.length > 0) {
      const someMatch = criteria.optionalKeywords.some(kw => txName.includes(kw.toLowerCase()));
      if (someMatch) matched.push('optional_keywords');
    }

    if (criteria.transactionTypes && criteria.transactionTypes.length > 0) {
      const paymentInfo = this.paymentPatternMatcher.extractPaymentInfo(tx.data);
      if (paymentInfo && criteria.transactionTypes.includes(paymentInfo.paymentType)) {
        matched.push('transaction_type');
      }
    }

    if (criteria.dateWindow && txDate && billDate) {
      if (this.isWithinDateWindow(txDate, billDate, criteria.dateWindow.daysBefore || 3, criteria.dateWindow.daysAfter || 5)) {
        matched.push('date_window');
      }
    }

    return matched;
  }

  /**
   * Strategy 2: Match using payment pattern recognition
   */
  matchByPaymentPattern(bill, transactions) {
    const billName = (bill.name || '').toLowerCase();
    const billAmount = Math.abs(bill.amount || 0);
    const billDate = this.normalizeToDate(bill.paidDate || bill.dueDate);

    let bestMatch = null;
    let bestScore = 0;

    for (const tx of transactions) {
      // Skip already linked transactions
      if (tx.data && tx.data.linkedEventId) continue;

      const txAmount = Math.abs(tx.data.amount || 0);
      const txDate = this.normalizeToDate(tx.data.date);

      // Check if it's a P2P payment
      const paymentInfo = this.paymentPatternMatcher.extractPaymentInfo(tx.data);
      
      if (!paymentInfo) continue;

      // Check amount match (required)
      if (!this.amountsMatch(billAmount, txAmount, 0.50)) continue;

      // Check date match (if we have dates)
      if (billDate && txDate) {
        if (!this.isWithinDays(billDate, txDate, 5)) continue;
      }

      // Calculate name similarity using recipient
      const nameSimilarity = this.paymentPatternMatcher.matchToBill(paymentInfo, bill);

      if (nameSimilarity > bestScore) {
        bestScore = nameSimilarity;
        
        const amountScore = this.amountsMatch(billAmount, txAmount, 0.01) ? 1.0 : 0.8;
        const dateScore = billDate && txDate && this.isWithinDays(billDate, txDate, 1) ? 1.0 : 0.8;
        
        const confidence = Math.min(0.90, (nameSimilarity * 0.5) + (amountScore * 0.3) + (dateScore * 0.2));

        bestMatch = {
          transaction: tx,
          confidence: confidence,
          strategy: 'payment_pattern',
          paymentType: paymentInfo.paymentType,
          recipient: paymentInfo.recipient,
          scores: {
            name: nameSimilarity,
            amount: amountScore,
            date: dateScore
          }
        };
      }
    }

    return bestMatch;
  }

  /**
   * Strategy 3: Match using merchant aliases (existing system)
   */
  matchByMerchantAlias(bill, transactions) {
    const billName = (bill.name || '').toLowerCase();
    const billAliases = bill.merchantNames || [billName];
    const billAmount = Math.abs(bill.amount || 0);
    const billDate = this.normalizeToDate(bill.paidDate || bill.dueDate);

    let bestMatch = null;
    let bestScore = 0;

    for (const tx of transactions) {
      // Skip already linked transactions
      if (tx.data && tx.data.linkedEventId) continue;

      const txName = (tx.data.merchant_name || tx.data.name || '').toLowerCase();
      const txAmount = Math.abs(tx.data.amount || 0);
      const txDate = this.normalizeToDate(tx.data.date);

      // Check amount match (required)
      if (!this.amountsMatch(billAmount, txAmount, 0.50)) continue;

      // Check date match (if we have dates)
      if (billDate && txDate) {
        if (!this.isWithinDays(billDate, txDate, 3)) continue;
      }

      // Calculate name similarity
      let nameSimilarity = 0;

      // Check against bill name directly
      nameSimilarity = Math.max(nameSimilarity, this.fuzzyMatch(billName, txName));

      // Check against bill aliases
      for (const alias of billAliases) {
        nameSimilarity = Math.max(nameSimilarity, this.fuzzyMatch(alias, txName));
      }

      // Check against merchant aliases database
      if (this.merchantAliases && this.merchantAliases.merchants) {
        for (const [, merchant] of Object.entries(this.merchantAliases.merchants)) {
          if (merchant.aliases) {
            for (const alias of merchant.aliases) {
              if (this.fuzzyMatch(alias, billName) > 0.7 || 
                  billAliases.some(ba => this.fuzzyMatch(alias, ba) > 0.7)) {
                nameSimilarity = Math.max(nameSimilarity, this.fuzzyMatch(merchant.canonicalName, txName));
                for (const txAlias of merchant.aliases) {
                  nameSimilarity = Math.max(nameSimilarity, this.fuzzyMatch(txAlias, txName));
                }
              }
            }
          }
        }
      }

      if (nameSimilarity > bestScore) {
        bestScore = nameSimilarity;
        
        const amountScore = this.amountsMatch(billAmount, txAmount, 0.01) ? 1.0 : 0.8;
        const dateScore = billDate && txDate && this.isWithinDays(billDate, txDate, 1) ? 1.0 : 0.8;
        
        const confidence = Math.min(0.85, (nameSimilarity * 0.5) + (amountScore * 0.3) + (dateScore * 0.2));

        bestMatch = {
          transaction: tx,
          confidence: confidence,
          strategy: 'merchant_alias',
          scores: {
            name: nameSimilarity,
            amount: amountScore,
            date: dateScore
          }
        };
      }
    }

    return bestMatch;
  }

  /**
   * Strategy 4: Match using fuzzy name matching (fallback)
   */
  matchByFuzzyName(bill, transactions) {
    const billName = (bill.name || '').toLowerCase();
    const billAmount = Math.abs(bill.amount || 0);
    const billDate = this.normalizeToDate(bill.paidDate || bill.dueDate);

    let bestMatch = null;
    let bestScore = 0;

    for (const tx of transactions) {
      // Skip already linked transactions
      if (tx.data && tx.data.linkedEventId) continue;

      const txName = (tx.data.merchant_name || tx.data.name || '').toLowerCase();
      const txAmount = Math.abs(tx.data.amount || 0);
      const txDate = this.normalizeToDate(tx.data.date);

      // Check amount match (required)
      if (!this.amountsMatch(billAmount, txAmount, 0.50)) continue;

      // Check date match (if we have dates)
      if (billDate && txDate) {
        if (!this.isWithinDays(billDate, txDate, 3)) continue;
      }

      // Calculate name similarity
      const nameSimilarity = this.fuzzyMatch(billName, txName);

      if (nameSimilarity > bestScore) {
        bestScore = nameSimilarity;
        
        const amountScore = this.amountsMatch(billAmount, txAmount, 0.01) ? 1.0 : 0.8;
        const dateScore = billDate && txDate && this.isWithinDays(billDate, txDate, 1) ? 1.0 : 0.8;
        
        const confidence = (nameSimilarity * 0.5) + (amountScore * 0.3) + (dateScore * 0.2);

        bestMatch = {
          transaction: tx,
          confidence: confidence,
          strategy: 'fuzzy_match',
          scores: {
            name: nameSimilarity,
            amount: amountScore,
            date: dateScore
          }
        };
      }
    }

    return bestMatch;
  }

  // ========== Helper Methods ==========

  /**
   * Fuzzy match two strings (Levenshtein-based similarity)
   */
  fuzzyMatch(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    // Levenshtein distance
    const matrix = Array(s2.length + 1).fill(null).map(() => 
      Array(s1.length + 1).fill(null)
    );
    
    for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= s2.length; j++) {
      for (let i = 1; i <= s1.length; i++) {
        const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    const distance = matrix[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    
    return (maxLength - distance) / maxLength;
  }

  /**
   * Normalize date to Date object
   */
  normalizeToDate(date) {
    if (!date) return null;
    
    if (date._seconds !== undefined) {
      return new Date(date._seconds * 1000);
    }
    
    if (date.toDate && typeof date.toDate === 'function') {
      return date.toDate();
    }
    
    if (date instanceof Date) {
      return date;
    }
    
    if (typeof date === 'string') {
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    
    return null;
  }

  /**
   * Check if dates are within N days
   */
  isWithinDays(date1, date2, days) {
    const d1 = this.normalizeToDate(date1);
    const d2 = this.normalizeToDate(date2);
    
    if (!d1 || !d2) return false;
    
    const diffMs = Math.abs(d1 - d2);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    return diffDays <= days;
  }

  /**
   * Check if date is within specific date window
   */
  isWithinDateWindow(txDate, billDate, daysBefore, daysAfter) {
    const tx = this.normalizeToDate(txDate);
    const bill = this.normalizeToDate(billDate);
    
    if (!tx || !bill) return false;
    
    const diffMs = tx - bill;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    return diffDays >= -daysBefore && diffDays <= daysAfter;
  }

  /**
   * Check if amounts match within tolerance
   */
  amountsMatch(amount1, amount2, tolerance) {
    const a1 = Math.abs(amount1 || 0);
    const a2 = Math.abs(amount2 || 0);
    
    return Math.abs(a1 - a2) <= tolerance;
  }

  /**
   * Reload rules and aliases (useful after rules are updated)
   */
  async reload() {
    this.initialized = false;
    await this.initialize();
  }
}
