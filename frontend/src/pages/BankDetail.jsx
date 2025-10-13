import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, orderBy, limit, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import './BankDetail.css';

const BankDetail = () => {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    type: '',
    dateFrom: '',
    dateTo: ''
  });
  const [monthlyStats, setMonthlyStats] = useState({
    income: 0,
    expenses: 0,
    net: 0
  });

  // Load account details from Firebase settings
  useEffect(() => {
    const loadAccountDetails = async () => {
      if (!currentUser) return;
      
      try {
        console.log('🔍 [BankDetail] Loading account details for:', accountId);
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const settingsDocSnap = await getDoc(settingsDocRef);
        
        if (settingsDocSnap.exists()) {
          const data = settingsDocSnap.data();
          const plaidAccounts = data.plaidAccounts || [];
          const foundAccount = plaidAccounts.find(acc => acc.account_id === accountId);
          
          if (foundAccount) {
            console.log('✅ [BankDetail] Account found:', foundAccount);
            setAccount(foundAccount);
          } else {
            console.warn('⚠️ [BankDetail] Account not found');
          }
        }
      } catch (error) {
        console.error('❌ [BankDetail] Error loading account:', error);
      }
    };
    
    loadAccountDetails();
  }, [currentUser, accountId]);

  // Real-time listener for transactions filtered by account_id
  useEffect(() => {
    if (!currentUser || !accountId) return;
    
    console.log('📡 [BankDetail] Setting up real-time listener for account:', accountId);
    
    const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
    const q = query(
      transactionsRef,
      where('account_id', '==', accountId),
      orderBy('date', 'desc'),
      limit(500)
    );
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const txs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log('✅ [BankDetail] Loaded', txs.length, 'transactions for account');
        setTransactions(txs);
        setLoading(false);
      },
      (error) => {
        console.error('❌ [BankDetail] Listener error:', error);
        setTransactions([]);
        setLoading(false);
      }
    );
    
    return () => {
      console.log('🔌 [BankDetail] Cleaning up listener');
      unsubscribe();
    };
  }, [currentUser, accountId]);

  // Filter and calculate stats when transactions change
  useEffect(() => {
    let filtered = [...transactions];
    
    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(t => 
        (t.name && t.name.toLowerCase().includes(searchLower)) ||
        (t.merchant_name && t.merchant_name.toLowerCase().includes(searchLower)) ||
        (t.category && (
          Array.isArray(t.category) 
            ? t.category.some(c => c.toLowerCase().includes(searchLower))
            : t.category.toLowerCase().includes(searchLower)
        ))
      );
    }
    
    // Apply type filter
    if (filters.type) {
      filtered = filtered.filter(t => t.type === filters.type);
    }
    
    // Apply date filters
    if (filters.dateFrom) {
      filtered = filtered.filter(t => t.date >= filters.dateFrom);
    }
    
    if (filters.dateTo) {
      filtered = filtered.filter(t => t.date <= filters.dateTo);
    }
    
    setFilteredTransactions(filtered);
    
    // Calculate monthly stats
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlyTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate.getMonth() === currentMonth && 
             transactionDate.getFullYear() === currentYear;
    });
    
    let income = 0;
    let expenses = 0;
    
    monthlyTransactions.forEach(t => {
      const amount = parseFloat(t.amount) || 0;
      if (amount > 0) {
        income += amount;
      } else {
        expenses += Math.abs(amount);
      }
    });
    
    setMonthlyStats({
      income,
      expenses,
      net: income - expenses
    });
  }, [transactions, searchTerm, filters]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getAccountDisplayName = (account) => {
    if (!account) return 'Account';
    
    if (account.official_name && account.official_name.trim()) {
      return account.official_name;
    }
    
    if (account.name && account.name.trim()) {
      return account.name;
    }
    
    const institutionName = account.institution_name || '';
    const accountType = account.type || 'Account';
    const mask = account.mask ? `••${account.mask}` : '';
    
    return `${institutionName} ${accountType} ${mask}`.trim() || 'Account';
  };

  const getAccountTypeIcon = (type) => {
    switch ((type || 'checking').toLowerCase()) {
      case 'checking': return '🦁';
      case 'savings': return '💰';
      case 'credit': return '💳';
      case 'investment': return '📈';
      default: return '🛍️';
    }
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setFilters({
      type: '',
      dateFrom: '',
      dateTo: ''
    });
  };

  if (loading) {
    return (
      <div className="bank-detail-container">
        <div className="page-header">
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="bank-detail-container">
        <div className="page-header">
          <h2>Account Not Found</h2>
          <button className="back-btn" onClick={() => navigate('/accounts')}>
            ← Back to Accounts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bank-detail-container">
      {/* Back Button */}
      <button className="back-btn" onClick={() => navigate('/accounts')}>
        ← Back to Accounts
      </button>

      {/* Bank Header */}
      <div className="bank-header">
        <div className="bank-header-content">
          <div className="bank-title">
            <span className="bank-icon">{getAccountTypeIcon(account.type)}</span>
            <div>
              <h2>{getAccountDisplayName(account)}</h2>
              <p className="account-subtitle">
                {account.type} {account.mask ? `••${account.mask}` : ''}
              </p>
            </div>
          </div>
          <div className="bank-balance">
            <span className="balance-label">Current Balance</span>
            <div className="balance-amount">{formatCurrency(parseFloat(account.balance) || 0)}</div>
          </div>
        </div>
      </div>

      {/* Monthly Stats */}
      <div className="stats-cards">
        <div className="stat-card income">
          <span className="stat-icon">💰</span>
          <div className="stat-content">
            <span className="stat-label">Income This Month</span>
            <span className="stat-value">{formatCurrency(monthlyStats.income)}</span>
          </div>
        </div>
        <div className="stat-card expense">
          <span className="stat-icon">💸</span>
          <div className="stat-content">
            <span className="stat-label">Expenses This Month</span>
            <span className="stat-value">{formatCurrency(monthlyStats.expenses)}</span>
          </div>
        </div>
        <div className="stat-card net">
          <span className="stat-icon">📊</span>
          <div className="stat-content">
            <span className="stat-label">Net This Month</span>
            <span className={`stat-value ${monthlyStats.net >= 0 ? 'positive' : 'negative'}`}>
              {formatCurrency(monthlyStats.net)}
            </span>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="filters-section">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="filters-row">
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          >
            <option value="">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            placeholder="From Date"
          />
          
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            placeholder="To Date"
          />
          
          <button className="clear-filters-btn" onClick={handleClearFilters}>
            Clear Filters
          </button>
        </div>
      </div>

      {/* Transaction Count */}
      <div className="transaction-count">
        Showing {filteredTransactions.length} of {transactions.length} transactions
      </div>

      {/* Transactions List */}
      <div className="transactions-list">
        {filteredTransactions.length === 0 ? (
          <div className="no-transactions">
            <p>No transactions found</p>
          </div>
        ) : (
          filteredTransactions.map((transaction) => {
            const amount = parseFloat(transaction.amount) || 0;
            const isIncome = amount > 0;
            
            return (
              <div key={transaction.id} className="transaction-card">
                <div className="transaction-header">
                  <div className="transaction-name">
                    <span className={`transaction-type-icon ${isIncome ? 'income' : 'expense'}`}>
                      {isIncome ? '💰' : '💸'}
                    </span>
                    <div>
                      <h4>{transaction.merchant_name || transaction.name || 'Transaction'}</h4>
                      {transaction.category && (
                        Array.isArray(transaction.category) ? transaction.category.length > 0 : transaction.category
                      ) && (
                        <span className="transaction-category">
                          {Array.isArray(transaction.category) 
                            ? transaction.category.join(', ') 
                            : transaction.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="transaction-details">
                    <span className={`transaction-amount ${isIncome ? 'income' : 'expense'}`}>
                      {isIncome ? '+' : '-'}{formatCurrency(Math.abs(amount))}
                    </span>
                    <span className="transaction-date">{formatDate(transaction.date)}</span>
                    {transaction.pending && (
                      <span className="pending-badge">Pending</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default BankDetail;
