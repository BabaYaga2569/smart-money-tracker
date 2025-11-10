// frontend/src/utils/billMatcher.js
// Enhanced Bill Matcher with 3-day tolerance and fuzzy matching

/**
 * Normalizes a string for fuzzy matching
 */
function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates name variations for better matching
 */
function generateNameVariations(name) {
  if (!name) return [];
  
  const normalized = normalizeString(name);
  const variations = new Set([normalized]);
  
  variations.add(normalized.replace(/\s/g, ''));
  
  const words = normalized.split(' ');
  if (words.length > 0) {
    variations.add(words[0]);
  }
  
  if (words.length > 1) {
    variations.add(words[words.length - 1]);
  }
  
  if (normalized.length >= 5) {
    variations.add(normalized.substring(0, 5));
  }
  
  const skipWords = ['the', 'card', 'payment', 'bill', 'monthly', 'annual'];
  const significantWords = words.filter(word => 
    word.length > 2 && !skipWords.includes(word)
  );
  
  if (significantWords.length > 0) {
    variations.add(significantWords.join(''));
  }
  
  return Array.from(variations);
}

/**
 * Calculates similarity score between two strings
 */
function calculateSimilarity(str1, str2) {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  
  if (s1.includes(s2) || s2.includes(s1)) {
    const shorter = s1.length < s2.length ? s1 : s2;
    const longer = s1.length >= s2.length ? s1 : s2;
    return shorter.length / longer.length;
  }
  
  const words1 = s1.split(' ');
  const words2 = s2.split(' ');
  const commonWords = words1.filter(w => words2.includes(w));
  
  if (commonWords.length > 0) {
    return (commonWords.length * 2) / (words1.length + words2.length);
  }
  
  return 0.0;
}

/**
 * Checks if transaction name matches bill name
 */
function matchNames(billName, transactionName) {
  if (!billName || !transactionName) return 0;
  
  const billNormalized = normalizeString(billName);
  const txNormalized = normalizeString(transactionName);
  const txWords = txNormalized.split(' ');
  const billWords = billNormalized.split(' ');
  
  // Check if transaction is an abbreviation/prefix of bill name
  // e.g., "Affirm" (tx) matches "Affirm Dog Water Bowl" (bill)
  if (billNormalized.startsWith(txNormalized) && txNormalized.length >= 3) {
    // High score for prefix match, especially if transaction is a significant portion
    const ratio = txNormalized.length / billNormalized.length;
    return Math.min(0.95, 0.7 + ratio * 0.25);
  }
  
  // Check if bill is an abbreviation/prefix of transaction
  // e.g., "Affirm" (bill) matches "Affirm Inc Payment" (tx)
  if (txNormalized.startsWith(billNormalized) && billNormalized.length >= 3) {
    const ratio = billNormalized.length / txNormalized.length;
    return Math.min(0.95, 0.7 + ratio * 0.25);
  }
  
  const billVariations = generateNameVariations(billName);
  let maxScore = 0;
  
  // Exact match after normalization
  if (billNormalized === txNormalized) {
    return 1.0;
  }
  
  // Check if bill name contains transaction name (e.g., "Affirm Dog Water Bowl" contains "Affirm")
  if (billNormalized.includes(txNormalized)) {
    return 0.95;
  }
  
  // Check if transaction name contains bill name
  if (txNormalized.includes(billNormalized)) {
    return 0.95;
  }
  
  // Check if first word of bill matches transaction name (e.g., "Affirm" from "Affirm Dog Water Bowl")
  if (billWords.length > 0 && billWords[0] === txNormalized) {
    return 0.9;
  }
  
  // Check if transaction starts with first word of bill
  if (billWords.length > 0 && txNormalized.startsWith(billWords[0])) {
    return 0.85;
  }
  
  for (const variation of billVariations) {
    if (txNormalized === variation) {
      maxScore = Math.max(maxScore, 1.0);
      continue;
    }
    
    // Check if variation is contained in transaction
    if (txNormalized.includes(variation) || variation.includes(txNormalized)) {
      const score = Math.min(variation.length / Math.max(txNormalized.length, variation.length), 1.0);
      maxScore = Math.max(maxScore, score * 0.85);
    }
    
    // Check if variation matches a word in transaction
    if (txWords.some(word => word === variation)) {
      maxScore = Math.max(maxScore, 0.8);
    }
    
    const similarity = calculateSimilarity(variation, txNormalized);
    if (similarity > 0.6) {
      maxScore = Math.max(maxScore, similarity * 0.7);
    }
  }
  
  // Check if first word of bill matches first word of transaction
  if (billWords.length > 0 && txWords.length > 0) {
    if (billWords[0] === txWords[0] && billWords[0].length >= 4) {
      maxScore = Math.max(maxScore, 0.75);
    }
  }
  
  return maxScore;
}

