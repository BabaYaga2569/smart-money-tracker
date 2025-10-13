/**
 * Unit tests for detectionStorage utility
 */

import {
  saveDetections,
  getPendingDetections,
  getAllDetections,
  dismissAllDetections,
  dismissDetection,
  getDismissedIds,
  clearDetections,
  updateLastRun,
  shouldRunDetection,
  removeDetection,
  getPendingCount,
  resetDetectionData
} from './detectionStorage';

describe('detectionStorage', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('saveDetections', () => {
    it('should save detections with generated IDs', () => {
      const mockDetections = [
        { merchantName: 'Netflix', amount: 15.99, billingCycle: 'Monthly' },
        { merchantName: 'Spotify Premium', amount: 10.99, billingCycle: 'Monthly' }
      ];

      const saved = saveDetections(mockDetections);

      expect(saved).toHaveLength(2);
      expect(saved[0]).toHaveProperty('detectionId', 'netflix_15.99_Monthly');
      expect(saved[1]).toHaveProperty('detectionId', 'spotify_premium_10.99_Monthly');
      expect(saved[0]).toHaveProperty('timestamp');
    });
  });

  describe('getPendingDetections', () => {
    it('should return all detections when none are dismissed', () => {
      const mockDetections = [
        { merchantName: 'Netflix', amount: 15.99, billingCycle: 'Monthly' },
        { merchantName: 'Spotify', amount: 10.99, billingCycle: 'Monthly' }
      ];

      saveDetections(mockDetections);
      const pending = getPendingDetections();

      expect(pending).toHaveLength(2);
    });

    it('should filter out dismissed detections', () => {
      const mockDetections = [
        { merchantName: 'Netflix', amount: 15.99, billingCycle: 'Monthly' },
        { merchantName: 'Spotify', amount: 10.99, billingCycle: 'Monthly' }
      ];

      saveDetections(mockDetections);
      dismissDetection('netflix_15.99_Monthly');
      
      const pending = getPendingDetections();

      expect(pending).toHaveLength(1);
      expect(pending[0].merchantName).toBe('Spotify');
    });
  });

  describe('getAllDetections', () => {
    it('should return all detections including dismissed', () => {
      const mockDetections = [
        { merchantName: 'Netflix', amount: 15.99, billingCycle: 'Monthly' },
        { merchantName: 'Spotify', amount: 10.99, billingCycle: 'Monthly' }
      ];

      saveDetections(mockDetections);
      dismissDetection('netflix_15.99_Monthly');
      
      const all = getAllDetections();

      expect(all).toHaveLength(2);
    });
  });

  describe('dismissAllDetections', () => {
    it('should dismiss all current detections', () => {
      const mockDetections = [
        { merchantName: 'Netflix', amount: 15.99, billingCycle: 'Monthly' },
        { merchantName: 'Spotify', amount: 10.99, billingCycle: 'Monthly' }
      ];

      saveDetections(mockDetections);
      dismissAllDetections();
      
      const pending = getPendingDetections();

      expect(pending).toHaveLength(0);
    });

    it('should update last dismiss timestamp', () => {
      const mockDetections = [
        { merchantName: 'Netflix', amount: 15.99, billingCycle: 'Monthly' }
      ];

      saveDetections(mockDetections);
      const beforeTime = Date.now();
      dismissAllDetections();
      const afterTime = Date.now();

      const lastDismiss = parseInt(localStorage.getItem('lastDetectionDismiss'));
      
      expect(lastDismiss).toBeGreaterThanOrEqual(beforeTime);
      expect(lastDismiss).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('dismissDetection', () => {
    it('should dismiss a specific detection', () => {
      const mockDetections = [
        { merchantName: 'Netflix', amount: 15.99, billingCycle: 'Monthly' },
        { merchantName: 'Spotify', amount: 10.99, billingCycle: 'Monthly' }
      ];

      saveDetections(mockDetections);
      dismissDetection('netflix_15.99_Monthly');
      
      const dismissed = getDismissedIds();

      expect(dismissed).toContain('netflix_15.99_Monthly');
      expect(dismissed).not.toContain('spotify_10.99_Monthly');
    });
  });

  describe('clearDetections', () => {
    it('should clear all detections from storage', () => {
      const mockDetections = [
        { merchantName: 'Netflix', amount: 15.99, billingCycle: 'Monthly' }
      ];

      saveDetections(mockDetections);
      clearDetections();
      
      const all = getAllDetections();

      expect(all).toHaveLength(0);
    });
  });

  describe('shouldRunDetection', () => {
    it('should return true when no previous run exists', () => {
      const result = shouldRunDetection();
      expect(result).toBe(true);
    });

    it('should return false when run within 1 hour', () => {
      updateLastRun();
      const result = shouldRunDetection();
      expect(result).toBe(false);
    });

    it('should return false when dismissed within 24 hours', () => {
      localStorage.setItem('lastDetectionDismiss', Date.now().toString());
      const result = shouldRunDetection();
      expect(result).toBe(false);
    });

    it('should return true when last run was over 1 hour ago', () => {
      const oneHourAgo = Date.now() - (61 * 60 * 1000); // 61 minutes ago
      localStorage.setItem('lastDetectionRun', oneHourAgo.toString());
      
      const result = shouldRunDetection();
      expect(result).toBe(true);
    });
  });

  describe('removeDetection', () => {
    it('should remove a specific detection from storage', () => {
      const mockDetections = [
        { merchantName: 'Netflix', amount: 15.99, billingCycle: 'Monthly' },
        { merchantName: 'Spotify', amount: 10.99, billingCycle: 'Monthly' }
      ];

      saveDetections(mockDetections);
      removeDetection('netflix_15.99_Monthly');
      
      const all = getAllDetections();

      expect(all).toHaveLength(1);
      expect(all[0].merchantName).toBe('Spotify');
    });
  });

  describe('getPendingCount', () => {
    it('should return correct count of pending detections', () => {
      const mockDetections = [
        { merchantName: 'Netflix', amount: 15.99, billingCycle: 'Monthly' },
        { merchantName: 'Spotify', amount: 10.99, billingCycle: 'Monthly' },
        { merchantName: 'Gym', amount: 24.99, billingCycle: 'Monthly' }
      ];

      saveDetections(mockDetections);
      dismissDetection('netflix_15.99_Monthly');
      
      const count = getPendingCount();

      expect(count).toBe(2);
    });
  });

  describe('resetDetectionData', () => {
    it('should clear all detection-related data', () => {
      const mockDetections = [
        { merchantName: 'Netflix', amount: 15.99, billingCycle: 'Monthly' }
      ];

      saveDetections(mockDetections);
      dismissAllDetections();
      updateLastRun();
      
      resetDetectionData();
      
      expect(localStorage.getItem('subscriptionDetections')).toBeNull();
      expect(localStorage.getItem('dismissedDetections')).toBeNull();
      expect(localStorage.getItem('lastDetectionRun')).toBeNull();
      expect(localStorage.getItem('lastDetectionDismiss')).toBeNull();
    });
  });
});
