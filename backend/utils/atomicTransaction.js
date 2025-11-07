/**
 * Atomic Transaction Utilities
 * Provides all-or-nothing database operations using Firestore batches
 */

import { getFirestore } from 'firebase-admin/firestore';
import logger from './logger.js';

/**
 * Execute multiple Firestore operations atomically
 * All operations succeed together or all fail together
 * 
 * @param {Array} operations - Array of operation objects
 * @param {Object} options - Configuration options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 1000)
 * @param {string} options.transactionId - Optional transaction ID for tracking
 * @returns {Promise<{success: boolean, transactionId: string}>}
 */
export async function atomicTransaction(operations, options = {}) {
  const db = getFirestore();
  const batch = db.batch();
  const { maxRetries = 3, retryDelay = 1000, transactionId } = options;
  
  const txId = transactionId || `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    logger.info('ATOMIC_TRANSACTION', `Starting atomic transaction ${txId}`, {
      operationCount: operations.length,
      transactionId: txId
    });
    
    // Execute all operations in the batch
    for (const operation of operations) {
      const { type, ref, data } = operation;
      
      if (type === 'set') {
        batch.set(ref, { ...data, updatedAt: new Date(), transactionId: txId });
      } else if (type === 'update') {
        batch.update(ref, { ...data, updatedAt: new Date(), transactionId: txId });
      } else if (type === 'delete') {
        batch.delete(ref);
      }
    }
    
    // Commit all operations atomically
    await batch.commit();
    
    logger.info('ATOMIC_TRANSACTION', `Transaction ${txId} committed successfully`, {
      operationCount: operations.length,
      transactionId: txId
    });
    
    return { success: true, transactionId: txId };
    
  } catch (error) {
    logger.error('ATOMIC_TRANSACTION', `Transaction ${txId} failed`, error, {
      operationCount: operations.length,
      transactionId: txId
    });
    
    // Retry logic
    if (maxRetries > 0 && error.code === 'UNAVAILABLE') {
      logger.warn('ATOMIC_TRANSACTION', `Retrying transaction ${txId}`, {
        retriesLeft: maxRetries - 1
      });
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return atomicTransaction(operations, { ...options, maxRetries: maxRetries - 1 });
    }
    
    throw error;
  }
}

/**
 * Helper to create operation objects
 * 
 * @param {string} type - Operation type: 'set', 'update', or 'delete'
 * @param {DocumentReference} ref - Firestore document reference
 * @param {Object} data - Data to write (not needed for delete operations)
 * @returns {Object} Operation object
 */
export function createOperation(type, ref, data = null) {
  return { type, ref, data };
}