/**
 * Main matching function with 3-day tolerance
 */
export function findMatchingTransactionForBill(bill, transactions) {
  if (!bill || !transactions || transactions.length === 0) {
    return null;
  }

  const billAmount = Math.abs(parseFloat(bill.amount));
  const billDueDate = new Date(bill.nextDueDate || bill.dueDate);
  
  const candidates = transactions
    .filter(tx => {
      if (tx.pending === true) return false;
      
      const txAmount = Math.abs(parseFloat(tx.amount));
      const amountDiff = Math.abs(txAmount - billAmount);
      if (amountDiff > 2.00) return false;
      
      const txDate = new Date(tx.date);
      const daysDiff = Math.abs((txDate - billDueDate) / (1000 * 60 * 60 * 24));
      
      return daysDiff <= 3; // 3-DAY TOLERANCE!
    })
    .map(tx => {
      const txAmount = Math.abs(parseFloat(tx.amount));
      const txDate = new Date(tx.date);
      const txName = tx.name || tx.merchant_name || '';
      
      const amountDiff = Math.abs(txAmount - billAmount);
      const amountScore = Math.max(0, 1 - (amountDiff / 2.00));
      
      const daysDiff = Math.abs((txDate - billDueDate) / (1000 * 60 * 60 * 24));
      const dateScore = Math.max(0, 1 - (daysDiff / 3));
      
      let nameScore = matchNames(bill.name, txName);
      
      // Check merchant names array if available
      if (bill.merchantNames && Array.isArray(bill.merchantNames)) {
        const txNormalized = normalizeString(txName);
        for (const merchantName of bill.merchantNames) {
          const merchantNormalized = normalizeString(merchantName);
          if (txNormalized.includes(merchantNormalized) || merchantNormalized.includes(txNormalized)) {
            nameScore = Math.max(nameScore, 0.95);
            break;
          }
        }
      }
      
      const confidence = (nameScore * 0.5) + (amountScore * 0.3) + (dateScore * 0.2);
      
      return {
        transaction: tx,
        confidence,
        amountDiff,
        daysDiff,
        nameScore,
        amountScore,
        dateScore
      };
    })
    .filter(candidate => candidate.confidence > 0.45)
    .sort((a, b) => b.confidence - a.confidence);

  if (candidates.length > 0) {
    const best = candidates[0];
    
    console.log(`[Bill Matcher] Match found for "${bill.name}":`, {
      transaction: best.transaction.name || best.transaction.merchant_name,
      confidence: `${(best.confidence * 100).toFixed(1)}%`,
      amountDiff: `$${best.amountDiff.toFixed(2)}`,
      daysDiff: `${best.daysDiff.toFixed(1)} days`,
      scores: {
        name: `${(best.nameScore * 100).toFixed(1)}%`,
        amount: `${(best.amountScore * 100).toFixed(1)}%`,
        date: `${(best.dateScore * 100).toFixed(1)}%`
      }
    });
    
    return best.transaction;
  }

  return null;
}

/**
 * Batch match multiple bills
 */
export function batchMatchBills(bills, transactions) {
  const matches = [];
  
  for (const bill of bills) {
    const transaction = findMatchingTransactionForBill(bill, transactions);
    if (transaction) {
      matches.push({ bill, transaction, matched: true });
    }
  }
  
  return matches;
}
