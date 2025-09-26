// Goal-related constants for the Goals page

// Goal categories with icons and descriptions
export const GOAL_CATEGORIES = {
  'Emergency Fund': {
    icon: '🚨',
    description: 'Build emergency savings (3-6 months of expenses)',
    priority: 1,
    color: '#ff4444'
  },
  'Vacation': {
    icon: '🏖️',
    description: 'Trips, travel, and experiences',
    priority: 3,
    color: '#44aaff'
  },
  'Major Purchase': {
    icon: '🏠',
    description: 'House down payment, furniture, appliances',
    priority: 2,
    color: '#ff8844'
  },
  'Vehicle': {
    icon: '🚗',
    description: 'Car, motorcycle, repairs',
    priority: 2,
    color: '#aa44ff'
  },
  'Education': {
    icon: '🎓',
    description: 'Courses, training, certifications',
    priority: 2,
    color: '#44ff88'
  },
  'Investment': {
    icon: '💰',
    description: 'Stock portfolio, retirement fund',
    priority: 2,
    color: '#ffaa44'
  },
  'Special Events': {
    icon: '🎁',
    description: 'Wedding, holidays, gifts',
    priority: 3,
    color: '#ff44aa'
  },
  'Debt Payoff': {
    icon: '💳',
    description: 'Credit cards, student loans',
    priority: 1,
    color: '#ff6644'
  },
  'Custom': {
    icon: '🎯',
    description: 'User-defined goals',
    priority: 3,
    color: '#44ffaa'
  }
};

// Priority levels
export const GOAL_PRIORITIES = {
  high: { label: 'High', color: '#ff4444', value: 1 },
  medium: { label: 'Medium', color: '#ffaa44', value: 2 },
  low: { label: 'Low', color: '#44ff88', value: 3 }
};

// Status options
export const GOAL_STATUSES = {
  active: { label: 'Active', color: '#44ff88' },
  completed: { label: 'Completed', color: '#00ff88' },
  paused: { label: 'Paused', color: '#ffaa44' }
};

// Contribution types
export const CONTRIBUTION_TYPES = {
  manual: { label: 'Manual', icon: '✋' },
  automatic: { label: 'Automatic', icon: '🔄' },
  transfer: { label: 'Transfer', icon: '💸' },
  transaction: { label: 'Linked Transaction', icon: '🔗' }
};

// Milestone percentages for celebrations
export const MILESTONE_PERCENTAGES = [10, 25, 50, 75, 90, 100];

// Helper functions
export const getGoalCategoryIcon = (category) => {
  return GOAL_CATEGORIES[category]?.icon || '🎯';
};

export const getGoalCategoryColor = (category) => {
  return GOAL_CATEGORIES[category]?.color || '#44ffaa';
};

export const getPriorityColor = (priority) => {
  return GOAL_PRIORITIES[priority]?.color || '#44ff88';
};

export const getStatusColor = (status) => {
  return GOAL_STATUSES[status]?.color || '#44ff88';
};

// Default goal template based on category
export const getGoalTemplate = (category) => {
  const templates = {
    'Emergency Fund': {
      name: 'Emergency Fund',
      description: 'Save 3-6 months of expenses for unexpected situations',
      priority: 'high'
    },
    'Vacation': {
      name: 'Dream Vacation',
      description: 'Save for an amazing trip or experience',
      priority: 'medium'
    },
    'Major Purchase': {
      name: 'Major Purchase',
      description: 'Save for a significant purchase or investment',
      priority: 'medium' 
    },
    'Vehicle': {
      name: 'New Vehicle',
      description: 'Save for a car, motorcycle, or vehicle repairs',
      priority: 'medium'
    },
    'Education': {
      name: 'Education Fund',
      description: 'Invest in learning and skill development',
      priority: 'medium'
    },
    'Investment': {
      name: 'Investment Fund',
      description: 'Build wealth through investments',
      priority: 'medium'
    },
    'Special Events': {
      name: 'Special Event',
      description: 'Save for weddings, celebrations, or special occasions',
      priority: 'low'
    },
    'Debt Payoff': {
      name: 'Debt Freedom',
      description: 'Pay off debts and achieve financial freedom',
      priority: 'high'
    },
    'Custom': {
      name: 'Custom Goal',
      description: 'Your personalized financial goal',
      priority: 'medium'
    }
  };
  
  return templates[category] || templates['Custom'];
};