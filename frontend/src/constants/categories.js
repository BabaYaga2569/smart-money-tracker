// Shared category constants for consistent categorization across Bills and Transactions
// Based on the enhanced categories from Transactions page

// Category names array for dropdowns and filters
export const TRANSACTION_CATEGORIES = [
  "Groceries",
  "Food & Dining", 
  "Gas & Fuel",
  "Transportation",
  "Bills & Utilities",
  "Household Items", 
  "Clothing",
  "Healthcare",
  "Pharmacy",
  "Personal Care",
  "Entertainment",
  "Subscriptions",
  "Shopping",
  "Income",
  "Transfer"
];

// Category icons mapping
export const CATEGORY_ICONS = {
  "Groceries": "🛒",
  "Food & Dining": "🍔",
  "Gas & Fuel": "⛽",
  "Transportation": "🚗",
  "Bills & Utilities": "🏠",
  "Household Items": "🧽",
  "Clothing": "👕",
  "Healthcare": "🏥",
  "Pharmacy": "💊",
  "Personal Care": "💇",
  "Entertainment": "🎬",
  "Subscriptions": "📺",
  "Shopping": "🛍️",
  "Income": "💰",
  "Transfer": "🔄"
};

// Auto-categorization keywords for smart categorization
export const CATEGORY_KEYWORDS = {
  "Groceries": ["groceries", "grocery", "walmart", "target", "kroger", "safeway", "food shopping", "supermarket", "costco", "sam's club", "aldi", "whole foods"],
  "Food & Dining": ["restaurant", "mcdonalds", "starbucks", "pizza", "takeout", "dining", "coffee", "fast food", "burger king", "taco bell", "subway", "kfc", "dominos", "chipotle"],
  "Gas & Fuel": ["gas", "shell", "chevron", "exxon", "bp", "fuel", "gas station", "texaco", "mobil", "arco", "speedway", "circle k"],
  "Transportation": ["uber", "lyft", "taxi", "bus", "train", "parking", "car repair", "metro", "automotive", "public transport", "rideshare", "car wash"],
  "Bills & Utilities": ["electric", "electricity", "water", "internet", "phone", "cable", "utility", "verizon", "at&t", "comcast", "xfinity", "nv energy", "duke energy"],
  "Household Items": ["cleaning", "paper towels", "household", "home supplies", "detergent", "toilet paper", "cleaning supplies", "home depot", "lowes", "ace hardware"],
  "Clothing": ["clothes", "shirt", "shoes", "pants", "clothing", "apparel", "nike", "adidas", "h&m", "zara", "gap", "old navy", "macy's"],
  "Healthcare": ["doctor", "hospital", "medical", "dentist", "health", "clinic", "kaiser", "urgent care", "prescription"],
  "Pharmacy": ["pharmacy", "cvs", "walgreens", "prescription", "medicine", "drugs", "rite aid", "medication"],
  "Personal Care": ["haircut", "salon", "cosmetics", "personal care", "beauty", "barbershop", "spa", "nails", "massage"],
  "Entertainment": ["movie", "theater", "game", "entertainment", "concert", "sports", "amusement park", "netflix", "spotify", "hulu", "disney"],
  "Subscriptions": ["netflix", "spotify", "amazon prime", "subscription", "monthly service", "hulu", "disney+", "apple music", "youtube premium"],
  "Shopping": ["amazon", "online shopping", "store", "retail", "ebay", "etsy", "best buy", "electronics", "shopping mall"],
  "Income": ["payroll", "salary", "bonus", "freelance", "income", "paycheck", "wages", "deposit", "payment", "refund", "tax refund"],
  "Transfer": ["transfer", "deposit", "withdrawal", "bank transfer", "atm", "cash", "venmo", "paypal", "zelle"]
};

// Legacy category mapping for migration from old Bills categories to new categories
export const LEGACY_CATEGORY_MAPPING = {
  "Housing": "Bills & Utilities",
  "Utilities": "Bills & Utilities", 
  "Transportation": "Transportation", // Keep the same
  "Credit Cards": "Bills & Utilities",
  "Insurance": "Healthcare", // or could be "Bills & Utilities" depending on insurance type
  "Subscriptions": "Subscriptions", // Keep the same
  "Education": "Bills & Utilities",
  "Other": "Bills & Utilities"
};

// Helper function to get category icon
export const getCategoryIcon = (category) => {
  return CATEGORY_ICONS[category] || '💰';
};

// Helper function to migrate legacy category to new category
export const migrateLegacyCategory = (oldCategory) => {
  return LEGACY_CATEGORY_MAPPING[oldCategory] || oldCategory;
};