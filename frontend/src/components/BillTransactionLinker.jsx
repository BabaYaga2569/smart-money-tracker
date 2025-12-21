import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import './BillTransactionLinker.css';

/**
 * BillTransactionLinker Component
 * 
 * Modal for manually linking transactions to bills
 * Features:
 * - Shows unlinked transactions sorted by similarity
 * - Allows manual link selection
 * - Creates payment rules from manual links
 * - Shows match confidence
 */
export default function BillTransactionLinker({ bill, onLink, onClose }) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [createRule, setCreateRule] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (bill && currentUser) {
      loadTransactions();
    }
  }, [bill, currentUser]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load unlinked transactions within date range
      const billDate = new Date(bill.dueDate || bill.nextDueDate);
      const startDate = new Date(billDate);
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date(billDate);
      endDate.setDate(endDate.getDate() + 7);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      const q = query(
        transactionsRef,
        where('date', '>=', startDateStr),
        where('date', '<=', endDateStr)
      );

      const snapshot = await getDocs(q);
      
      const txList = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(tx => 
          !tx.linkedEventId && 
          parseFloat(tx.amount) < 0 // Only expenses
        );

      // Sort by similarity to bill amount
      const billAmount = Math.abs(bill.amount || 0);
      txList.sort((a, b) => {
        const diffA = Math.abs(Math.abs(a.amount) - billAmount);
        const diffB = Math.abs(Math.abs(b.amount) - billAmount);
        return diffA - diffB;
      });

      setTransactions(txList);
    } catch (err) {
      console.error('Error loading transactions:', err);
      setError('Failed to load transactions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const calculateConfidence = (transaction) => {
    const billAmount = Math.abs(bill.amount || 0);
    const txAmount = Math.abs(transaction.amount || 0);
    
    const amountDiff = Math.abs(billAmount - txAmount);
    const amountMatch = amountDiff <= 0.50 ? 1.0 : (amountDiff <= 5.0 ? 0.7 : 0.4);
    
    const billDate = new Date(bill.dueDate || bill.nextDueDate);
    const txDate = new Date(transaction.date);
    const daysDiff = Math.abs((billDate - txDate) / (1000 * 60 * 60 * 24));
    const dateMatch = daysDiff <= 3 ? 1.0 : (daysDiff <= 7 ? 0.7 : 0.4);
    
    return (amountMatch * 0.6) + (dateMatch * 0.4);
  };

  const extractKeywords = (text) => {
    if (!text) return [];
    
    const stopWords = new Set(['the', 'and', 'for', 'from', 'with', 'to', 'of', 'in', 'on', 'at', 'by', 'transfer', 'payment', 'conf', 'check']);
    
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 5); // Limit to 5 keywords
  };

  const handleLink = async () => {
    if (!selectedTransaction) {
      setError('Please select a transaction to link.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const eventRef = doc(db, 'users', currentUser.uid, 'financialEvents', bill.id);
      const txRef = doc(db, 'users', currentUser.uid, 'transactions', selectedTransaction.id);

      // Update bill with transaction link
      await updateDoc(eventRef, {
        linkedTransactionId: selectedTransaction.id,
        linkedAt: serverTimestamp(),
        linkConfidence: 0.95,
        linkStrategy: 'manual'
      });

      // Update transaction with bill link
      await updateDoc(txRef, {
        linkedEventId: bill.id,
        linkedAt: serverTimestamp()
      });

      // Create payment rule if requested
      if (createRule) {
        const keywords = extractKeywords(selectedTransaction.merchant_name || selectedTransaction.name);
        
        const ruleId = `rule-${bill.name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30)}-${Date.now().toString(36)}`;
        
        const rule = {
          ruleId: ruleId,
          billName: bill.name,
          billId: bill.id,
          matchCriteria: {
            amountExact: Math.abs(selectedTransaction.amount),
            amountTolerance: 0.50,
            requiredKeywords: keywords,
            optionalKeywords: [],
            transactionTypes: [],
            dateWindow: {
              daysBefore: 3,
              daysAfter: 5
            }
          },
          createdAt: serverTimestamp(),
          createdBy: 'manual_link',
          matchCount: 1,
          confidence: 0.95,
          enabled: true,
          source: 'manual',
          examples: [
            {
              transactionId: selectedTransaction.id,
              transactionName: selectedTransaction.merchant_name || selectedTransaction.name,
              amount: selectedTransaction.amount,
              date: selectedTransaction.date
            }
          ]
        };

        await addDoc(collection(db, 'users', currentUser.uid, 'paymentRules'), rule);
      }

      // Callback to parent
      if (onLink) {
        onLink(bill.id, selectedTransaction.id);
      }

      // Close modal
      onClose();
    } catch (err) {
      console.error('Error linking transaction:', err);
      setError('Failed to link transaction. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!bill) return null;

  return (
    <div className="bill-transaction-linker-overlay" onClick={onClose}>
      <div className="bill-transaction-linker-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔗 Link Transaction to Bill</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="bill-info">
            <h3>Bill: {bill.name}</h3>
            <p>Amount: ${Math.abs(bill.amount || 0).toFixed(2)}</p>
            <p>Due: {bill.dueDate || bill.nextDueDate}</p>
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">
              <p>No unlinked transactions found within ±7 days of bill due date.</p>
              <p>Try adjusting the date range or check if the transaction is already linked.</p>
            </div>
          ) : (
            <>
              <div className="transactions-header">
                <h4>Select Transaction ({transactions.length} found)</h4>
                <p className="hint">Showing unlinked transactions from {new Date(new Date(bill.dueDate || bill.nextDueDate).setDate(new Date(bill.dueDate || bill.nextDueDate).getDate() - 7)).toISOString().split('T')[0]} to {new Date(new Date(bill.dueDate || bill.nextDueDate).setDate(new Date(bill.dueDate || bill.nextDueDate).getDate() + 7)).toISOString().split('T')[0]}</p>
              </div>

              <div className="transactions-list">
                {transactions.map(tx => {
                  const confidence = calculateConfidence(tx);
                  const isSelected = selectedTransaction?.id === tx.id;

                  return (
                    <div
                      key={tx.id}
                      className={`transaction-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedTransaction(tx)}
                    >
                      <div className="transaction-main">
                        <div className="transaction-name">
                          {tx.merchant_name || tx.name}
                        </div>
                        <div className="transaction-amount">
                          ${Math.abs(tx.amount).toFixed(2)}
                        </div>
                      </div>
                      <div className="transaction-details">
                        <span className="transaction-date">{tx.date}</span>
                        <span className={`confidence-badge confidence-${confidence >= 0.8 ? 'high' : confidence >= 0.6 ? 'medium' : 'low'}`}>
                          {Math.round(confidence * 100)}% match
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="create-rule-option">
                <label>
                  <input
                    type="checkbox"
                    checked={createRule}
                    onChange={e => setCreateRule(e.target.checked)}
                  />
                  <span>Create payment rule for future matches</span>
                </label>
                <p className="hint">
                  This will automatically match similar transactions in the future
                </p>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleLink}
            disabled={!selectedTransaction || saving}
          >
            {saving ? 'Linking...' : 'Link Transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}
