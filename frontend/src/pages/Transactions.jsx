// Minimal Working Transactions Page - v1.0
import React, { useState, useEffect } from 'react';
import { doc, collection, addDoc, deleteDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { formatDateForDisplay, formatDateForInput } from '../utils/DateUtils';
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
      await updateDoc(txnRef, {
        merchant_name: editForm.merchant_name,
        amount: parseFloat(editForm.amount) * (editForm.amount < 0 ? 1 : -1),
        category: editForm.category,
        date: editForm.date
      });
      await loadTransactions();
      setEditingId(null);
    } catch (error) {
      console.error('Error saving:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'transactions', id));
      await loadTransactions();
    } catch (error) {
      console.error('Error deleting:', error);
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
    return <div className="transactions-container"><h2>Loading...</h2></div>;
  }

  return (
    <div className="transactions-container">
      <div className="page-header">
        <h2>💰 Transactions</h2>
        <p>{filteredTransactions.length} transactions</p>
      </div>

      <div className="filters" style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{flex: 1, padding: '8px'}}
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{padding: '8px'}}>
          <option value="">All Categories</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} style={{padding: '8px'}}>
          <option value="">All Accounts</option>
          {Object.values(accounts).map(acc => (
            <option key={acc.id} value={acc.id}>{acc.name || acc.official_name || 'Account'}</option>
          ))}
        </select>
      </div>

      <div className="transactions-list">
        {filteredTransactions.map(transaction => (
          <div key={transaction.id} className="transaction-item" style={{
            padding: '15px',
            marginBottom: '10px',
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #ddd'
          }}>
            {editingId === transaction.id ? (
              <div style={{display: 'grid', gap: '10px'}}>
                <input
                  value={editForm.merchant_name}
                  onChange={(e) => setEditForm({...editForm, merchant_name: e.target.value})}
                  placeholder="Merchant"
                  style={{padding: '8px'}}
                />
                <input
                  type="number"
                  value={editForm.amount}
                  onChange={(e) => setEditForm({...editForm, amount: e.target.value})}
                  placeholder="Amount"
                  style={{padding: '8px'}}
                />
                <input
                  type="text"
                  value={editForm.category}
                  onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                  placeholder="Category"
                  list="categories"
                  style={{padding: '8px'}}
                />
                <datalist id="categories">
                  {categories.map(cat => <option key={cat} value={cat} />)}
                </datalist>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                  style={{padding: '8px'}}
                />
                <div style={{display: 'flex', gap: '10px'}}>
                  <button onClick={handleSave} style={{padding: '8px 16px', background: '#00d26a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} style={{padding: '8px 16px', background: '#666', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div>
                  <div style={{fontWeight: 'bold'}}>{transaction.merchant_name || transaction.name || 'Unknown'}</div>
                  <div style={{fontSize: '14px', color: '#666'}}>
                    {formatDateForDisplay(transaction.date)} • {transaction.category || 'Uncategorized'}
                  </div>
                </div>
                <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                  <span style={{fontWeight: 'bold', color: transaction.amount < 0 ? '#f44336' : '#00d26a'}}>
                    ${Math.abs(transaction.amount).toFixed(2)}
                  </span>
                  <button onClick={() => handleEdit(transaction)} style={{padding: '5px 10px', cursor: 'pointer'}}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(transaction.id)} style={{padding: '5px 10px', background: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Transactions;
