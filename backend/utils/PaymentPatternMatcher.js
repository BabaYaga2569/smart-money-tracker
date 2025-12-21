/**
 * PaymentPatternMatcher.js
 * 
 * Detects and extracts recipient information from P2P payment transactions
 * (Zelle, Venmo, CashApp, Check payments, etc.)
 * 
 * Usage:
 *   import { PaymentPatternMatcher } from './PaymentPatternMatcher.js';
 *   const matcher = new PaymentPatternMatcher();
 *   const result = matcher.extractPaymentInfo(transaction);
 */

export class PaymentPatternMatcher {
  constructor() {
    // Define regex patterns for various P2P payment types
    this.patterns = {
      zelle: {
        regex: /zelle\s+(?:transfer|payment|to)?\s*(?:conf#?\s*[a-z0-9]+)?\s*;?\s*([a-z\s]+)/i,
        extractRecipient: (match, fullText) => {
          // Extract recipient name from match
          if (match && match[1]) {
            return this.cleanRecipientName(match[1]);
          }
          // Alternative: Look for name after semicolon or "to"
          const afterSemicolon = fullText.match(/;\s*([a-z\s]+)/i);
          if (afterSemicolon && afterSemicolon[1]) {
            return this.cleanRecipientName(afterSemicolon[1]);
          }
          return null;
        },
        confidence: 0.90,
        type: 'zelle'
      },
      venmo: {
        regex: /venmo\s+(?:payment\s+)?(?:to\s+)?(@?[a-z0-9\s]+)/i,
        extractRecipient: (match) => {
          if (match && match[1]) {
            return this.cleanRecipientName(match[1].replace('@', ''));
          }
          return null;
        },
        confidence: 0.90,
        type: 'venmo'
      },
      cashApp: {
        regex: /cash\s+app\s+(?:to\s+)?(\$?@?[a-z0-9]+)/i,
        extractRecipient: (match) => {
          if (match && match[1]) {
            return this.cleanRecipientName(match[1].replace(/[$@]/g, ''));
          }
          return null;
        },
        confidence: 0.90,
        type: 'cashapp'
      },
      check: {
        regex: /check\s+(?:#?\s*\d+\s+)?(?:to\s+)?([a-z\s]+)/i,
        extractRecipient: (match) => {
          if (match && match[1]) {
            return this.cleanRecipientName(match[1]);
          }
          return null;
        },
        confidence: 0.85,
        type: 'check'
      },
      ach: {
        regex: /ach\s+(?:payment|transfer)\s+(?:to\s+)?([a-z\s]+)/i,
        extractRecipient: (match) => {
          if (match && match[1]) {
            return this.cleanRecipientName(match[1]);
          }
          return null;
        },
        confidence: 0.85,
        type: 'ach'
      },
      wireTransfer: {
        regex: /wire\s+(?:transfer)?\s+(?:to\s+)?([a-z\s]+)/i,
        extractRecipient: (match) => {
          if (match && match[1]) {
            return this.cleanRecipientName(match[1]);
          }
          return null;
        },
        confidence: 0.85,
        type: 'wire'
      }
    };
  }

  /**
   * Clean and normalize recipient name
   * @param {string} name - Raw recipient name
   * @returns {string} - Cleaned name
   */
  cleanRecipientName(name) {
    if (!name) return null;
    
    return name
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^a-z\s]/gi, '') // Remove special characters
      .toLowerCase()
      .trim();
  }

  /**
   * Extract payment information from transaction name
   * @param {Object} transaction - Transaction object with name/merchant_name
   * @returns {Object|null} - Payment info with recipient, type, confidence
   */
  extractPaymentInfo(transaction) {
    const transactionName = (transaction.merchant_name || transaction.name || '').toLowerCase();
    
    if (!transactionName) {
      return null;
    }

    // Try each pattern
    for (const [patternName, pattern] of Object.entries(this.patterns)) {
      const match = transactionName.match(pattern.regex);
      
      if (match) {
        const recipient = pattern.extractRecipient(match, transactionName);
        
        if (recipient && recipient.length > 2) { // Ensure meaningful name
          return {
            paymentType: pattern.type,
            recipient: recipient,
            confidence: pattern.confidence,
            originalText: transactionName,
            patternUsed: patternName,
            keywords: this.extractKeywords(recipient)
          };
        }
      }
    }

    return null;
  }

  /**
   * Extract individual keywords from recipient name
   * @param {string} recipient - Recipient name
   * @returns {Array<string>} - Array of keywords
   */
  extractKeywords(recipient) {
    if (!recipient) return [];
    
    return recipient
      .split(/\s+/)
      .filter(word => word.length > 2) // Only meaningful words
      .map(word => word.toLowerCase());
  }

  /**
   * Check if transaction is a P2P payment
   * @param {Object} transaction - Transaction object
   * @returns {boolean} - True if P2P payment detected
   */
  isP2PPayment(transaction) {
    const info = this.extractPaymentInfo(transaction);
    return info !== null;
  }

  /**
   * Match payment info to bill using recipient name matching
   * @param {Object} paymentInfo - Payment info from extractPaymentInfo
   * @param {Object} bill - Bill object with name
   * @returns {number} - Match confidence (0-1)
   */
  matchToBill(paymentInfo, bill) {
    if (!paymentInfo || !bill) return 0;

    const billName = (bill.name || '').toLowerCase();
    const recipient = paymentInfo.recipient;

    // Direct substring match
    if (billName.includes(recipient) || recipient.includes(billName)) {
      return 0.95;
    }

    // Check if any recipient keywords match bill name
    const recipientKeywords = paymentInfo.keywords || [];
    let matchedKeywords = 0;
    
    for (const keyword of recipientKeywords) {
      if (billName.includes(keyword)) {
        matchedKeywords++;
      }
    }

    // Calculate confidence based on keyword matches
    if (matchedKeywords > 0) {
      const keywordMatchRatio = matchedKeywords / recipientKeywords.length;
      return 0.75 + (keywordMatchRatio * 0.2); // 0.75 - 0.95 range
    }

    return 0;
  }

  /**
   * Get payment type from transaction
   * @param {Object} transaction - Transaction object
   * @returns {string|null} - Payment type (zelle, venmo, etc.) or null
   */
  getPaymentType(transaction) {
    const info = this.extractPaymentInfo(transaction);
    return info ? info.paymentType : null;
  }
}

// Export singleton instance for convenience
export const paymentPatternMatcher = new PaymentPatternMatcher();
