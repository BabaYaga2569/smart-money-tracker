/**
 * Auto-categorization keywords for transactions
 * This is the single source of truth for category matching
 * Used by both backend (server.js) and can be imported by frontend
 */

export const CATEGORY_KEYWORDS = {
  "Groceries": [
    "groceries", "grocery", "walmart", "target", "kroger", "safeway", 
    "food shopping", "supermarket", "costco", "sam's club", "aldi", "whole foods"
  ],
  "Food & Dining": [
    "restaurant", "mcdonalds", "starbucks", "pizza", "takeout", "dining", 
    "coffee", "fast food", "burger king", "taco bell", "subway", "kfc", 
    "dominos", "chipotle"
  ],
  "Gas & Fuel": [
    "gas", "shell", "chevron", "exxon", "bp", "fuel", "gas station", 
    "texaco", "mobil", "arco", "speedway", "circle k"
  ],
  "Transportation": [
    "uber", "lyft", "taxi", "bus", "train", "parking", "car repair", 
    "metro", "automotive", "public transport", "rideshare", "car wash"
  ],
  "Bills & Utilities": [
    "electric", "electricity", "water", "internet", "phone", "cable", 
    "utility", "verizon", "at&t", "comcast", "xfinity", "nv energy", 
    "duke energy", "mepco"
  ],
  "Household Items": [
    "cleaning", "paper towels", "household", "home supplies", "detergent", 
    "toilet paper", "cleaning supplies", "home depot", "lowes", "ace hardware"
  ],
  "Clothing": [
    "clothes", "shirt", "shoes", "pants", "clothing", "apparel", "nike", 
    "adidas", "h&m", "zara", "gap", "old navy", "macy's"
  ],
  "Healthcare": [
    "doctor", "hospital", "medical", "dentist", "health", "clinic", 
    "kaiser", "urgent care", "prescription"
  ],
  "Pharmacy": [
    "pharmacy", "cvs", "walgreens", "prescription", "medicine", "drugs", 
    "rite aid", "medication"
  ],
  "Personal Care": [
    "haircut", "salon", "cosmetics", "personal care", "beauty", "barbershop", 
    "spa", "nails", "massage"
  ],
  "Entertainment": [
    "movie", "theater", "game", "entertainment", "concert", "sports", 
    "amusement park", "netflix", "spotify", "hulu", "disney"
  ],
  "Subscriptions": [
    "netflix", "spotify", "amazon prime", "subscription", "monthly service", 
    "hulu", "disney+", "apple music", "youtube premium"
  ],
  "Shopping": [
    "amazon", "online shopping", "store", "retail", "ebay", "etsy", 
    "best buy", "electronics", "shopping mall"
  ],
  "Income": [
    "payroll", "salary", "bonus", "freelance", "income", "paycheck", 
    "wages", "deposit", "payment", "refund", "tax refund"
  ],
  "Transfer": [
    "transfer", "deposit", "withdrawal", "bank transfer", "atm", "cash", 
    "venmo", "paypal", "zelle", "barclays"
  ]
};

/**
 * Auto-categorize transaction based on merchant name/description
 * @param {string} description - Merchant name or transaction description
 * @returns {string} Category name or empty string if no match
 */
export function autoCategorizTransaction(description) {
  if (!description) return '';
  
  const desc = description.toLowerCase().trim();
  
  // Try to match keywords to categories
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      // Handle variations with punctuation and word boundaries
      if (desc === lowerKeyword || 
          desc.includes(` ${lowerKeyword} `) ||
          desc.startsWith(lowerKeyword + ' ') ||
          desc.endsWith(' ' + lowerKeyword) ||
          desc.includes(lowerKeyword)) {
        return category;
      }
    }
  }
  
  return '';
}
