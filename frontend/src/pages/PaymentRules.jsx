import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { TRANSACTION_CATEGORIES, getCategoryIcon } from '../constants/categories';
import './PaymentRules.css';

export default function PaymentRules() {
  const { currentUser } = useAuth();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [testResults, setTestResults] = useState(null);

  // Load all payment rules
  useEffect(() => {
    if (! currentUser) return;
    loadRules();
  }, [currentUser]);

  const loadRules = async () => {
    try {
      setLoading(true);
      const rulesRef = collection(db, 'users', currentUser.uid, 'paymentRules');
      const snapshot = await getDocs(rulesRef);
      
      const rulesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc. data()
      }));
      
      // Sort by priority (higher priority first)
      rulesData.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      
      setRules(rulesData);
      console.log(`✅ Loaded ${rulesData.length} payment rules`);
    } catch (error) {
      console.error('Error loading rules:', error);
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRule = async (ruleData) => {
    try {
      if (editingRule) {
        // Update existing rule
        const ruleRef = doc(db, 'users', currentUser.uid, 'paymentRules', editingRule.id);
        await updateDoc(ruleRef, {
          ...ruleData,
          updatedAt: new Date().toISOString()
        });
        console.log('✅ Rule updated');
      } else {
        // Create new rule
        const rulesRef = collection(db, 'users', currentUser.uid, 'paymentRules');
        await addDoc(rulesRef, {
          ...ruleData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        console.log('✅ Rule created');
      }
      
      await loadRules();
      setShowModal(false);
      setEditingRule(null);
    } catch (error) {
      console.error('Error saving rule:', error);
      alert('Error saving rule:  ' + error.message);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (! confirm('Are you sure you want to delete this rule?')) return;
    
    try {
      const ruleRef = doc(db, 'users', currentUser.uid, 'paymentRules', ruleId);
      await deleteDoc(ruleRef);
      console.log('✅ Rule deleted');
      await loadRules();
    } catch (error) {
      console.error('Error deleting rule:', error);
      alert('Error deleting rule: ' + error.message);
    }
  };

  const handleToggleRule = async (rule) => {
    try {
      const ruleRef = doc(db, 'users', currentUser.uid, 'paymentRules', rule.id);
      await updateDoc(ruleRef, {
        enabled: !rule.enabled,
        updatedAt: new Date().toISOString()
      });
      console.log(`✅ Rule ${rule.enabled ? 'disabled' : 'enabled'}`);
      await loadRules();
    } catch (error) {
      console.error('Error toggling rule:', error);
      alert('Error toggling rule: ' + error.message);
    }
  };

  const handleTestRule = async (rule) => {
    try {
      // Load recent transactions
      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const q = query(
        transactionsRef,
        where('date', '>=', thirtyDaysAgo. toISOString().split('T')[0])
      );
      const snapshot = await getDocs(q);
      
      const transactions = snapshot.docs.map(doc => ({ id: doc.id, ... doc.data() }));
      
      // Test rule against transactions
      const matches = transactions.filter(txn => {
        const merchantName = (txn.name || txn.merchant_name || '').toLowerCase();
        const amount = Math.abs(parseFloat(txn.amount || 0));
        
        // Check if merchant name matches
        const nameMatches = rule.merchantPatterns?. some(pattern => 
          merchantName.includes(pattern.toLowerCase())
        );
        
        // Check if amount matches (within tolerance)
        const amountTolerance = rule.amountTolerance || 5;
        const amountMatches = rule.expectedAmount 
          ? Math.abs(amount - rule.expectedAmount) <= amountTolerance
          :  true;
        
        return nameMatches && amountMatches;
      });
      
      setTestResults({
        rule: rule,
        matchCount: matches.length,
        matches: matches. slice(0, 10) // Show first 10 matches
      });
    } catch (error) {
      console.error('Error testing rule:', error);
      alert('Error testing rule: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="payment-rules-container">
        <div className="page-header">
          <h2>⚙️ Payment Rules</h2>
          <p>Loading your payment rules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-rules-container">
      <div className="page-header">
        <div className="header-content">
          <div>
            <h2>⚙️ Payment Rules</h2>
            <p>Manage automatic payment matching rules for your bills</p>
          </div>
          <button 
            onClick={() => {
              setEditingRule(null);
              setShowModal(true);
            }}
            className="add-rule-btn"
            style={{
              background: 'linear-gradient(135deg, #00ff88 0%, #00d4ff 100%)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontWeight: '700',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            + Add New Rule
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div className="stat-card" style={{ background: '#1a1a1a', padding:  '20px', borderRadius: '12px', border: '1px solid #333' }}>
          <h3 style={{ color: '#00ff88', marginBottom: '10px' }}>Total Rules</h3>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>{rules.length}</div>
        </div>
        <div className="stat-card" style={{ background: '#1a1a1a', padding: '20px', borderRadius: '12px', border: '1px solid #333' }}>
          <h3 style={{ color: '#00ff88', marginBottom: '10px' }}>Active Rules</h3>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>
            {rules.filter(r => r.enabled !== false).length}
          </div>
        </div>
        <div className="stat-card" style={{ background: '#1a1a1a', padding: '20px', borderRadius: '12px', border: '1px solid #333' }}>
          <h3 style={{ color: '#00ff88', marginBottom: '10px' }}>Disabled Rules</h3>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>
            {rules.filter(r => r.enabled === false).length}
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="rules-list">
        {rules.length > 0 ? (
          rules.map(rule => (
            <div 
              key={rule.id}
              className="rule-card"
              style={{
                background: rule.enabled === false ? 'rgba(255, 255, 255, 0.05)' : '#1a1a1a',
                border: `2px solid ${rule.enabled === false ? '#666' : '#00ff88'}`,
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '16px',
                opacity: rule.enabled === false ? 0.6 : 1
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {rule.billName || 'Unnamed Rule'}
                    {rule.enabled === false && (
                      <span style={{ 
                        background: '#666', 
                        color: '#fff', 
                        padding: '2px 8px', 
                        borderRadius: '4px', 
                        fontSize: '11px',
                        fontWeight: 'normal'
                      }}>
                        DISABLED
                      </span>
                    )}
                  </h3>
                  <div style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>
                    Priority: {rule.priority || 0} • Category: {rule.category || 'N/A'}
                  </div>
                  
                  {/* Rule Details */}
                  <div style={{ background: 'rgba(0, 255, 136, 0.1)', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#fff', marginBottom: '8px' }}>
                      <strong>Merchant Patterns:</strong> {rule.merchantPatterns?.join(', ') || 'None'}
                    </div>
                    {rule.expectedAmount && (
                      <div style={{ fontSize: '13px', color: '#fff' }}>
                        <strong>Expected Amount:</strong> ${rule. expectedAmount.toFixed(2)} ± ${rule.amountTolerance || 5}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleTestRule(rule)}
                    style={{
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#3b82f6',
                      border: '1px solid #3b82f6',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                    title="Test this rule"
                  >
                    🧪 Test
                  </button>
                  <button
                    onClick={() => handleToggleRule(rule)}
                    style={{
                      background: rule.enabled === false ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 107, 0, 0.2)',
                      color: rule.enabled === false ? '#00ff88' : '#ff6b00',
                      border: `1px solid ${rule.enabled === false ? '#00ff88' :  '#ff6b00'}`,
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                    title={rule.enabled === false ? 'Enable rule' : 'Disable rule'}
                  >
                    {rule.enabled === false ? '✓ Enable' : '⏸ Disable'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingRule(rule);
                      setShowModal(true);
                    }}
                    style={{
                      background: 'rgba(0, 180, 255, 0.2)',
                      color: '#00b4ff',
                      border: '1px solid #00b4ff',
                      borderRadius: '6px',
                      padding:  '8px 12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                    title="Edit rule"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    style={{
                      background: 'rgba(255, 7, 58, 0.2)',
                      color: '#ff073a',
                      border: '1px solid #ff073a',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                    title="Delete rule"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px', 
            background: '#1a1a1a', 
            borderRadius: '12px',
            border: '2px dashed #333'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <h3 style={{ color: '#fff', marginBottom: '8px' }}>No Payment Rules Yet</h3>
            <p style={{ color: '#888', marginBottom: '20px' }}>
              Create your first rule to automatically match transactions to bills
            </p>
            <button 
              onClick={() => {
                setEditingRule(null);
                setShowModal(true);
              }}
              style={{
                background: 'linear-gradient(135deg, #00ff88 0%, #00d4ff 100%)',
                color:  '#000',
                border: 'none',
                borderRadius:  '8px',
                padding:  '12px 24px',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              + Create First Rule
            </button>
          </div>
        )}
      </div>

      {/* Test Results Modal */}
      {testResults && (
        <div 
          className="modal-overlay"
          onClick={() => setTestResults(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
        >
          <div 
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1a1a1a',
              border: '2px solid #333',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            <h3 style={{ color: '#fff', marginBottom: '16px' }}>
              🧪 Test Results:  {testResults.rule.billName}
            </h3>
            
            <div style={{ 
              background: 'rgba(0, 255, 136, 0.1)', 
              padding: '16px', 
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#00ff88', marginBottom: '8px' }}>
                {testResults.matchCount} Matches Found
              </div>
              <div style={{ fontSize: '13px', color: '#888' }}>
                In the last 30 days of transactions
              </div>
            </div>

            {testResults.matches.length > 0 && (
              <div>
                <h4 style={{ color: '#fff', marginBottom: '12px' }}>Matching Transactions:</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {testResults.matches.map(txn => (
                    <div 
                      key={txn. id}
                      style={{
                        background: '#2a2a2a',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #444'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: '#fff', fontWeight: '600' }}>
                          {txn.name || txn.merchant_name}
                        </span>
                        <span style={{ color: '#00ff88', fontWeight: '700' }}>
                          ${Math.abs(parseFloat(txn.amount)).toFixed(2)}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color:  '#888' }}>
                        {txn.date}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setTestResults(null)}
              style={{
                marginTop: '20px',
                width: '100%',
                background: '#444',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Rule Modal - Coming next!  */}
      {showModal && (
        <RuleFormModal
          rule={editingRule}
          onSave={handleSaveRule}
          onClose={() => {
            setShowModal(false);
            setEditingRule(null);
          }}
        />
      )}
    </div>
  );
}

// Rule Form Modal Component
function RuleFormModal({ rule, onSave, onClose }) {
  const [billName, setBillName] = useState(rule?. billName || '');
  const [merchantPatterns, setMerchantPatterns] = useState(rule?.merchantPatterns?. join(', ') || '');
  const [expectedAmount, setExpectedAmount] = useState(rule?. expectedAmount || '');
  const [amountTolerance, setAmountTolerance] = useState(rule?.amountTolerance || 5);
  const [category, setCategory] = useState(rule?.category || 'Bills & Utilities');
  const [priority, setPriority] = useState(rule?. priority || 0);
  const [enabled, setEnabled] = useState(rule?.enabled !== false);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const ruleData = {
      billName,
      merchantPatterns:  merchantPatterns.split(',').map(p => p.trim()).filter(p => p),
      expectedAmount: expectedAmount ?  parseFloat(expectedAmount) : null,
      amountTolerance: parseFloat(amountTolerance),
      category,
      priority:  parseInt(priority),
      enabled
    };
    
    onSave(ruleData);
  };

  return (
    <div 
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
      }}
    >
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a1a',
          border: '2px solid #333',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '20px' }}>
          {rule ? 'Edit Rule' : 'Create New Rule'}
        </h3>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:  '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontSize: '14px' }}>
              Bill Name *
            </label>
            <input
              type="text"
              value={billName}
              onChange={(e) => setBillName(e.target.value)}
              required
              placeholder="e.g., Netflix, Electric Bill"
              style={{
                width: '100%',
                padding: '10px',
                background: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontSize: '14px' }}>
              Merchant Patterns * (comma-separated)
            </label>
            <input
              type="text"
              value={merchantPatterns}
              onChange={(e) => setMerchantPatterns(e.target.value)}
              required
              placeholder="e.g., Netflix, NETFLIX INC, netflix.com"
              style={{
                width: '100%',
                padding: '10px',
                background: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px'
              }}
            />
            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Enter text patterns that appear in transaction names
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap:  '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ display:  'block', marginBottom: '8px', color: '#ccc', fontSize: '14px' }}>
                Expected Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
                placeholder="15.99"
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius:  '6px',
                  color: '#fff',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontSize:  '14px' }}>
                Amount Tolerance ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={amountTolerance}
                onChange={(e) => setAmountTolerance(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px',
                  background:  '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom:  '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontSize: '14px' }}>
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              style={{
                width:  '100%',
                padding:  '10px',
                background:  '#2a2a2a',
                border: '1px solid #444',
                borderRadius:  '6px',
                color:  '#fff',
                fontSize: '14px'
              }}
            >
              {TRANSACTION_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>
                  {getCategoryIcon(cat)} {cat}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontSize:  '14px' }}>
              Priority (higher = matches first)
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px',
                background: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color:  '#ccc', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px' }}>Rule Enabled</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: '#444',
                color:  '#fff',
                border: 'none',
                borderRadius:  '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding:  '10px 20px',
                background: 'linear-gradient(135deg, #00ff88 0%, #00d4ff 100%)',
                color: '#000',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              {rule ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}