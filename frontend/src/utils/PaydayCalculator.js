/**
 * PaydayCalculator.js - Utilities for calculating next payday and days until payday
 * Uses proper Pacific timezone handling to avoid off-by-one date errors
 */

import { getPacificTime } from './timezoneHelpers';

/**
 * Calculate the next payday based on last pay date and frequency
 * 
 * @param {string} lastPayDate - Last payday in YYYY-MM-DD format
 * @param {string} payFrequency - Pay frequency ('biweekly', 'weekly', 'monthly', 'bi-monthly')
 * @returns {Date} Next payday date
 */
export function calculateNextPayday(lastPayDate, payFrequency = 'biweekly') {
  const today = getPacificTime();
  today.setHours(0, 0, 0, 0);
  
  const lastPay = new Date(lastPayDate);
  lastPay.setHours(0, 0, 0, 0);
  
  const nextPayday = new Date(lastPay);
  
  if (payFrequency === 'biweekly') {
    // Add 14 days
    nextPayday.setDate(nextPayday.getDate() + 14);
    
    // Keep adding 14 days until we get a future date
    while (nextPayday <= today) {
      nextPayday.setDate(nextPayday.getDate() + 14);
    }
  } else if (payFrequency === 'weekly') {
    // Add 7 days
    nextPayday.setDate(nextPayday.getDate() + 7);
    
    // Keep adding 7 days until we get a future date
    while (nextPayday <= today) {
      nextPayday.setDate(nextPayday.getDate() + 7);
    }
  } else if (payFrequency === 'monthly') {
    // Add 1 month
    nextPayday.setMonth(nextPayday.getMonth() + 1);
    
    // Keep adding months until we get a future date
    while (nextPayday <= today) {
      nextPayday.setMonth(nextPayday.getMonth() + 1);
    }
  } else if (payFrequency === 'bi-monthly') {
    // Pay on 15th and last day of month
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Check 15th of current month
    const fifteenth = new Date(currentYear, currentMonth, 15);
    fifteenth.setHours(0, 0, 0, 0);
    
    if (fifteenth > today) {
      return fifteenth;
    }
    
    // Check last day of current month
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    lastDayOfMonth.setHours(0, 0, 0, 0);
    
    if (lastDayOfMonth > today) {
      return lastDayOfMonth;
    }
    
    // Both dates passed, return 15th of next month
    return new Date(currentYear, currentMonth + 1, 15);
  }
  
  return nextPayday;
}

/**
 * Calculate the number of days until a given payday
 * 
 * @param {Date|string} nextPayday - Next payday date (Date object or YYYY-MM-DD string)
 * @returns {number} Number of days until payday (0 if today or in the past)
 */
export function getDaysUntilPayday(nextPayday) {
  const today = getPacificTime();
  today.setHours(0, 0, 0, 0);
  
  const payday = new Date(nextPayday);
  payday.setHours(0, 0, 0, 0);
  
  const diffTime = payday - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

export default {
  calculateNextPayday,
  getDaysUntilPayday
};
