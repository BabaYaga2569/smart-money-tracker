/**
 * Detection Storage Utility
 * Manages subscription detection state, timing, and dismissed items in localStorage
 */

const STORAGE_KEYS = {
  DETECTIONS: 'subscriptionDetections',
  DISMISSED: 'dismissedDetections',
  LAST_RUN: 'lastDetectionRun',
  LAST_DISMISS: 'lastDetectionDismiss'
};

/**
 * Generate a unique ID for a detected subscription
 * Based on merchant name and amount to handle duplicates across runs
 */
const generateDetectionId = (merchantName, amount, billingCycle) => {
  return `${merchantName.toLowerCase().replace(/\s+/g, '_')}_${amount}_${billingCycle}`;
};

/**
 * Save detected subscriptions to localStorage
 */
export const saveDetections = (detections) => {
  try {
    // Add unique IDs to detections
    const detectionsWithIds = detections.map(d => ({
      ...d,
      detectionId: generateDetectionId(d.merchantName, d.amount, d.billingCycle),
      timestamp: Date.now()
    }));
    
    localStorage.setItem(STORAGE_KEYS.DETECTIONS, JSON.stringify(detectionsWithIds));
    return detectionsWithIds;
  } catch (error) {
    console.error('Error saving detections:', error);
    return detections;
  }
};

/**
 * Get pending detections (not dismissed)
 */
export const getPendingDetections = () => {
  try {
    const detectionsStr = localStorage.getItem(STORAGE_KEYS.DETECTIONS);
    const dismissedStr = localStorage.getItem(STORAGE_KEYS.DISMISSED);
    
    if (!detectionsStr) return [];
    
    const detections = JSON.parse(detectionsStr);
    const dismissed = dismissedStr ? JSON.parse(dismissedStr) : [];
    
    // Filter out dismissed detections
    return detections.filter(d => !dismissed.includes(d.detectionId));
  } catch (error) {
    console.error('Error getting pending detections:', error);
    return [];
  }
};

/**
 * Get all detections (including dismissed)
 */
export const getAllDetections = () => {
  try {
    const detectionsStr = localStorage.getItem(STORAGE_KEYS.DETECTIONS);
    return detectionsStr ? JSON.parse(detectionsStr) : [];
  } catch (error) {
    console.error('Error getting all detections:', error);
    return [];
  }
};

/**
 * Dismiss all pending detections
 */
export const dismissAllDetections = () => {
  try {
    const detections = getAllDetections();
    const dismissed = getDismissedIds();
    
    // Add all detection IDs to dismissed list
    const allIds = detections.map(d => d.detectionId);
    const newDismissed = [...new Set([...dismissed, ...allIds])];
    
    localStorage.setItem(STORAGE_KEYS.DISMISSED, JSON.stringify(newDismissed));
    localStorage.setItem(STORAGE_KEYS.LAST_DISMISS, Date.now().toString());
    
    // Dispatch event to update UI
    window.dispatchEvent(new CustomEvent('detectionDismissed'));
    
    return true;
  } catch (error) {
    console.error('Error dismissing detections:', error);
    return false;
  }
};

/**
 * Dismiss a specific detection
 */
export const dismissDetection = (detectionId) => {
  try {
    const dismissed = getDismissedIds();
    
    if (!dismissed.includes(detectionId)) {
      dismissed.push(detectionId);
      localStorage.setItem(STORAGE_KEYS.DISMISSED, JSON.stringify(dismissed));
    }
    
    // Dispatch event to update UI
    window.dispatchEvent(new CustomEvent('detectionDismissed'));
    
    return true;
  } catch (error) {
    console.error('Error dismissing detection:', error);
    return false;
  }
};

/**
 * Get list of dismissed detection IDs
 */
export const getDismissedIds = () => {
  try {
    const dismissedStr = localStorage.getItem(STORAGE_KEYS.DISMISSED);
    return dismissedStr ? JSON.parse(dismissedStr) : [];
  } catch (error) {
    console.error('Error getting dismissed IDs:', error);
    return [];
  }
};

/**
 * Clear all detections (useful after adding to subscriptions)
 */
export const clearDetections = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.DETECTIONS);
    
    // Dispatch event to update UI
    window.dispatchEvent(new CustomEvent('detectionsCleared'));
    
    return true;
  } catch (error) {
    console.error('Error clearing detections:', error);
    return false;
  }
};

/**
 * Update last detection run timestamp
 */
export const updateLastRun = () => {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_RUN, Date.now().toString());
    return true;
  } catch (error) {
    console.error('Error updating last run:', error);
    return false;
  }
};

/**
 * Check if we should run detection based on timing rules
 * Rules:
 * - Don't run more than once per hour
 * - Don't run within 24h of dismissal
 */
export const shouldRunDetection = () => {
  try {
    const lastRunStr = localStorage.getItem(STORAGE_KEYS.LAST_RUN);
    const lastDismissStr = localStorage.getItem(STORAGE_KEYS.LAST_DISMISS);
    
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    
    // Check if dismissed recently (within 24h)
    if (lastDismissStr) {
      const lastDismiss = parseInt(lastDismissStr);
      if (now - lastDismiss < TWENTY_FOUR_HOURS) {
        console.log('[Detection] Skipping - dismissed within 24h');
        return false;
      }
    }
    
    // Check if run recently (within 1h)
    if (lastRunStr) {
      const lastRun = parseInt(lastRunStr);
      if (now - lastRun < ONE_HOUR) {
        console.log('[Detection] Skipping - ran within 1h');
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error checking should run detection:', error);
    return false;
  }
};

/**
 * Remove a detection after it's been added to subscriptions
 */
export const removeDetection = (detectionId) => {
  try {
    const detections = getAllDetections();
    const filtered = detections.filter(d => d.detectionId !== detectionId);
    
    localStorage.setItem(STORAGE_KEYS.DETECTIONS, JSON.stringify(filtered));
    
    // Dispatch event to update UI
    window.dispatchEvent(new CustomEvent('detectionRemoved'));
    
    return true;
  } catch (error) {
    console.error('Error removing detection:', error);
    return false;
  }
};

/**
 * Get count of pending detections
 */
export const getPendingCount = () => {
  return getPendingDetections().length;
};

/**
 * Reset all detection data (for testing or cleanup)
 */
export const resetDetectionData = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.DETECTIONS);
    localStorage.removeItem(STORAGE_KEYS.DISMISSED);
    localStorage.removeItem(STORAGE_KEYS.LAST_RUN);
    localStorage.removeItem(STORAGE_KEYS.LAST_DISMISS);
    
    // Dispatch event to update UI
    window.dispatchEvent(new CustomEvent('detectionsReset'));
    
    return true;
  } catch (error) {
    console.error('Error resetting detection data:', error);
    return false;
  }
};
