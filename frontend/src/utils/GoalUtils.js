// GoalUtils.js - Utility functions for goal calculations and management

import { formatDateForDisplay, parseLocalDate } from './DateUtils';

/**
 * Calculate goal progress percentage
 * @param {number} currentAmount - Current saved amount
 * @param {number} targetAmount - Target goal amount
 * @returns {number} Progress percentage (0-100)
 */
export const calculateGoalProgress = (currentAmount, targetAmount) => {
  if (!targetAmount || targetAmount <= 0) return 0;
  const progress = (currentAmount / targetAmount) * 100;
  return Math.min(Math.max(progress, 0), 100);
};

/**
 * Calculate remaining amount needed for goal
 * @param {number} currentAmount - Current saved amount
 * @param {number} targetAmount - Target goal amount
 * @returns {number} Remaining amount needed
 */
export const calculateRemainingAmount = (currentAmount, targetAmount) => {
  return Math.max(targetAmount - currentAmount, 0);
};

/**
 * Calculate months until goal completion based on monthly contribution
 * @param {number} currentAmount - Current saved amount
 * @param {number} targetAmount - Target goal amount
 * @param {number} monthlyContribution - Monthly contribution amount
 * @returns {number} Months until completion (null if no contribution)
 */
export const calculateMonthsToCompletion = (currentAmount, targetAmount, monthlyContribution) => {
  if (!monthlyContribution || monthlyContribution <= 0) return null;
  
  const remainingAmount = calculateRemainingAmount(currentAmount, targetAmount);
  if (remainingAmount <= 0) return 0;
  
  return Math.ceil(remainingAmount / monthlyContribution);
};

/**
 * Calculate completion date based on monthly contribution
 * @param {number} currentAmount - Current saved amount
 * @param {number} targetAmount - Target goal amount
 * @param {number} monthlyContribution - Monthly contribution amount
 * @returns {Date|null} Estimated completion date
 */
export const calculateCompletionDate = (currentAmount, targetAmount, monthlyContribution) => {
  const months = calculateMonthsToCompletion(currentAmount, targetAmount, monthlyContribution);
  if (months === null) return null;
  
  const completionDate = new Date();
  completionDate.setMonth(completionDate.getMonth() + months);
  return completionDate;
};

/**
 * Calculate required monthly contribution to reach goal by target date
 * @param {number} currentAmount - Current saved amount
 * @param {number} targetAmount - Target goal amount
 * @param {string|Date} targetDate - Target completion date
 * @returns {number|null} Required monthly contribution
 */
export const calculateRequiredMonthlyContribution = (currentAmount, targetAmount, targetDate) => {
  if (!targetDate) return null;
  
  const target = typeof targetDate === 'string' ? parseLocalDate(targetDate) : targetDate;
  if (!target) return null;
  
  const now = new Date();
  const monthsUntilTarget = Math.max(1, Math.ceil((target - now) / (1000 * 60 * 60 * 24 * 30.44)));
  
  const remainingAmount = calculateRemainingAmount(currentAmount, targetAmount);
  if (remainingAmount <= 0) return 0;
  
  return remainingAmount / monthsUntilTarget;
};

/**
 * Determine if goal is on track based on target date and current progress
 * @param {number} currentAmount - Current saved amount
 * @param {number} targetAmount - Target goal amount
 * @param {string|Date} targetDate - Target completion date
 * @param {number} monthlyContribution - Monthly contribution amount
 * @returns {object} Status object with isOnTrack, monthsAhead/Behind
 */
export const getGoalStatus = (currentAmount, targetAmount, targetDate, monthlyContribution) => {
  if (!targetDate || !monthlyContribution || monthlyContribution <= 0) {
    return { isOnTrack: null, message: 'No timeline available' };
  }
  
  const target = typeof targetDate === 'string' ? parseLocalDate(targetDate) : targetDate;
  if (!target) return { isOnTrack: null, message: 'Invalid target date' };
  
  const now = new Date();
  const monthsUntilTarget = Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24 * 30.44)));
  const monthsToCompletion = calculateMonthsToCompletion(currentAmount, targetAmount, monthlyContribution);
  
  if (monthsToCompletion === null) {
    return { isOnTrack: null, message: 'No contribution set' };
  }
  
  if (monthsToCompletion === 0) {
    return { isOnTrack: true, message: 'Goal completed!' };
  }
  
  if (monthsToCompletion <= monthsUntilTarget) {
    const monthsAhead = monthsUntilTarget - monthsToCompletion;
    return { 
      isOnTrack: true, 
      message: monthsAhead > 0 ? `${monthsAhead} months ahead of schedule!` : 'On track!'
    };
  } else {
    const monthsBehind = monthsToCompletion - monthsUntilTarget;
    return { 
      isOnTrack: false, 
      message: `${monthsBehind} months behind schedule`
    };
  }
};

