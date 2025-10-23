// Minimal Working Transactions Page - v1.1 with proper styling
import React, { useState, useEffect } from 'react';
import { doc, collection, deleteDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { formatDateForDisplay } from '../utils/DateUtils';
import './Transactions.css';
import { useAuth } from '../contexts/AuthContext';

const Transactions = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadTransactions(), loadAccounts()]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    const snapshot = await getDocs(collection(db, 'users', currentUser.uid, 'transactions'));
    const txns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setTransactions(txns.sort((a, b) => new Date(b.date) - new Date(a.date)));
  };

  const loadAccounts = async () => {
    const snapshot = await getDocs(collection(db, 'users', currentUser.uid, 'accounts'));
    const accts = {};
    snapshot.docs.forEach(doc => {
      accts[doc.id] = { id: doc.id, ...doc.data() };
    });
    setAccounts(accts);
  };

  const handleEdit = (transaction) => {
    setEditingId(transaction.id);
    setEditForm({
      merchant_name: transaction.merchant_name || transaction.name || '',
      amount: Math.abs(transaction.amount),
      category: transaction.category || '',
      date: transaction.date
    });
  };

  const handleSave = async () => {
    try {
      const txnRef = doc(db, 'users', currentUser.uid, 'transactions', editingId);
      const amount = parseFloat(editForm.amount);
      await updateDoc(txnRef, {
        merchant_name: editForm.merchant_name,
        amount: amount < 0 ? amount : -amount,
        category: editForm.category,
        date: editForm.date
      });
      await loadTransactions();
      setEditingId(null);
    } catch (error) {
      console.error('Error saving:', error);
      alert('Error saving transaction');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'transactions', id));
      await loadTransactions();
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Error deleting transaction');
    }
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = !searchTerm || 
      (t.merchant_name || t.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !categoryFilter || t.category === categoryFilter;
    const matchesAccount = !accountFilter || t.account === accountFilter;
    return matchesSearch && matchesCategory && matchesAccount;
  });

  const categories = [...new Set(transactions.map(t => t.category).filter(Boolean))];

  if (loading) {
    return (
      <div className="transactions-container">
        <div className="page-header">
          <h2>💰 Transactions</h2>
          <p>Loading your transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="transactions-container">
      <div className="page-header">
        <h2>💰 Transactions</h2>
        <p>{filteredTransactions.length} transactions</p>
      </div>

      <div className="transaction-controls" style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <input
          type="text"
          placeholder="Search transactions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: '1 1 300px',
            padding: '12px',
            fontSize: '14px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            background: '#fff'
          }}
        />
        <select 
          value={categoryFilter} 
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: '12px',
            fontSize: '14px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            background: '#fff',
            minWidth: '150px'
          }}
        >
          <option value="">All Categories</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <select 
          value={accountFilter} 
          onChange={(e) => setAccountFilter(e.target.value)}
          style={{
            padding: '12px',
            fontSize: '14px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            background: '#fff',
            minWidth: '150px'
          }}
        >
          <option value="">All Accounts</option>
          {Object.values(accounts).map(acc => (
            <option key={acc.id} value={acc.id}>{acc.name || acc.official_name || 'Account'}</option>
          ))}
        </select>
      </div>

      <div className="transactions-list" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {filteredTransactions.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            background: '#fff',
            borderRadius: '8px',
            color: '#666'
          }}>
            <h3>No transactions found</h3>
            <p>Try adjusting your filters</p>
          </div>
        ) : (
          filteredTransactions.map(transaction => (
            <div 
              key={transaction.id} 
              className="transaction-card"
              style={{
                padding: '16px',
                background: '#fff',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              {editingId === transaction.id ? (
                <div style={{
                  display: 'grid',
                  gap: '12px',
                  gridTemplateColumns: '1fr 1fr',
                }}>
                  <input
                    value={editForm.merchant_name}
                    onChange={(e) => setEditForm({...editForm, merchant_name: e.target.value})}
                    placeholder="Merchant name"
                    style={{
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      gridColumn: '1 / -1'
                    }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({...editForm, amount: e.target.value})}
                    placeholder="Amount"
                    style={{
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                    style={{
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                  <input
                    type="text"
                    value={editForm.category}
                    onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                    placeholder="Category"
                    list="categories"
                    style={{
                      padding: '10px',
                      fontSize: '14px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      gridColumn: '1 / -1'
                    }}
                  />
                  <datalist id="categories">
                    {categories.map(cat => <option key={cat} value={cat} />)}
                  </datalist>
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    gridColumn: '1 / -1'
                  }}>
                    <button 
                      onClick={handleSave}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: '#00d26a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      ✓ Save
                    </button>
                    <button 
                      onClick={() => setEditingId(null)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: '#666',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      ✕ Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '16px'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#1a1a1a',
                      marginBottom: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {transaction.merchant_name || transaction.name || 'Unknown'}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#666',
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap'
                    }}>
                      <span>{formatDateForDisplay(transaction.date)}</span>
                      {transaction.category && (
                        <>
                          <span>•</span>
                          <span style={{
                            background: '#f0f0f0',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '12px'
                          }}>
                            {transaction.category}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    flexShrink: 0
                  }}>
                    <span style={{
                      fontSize: '18px',
                      fontWeight: '700',
                      color: transaction.amount < 0 ? '#f44336' : '#00d26a',
                      minWidth: '80px',
                      textAlign: 'right'
                    }}>
                      ${Math.abs(transaction.amount).toFixed(2)}
                    </span>
                    <button 
                      onClick={() => handleEdit(transaction)}
                      style={{
                        padding: '8px 16px',
                        background: '#007bff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(transaction.id)}
                      style={{
                        padding: '8px 16px',
                        background: '#f44336',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Transactions;