/**
 * Calculate emergency fund recommendation based on monthly expenses
 * @param {number} monthlyExpenses - Average monthly expenses
 * @param {number} months - Number of months to save for (default 6)
 * @returns {number} Recommended emergency fund amount
 */
export const calculateEmergencyFundRecommendation = (monthlyExpenses, months = 6) => {
  return monthlyExpenses * months;
};

/**
 * Get next milestone for a goal
 * @param {number} currentProgress - Current progress percentage
 * @param {Array} milestones - Array of milestone percentages
 * @returns {number|null} Next milestone percentage
 */
export const getNextMilestone = (currentProgress, milestones = [25, 50, 75, 100]) => {
  return milestones.find(milestone => milestone > currentProgress) || null;
};

/**
 * Check if a milestone was recently reached
 * @param {number} currentProgress - Current progress percentage
 * @param {number} previousProgress - Previous progress percentage
 * @param {Array} milestones - Array of milestone percentages
 * @returns {number|null} Milestone that was reached
 */
export const getReachedMilestone = (currentProgress, previousProgress, milestones = [25, 50, 75, 100]) => {
  return milestones.find(milestone => 
    milestone <= currentProgress && milestone > previousProgress
  ) || null;
};

/**
 * Format timeline message for goal completion
 * @param {number} currentAmount - Current saved amount
 * @param {number} targetAmount - Target goal amount
 * @param {number} monthlyContribution - Monthly contribution amount
 * @returns {string} Formatted timeline message
 */
export const formatTimelineMessage = (currentAmount, targetAmount, monthlyContribution) => {
  const months = calculateMonthsToCompletion(currentAmount, targetAmount, monthlyContribution);
  
  if (months === null || months === undefined) {
    return 'Set a monthly contribution to see timeline';
  }
  
  if (months === 0) {
    return 'Goal completed! ðŸŽ‰';
  }
  
  if (months === 1) {
    return 'Goal will be completed next month!';
  }
  
  const completionDate = calculateCompletionDate(currentAmount, targetAmount, monthlyContribution);
  const dateString = completionDate ? formatDateForDisplay(completionDate) : 'Unknown';
  
  if (months <= 12) {
    return `${months} months at current rate (${dateString})`;
  } else {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    let timeString = `${years} year${years > 1 ? 's' : ''}`;
    if (remainingMonths > 0) {
      timeString += ` and ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
    }
    return `${timeString} at current rate (${dateString})`;
  }
};

/**
 * Calculate total goal metrics for dashboard
 * @param {Array} goals - Array of goal objects
 * @returns {object} Summary metrics
 */
export const calculateGoalMetrics = (goals) => {
  const activeGoals = goals.filter(goal => goal.status === 'active');
  
  const totalTargetAmount = activeGoals.reduce((sum, goal) => sum + (goal.targetAmount || 0), 0);
  const totalSavedAmount = activeGoals.reduce((sum, goal) => sum + (goal.currentAmount || 0), 0);
  const totalMonthlyContributions = activeGoals.reduce((sum, goal) => sum + (goal.monthlyContribution || 0), 0);
  
  const overallProgress = totalTargetAmount > 0 ? (totalSavedAmount / totalTargetAmount) * 100 : 0;
  
  // Find next milestone (closest goal to completion)
  const goalsByProgress = activeGoals
    .filter(goal => goal.targetAmount > 0)
    .map(goal => ({
      ...goal,
      progress: calculateGoalProgress(goal.currentAmount, goal.targetAmount),
      monthsToCompletion: calculateMonthsToCompletion(goal.currentAmount, goal.targetAmount, goal.monthlyContribution)
    }))
    .filter(goal => goal.progress < 100 && goal.monthsToCompletion !== null)
    .sort((a, b) => b.progress - a.progress);
  
  const nextMilestone = goalsByProgress[0] || null;
  
  return {
    activeGoalsCount: activeGoals.length,
    totalTargetAmount,
    totalSavedAmount,
    overallProgress,
    totalMonthlyContributions,
    nextMilestone,
    completedGoalsCount: goals.filter(goal => goal.status === 'completed').length
  };
};
