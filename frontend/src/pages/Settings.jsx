import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { getDaysUntilDateInPacific } from '../utils/DateUtils';
import { Link } from 'react-router-dom';
import './Settings.css';
import { useAuth } from '../contexts/AuthContext';


const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const { currentUser } = useAuth();
  
  const [personalInfo, setPersonalInfo] = useState({
    yourName: '',
    spouseName: ''
  });

  const [paySchedules, setPaySchedules] = useState({
    yours: {
      type: 'bi-weekly',
      amount: '',
      lastPaydate: '',
      bankSplit: {
        fixedAmount: { bank: 'SoFi', amount: '400' },
        remainder: { bank: 'Bank of America' }
      }
    },
    spouse: {
      type: 'bi-monthly',
      amount: '',
      dates: [15, 30]
    }
  });

  const [bankAccounts, setBankAccounts] = useState({
    bofa: { name: 'Bank of America', type: 'Checking', balance: '' },
    sofi: { name: 'SoFi', type: 'Savings', balance: '' },
    usaa: { name: 'USAA', type: 'Checking', balance: '' },
    cap1: { name: 'Capital One', type: 'Credit', balance: '' }
  });

  const [bills, setBills] = useState([]);

  const [preferences, setPreferences] = useState({
    safetyBuffer: 200,
    weeklyEssentials: 150,
    billSortOrder: 'dueDate',
    urgentDays: 7,
    warningDays: 14,
    dueDateAlerts: true,
    debugMode: false
  });

  const [nextPaydayOverride, setNextPaydayOverride] = useState('');

  useEffect(() => {
    loadSettings();
    // Load debug mode from localStorage
    const debugModeEnabled = localStorage.getItem('debugMode') === 'true';
    setPreferences(prev => ({ ...prev, debugMode: debugModeEnabled }));
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);

      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        
        setPersonalInfo(data.personalInfo || personalInfo);
        setPaySchedules(data.paySchedules || paySchedules);
        setBankAccounts(data.bankAccounts || bankAccounts);
        setBills(data.bills || []);
        setPreferences(data.preferences || preferences);
        setNextPaydayOverride(data.nextPaydayOverride || '');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage('Error loading settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setMessage('');

      console.log('🔵 SAVE SETTINGS CLICKED');

      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      
      // READ CURRENT DATA FIRST - THIS PRESERVES plaidAccounts AND ALL OTHER FIELDS
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};

      // 🔥 ENSURE spouse schedule always has dates array - THIS IS THE KEY FIX!
      const spouseSchedule = {
        ...paySchedules.spouse,
        dates: paySchedules.spouse.dates || [15, 30],
        type: paySchedules.spouse.type || 'bi-monthly'
      };

      console.log('🔵 Enhanced spouse schedule:', spouseSchedule);

      // MERGE WITH EXISTING DATA
      const settingsData = {
        ...currentData,
        personalInfo,
        paySchedules: {
          ...paySchedules,
          spouse: spouseSchedule  // Use enhanced version with dates guaranteed
        },
        // 🔥 CRITICAL FIX: Save pay schedule data at root level for Spendability.jsx
        lastPayDate: paySchedules.yours.lastPaydate,
        payAmount: paySchedules.yours.amount,
        spousePayAmount: spouseSchedule.amount,
        bankAccounts,
        bills: bills.filter(bill => bill.name && bill.amount),
        preferences,
        nextPaydayOverride,
        lastUpdated: new Date().toISOString()
      };

      console.log('🔵 Settings data prepared:', settingsData);

      await setDoc(settingsDocRef, settingsData);

      console.log('🔵 Settings saved to Firebase');
      console.log('🔵 Now calculating payday...');

      // Use override date if provided, otherwise calculate next payday
      let nextPaydayInfo;
      if (nextPaydayOverride) {
        console.log('🔵 Using manual override:', nextPaydayOverride);
        const daysUntil = getDaysUntilDateInPacific(nextPaydayOverride);
        nextPaydayInfo = {
          date: nextPaydayOverride,
          daysUntil: daysUntil,
          source: "manual_override",
          amount: 0
        };
        console.log('🔵 Override payday info:', nextPaydayInfo);
      } else {
        console.log('🔵 Calculating from paySchedules...');
        console.log('🔵 Input to calculator:', {
          yours: paySchedules.yours,
          spouse: spouseSchedule  // 🔥 Use enhanced version!
        });
        
        nextPaydayInfo = PayCycleCalculator.calculateNextPayday(
          paySchedules.yours,
          spouseSchedule  // 🔥 Pass enhanced spouse schedule with dates!
        );
        
        console.log('🔵 Calculated payday result:', nextPaydayInfo);
      }

      if (nextPaydayInfo) {
        console.log('🔵 Saving to Firebase payCycle collection:', nextPaydayInfo);
        await setDoc(doc(db, 'users', currentUser.uid, 'financial', 'payCycle'), nextPaydayInfo);
        console.log('✅ PayCycle saved successfully to Firebase');
      } else {
        console.warn('⚠️ nextPaydayInfo is null/undefined - not saving to payCycle');
      }

      console.log('✅ SAVE COMPLETE');
      setMessage('Settings saved successfully!');
    } catch (error) {
      console.error('❌ Error saving settings:', error);
      setMessage('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const addBill = () => {
    console.log('Adding new bill...');
    const newBill = { 
      name: '', 
      amount: '', 
      dueDate: '', 
      recurrence: 'monthly' 
    };
    setBills(prevBills => [...prevBills, newBill]);
  };

  const updateBill = (index, field, value) => {
    setBills(prevBills => {
      const updatedBills = [...prevBills];
      updatedBills[index] = { ...updatedBills[index], [field]: value };
      return updatedBills;
    });
  };

  const removeBill = (index) => {
    setBills(prevBills => prevBills.filter((_, i) => i !== index));
  };

  const handleDebugModeToggle = (enabled) => {
    setPreferences({ ...preferences, debugMode: enabled });
    localStorage.setItem('debugMode', enabled.toString());
    setMessage(enabled ? '🛠️ Debug mode enabled! Floating debug button will appear.' : '✅ Debug mode disabled.');
    
    // Dispatch custom event to notify App.jsx
    window.dispatchEvent(new CustomEvent('debugModeChanged', { detail: { enabled } }));
  };

  if (loading) {
    return (
      <div className="settings-container">
        <div className="page-header">
          <h2>⚙️ Financial Settings</h2>
          <p>Loading your settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="page-header">
        <h2>⚙️ Financial Settings</h2>
        <p>Configure your pay schedules, bank accounts, and bills</p>
        {message && (
          <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
      </div>

      <div className="settings-tiles-grid">
        
        {/* Tile 1: Personal Information */}
        <div className="settings-tile">
          <h3>👤 Personal Information</h3>
          <div className="tile-content">
            <div className="form-group">
              <label>Your Name</label>
              <input
                type="text"
                value={personalInfo.yourName}
                onChange={(e) => setPersonalInfo({...personalInfo, yourName: e.target.value})}
                placeholder="Enter your name"
              />
            </div>
            <div className="form-group">
              <label>Spouse Name</label>
              <input
                type="text"
                value={personalInfo.spouseName}
                onChange={(e) => setPersonalInfo({...personalInfo, spouseName: e.target.value})}
                placeholder="Enter spouse name"
              />
            </div>
          </div>
        </div>

        {/* Tile 2: Your Pay Schedule */}
        <div className="settings-tile">
          <h3>💰 Your Pay Schedule (Bi-Weekly)</h3>
          <div className="tile-content">
            <div className="form-group">
              <label>Pay Amount</label>
              <input
                type="number"
                value={paySchedules.yours.amount}
                onChange={(e) => setPaySchedules({
                  ...paySchedules,
                  yours: {...paySchedules.yours, amount: e.target.value}
                })}
                placeholder="1883.81"
              />
            </div>
            <div className="form-group">
              <label>Last Pay Date</label>
              <input
                type="date"
                value={paySchedules.yours.lastPaydate}
                onChange={(e) => setPaySchedules({
                  ...paySchedules,
                  yours: {...paySchedules.yours, lastPaydate: e.target.value}
                })}
              />
              <small>Used for next payday calculation</small>
            </div>
            <div className="pay-split-info">
              <h4>SoFi Fixed Amount (Early Deposit)</h4>
              <input
                type="number"
                value={paySchedules.yours.bankSplit.fixedAmount.amount}
                onChange={(e) => setPaySchedules({
                  ...paySchedules,
                  yours: {
                    ...paySchedules.yours,
                    bankSplit: {
                      ...paySchedules.yours.bankSplit,
                      fixedAmount: {...paySchedules.yours.bankSplit.fixedAmount, amount: e.target.value}
                    }
                  }
                })}
                placeholder="400.00"
              />
              <small>Deposits to SoFi 2 days before payday</small>
              
              <h4>Remainder Bank</h4>
              <select
                value={paySchedules.yours.bankSplit.remainder.bank}
                onChange={(e) => setPaySchedules({
                  ...paySchedules,
                  yours: {
                    ...paySchedules.yours,
                    bankSplit: {
                      ...paySchedules.yours.bankSplit,
                      remainder: {bank: e.target.value}
                    }
                  }
                })}
              >
                <option value="Bank of America">Bank of America</option>
                <option value="USAA">USAA</option>
                <option value="Capital One">Capital One</option>
              </select>
              <small>Gets remainder on actual payday</small>
            </div>
          </div>
        </div>

        {/* Tile 3: Spouse Pay Schedule */}
        <div className="settings-tile">
          <h3>💑 Spouse Pay Schedule (15th & 30th)</h3>
          <div className="tile-content">
            <div className="form-group">
              <label>Pay Amount</label>
              <input
                type="number"
                value={paySchedules.spouse.amount}
                onChange={(e) => setPaySchedules({
                  ...paySchedules,
                  spouse: {...paySchedules.spouse, amount: e.target.value}
                })}
                placeholder="1851.04"
              />
            </div>
            <div className="automatic-schedule">
              <h4>Automatic Schedule</h4>
              <p>• Pays on the 15th and 30th of each month</p>
              <p>• Friday adjustment rule applies for weekends</p>
              <p>• System calculates next payday automatically</p>
            </div>
          </div>
        </div>

        {/* Tile 4: Spending Preferences */}
        <div className="settings-tile">
          <h3>💡 Spending Preferences</h3>
          <div className="tile-content">
            <div className="form-group">
              <label>Next Payday Date (Override)</label>
              <input
                type="date"
                value={nextPaydayOverride}
                onChange={(e) => setNextPaydayOverride(e.target.value)}
                placeholder="Override calculated payday"
              />
              <small>Leave blank to use automatic calculation</small>
            </div>
            <div className="form-group">
              <label>Safety Buffer</label>
              <input
                type="number"
                value={preferences.safetyBuffer}
                onChange={(e) => setPreferences({...preferences, safetyBuffer: parseInt(e.target.value)})}
                placeholder="200"
              />
              <small>Emergency cushion amount</small>
            </div>
            <div className="form-group">
              <label>Weekly Essentials</label>
              <input
                type="number"
                value={preferences.weeklyEssentials}
                onChange={(e) => setPreferences({...preferences, weeklyEssentials: parseInt(e.target.value)})}
                placeholder="150"
              />
              <small>Groceries, gas, basic needs per week</small>
            </div>
            
            {/* Bill Sorting Preferences */}
            <div className="preferences-section">
              <h4>📊 Bill Sorting & Alerts</h4>
              <div className="form-group">
                <label>Default Bill Sort Order</label>
                <select
                  value={preferences.billSortOrder}
                  onChange={(e) => setPreferences({...preferences, billSortOrder: e.target.value})}
                >
                  <option value="dueDate">🔥 By Due Date (Recommended)</option>
                  <option value="alphabetical">🔤 Alphabetical</option>
                  <option value="amount">💰 By Amount</option>
                </select>
                <small>How bills are sorted in the Recurring page</small>
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={preferences.dueDateAlerts}
                    onChange={(e) => setPreferences({...preferences, dueDateAlerts: e.target.checked})}
                  />
                  Enable Due Date Alerts
                </label>
                <small>Show urgency indicators for upcoming bills</small>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Urgent Alert (Days)</label>
                  <input
                    type="number"
                    value={preferences.urgentDays}
                    onChange={(e) => setPreferences({...preferences, urgentDays: parseInt(e.target.value)})}
                    min="1"
                    max="30"
                  />
                  <small>Show 🟠 urgent when due in X days</small>
                </div>
                
                <div className="form-group">
                  <label>Warning Alert (Days)</label>
                  <input
                    type="number"
                    value={preferences.warningDays}
                    onChange={(e) => setPreferences({...preferences, warningDays: parseInt(e.target.value)})}
                    min="1"
                    max="60"
                  />
                  <small>Show 🟡 warning when due in X days</small>
                </div>
              </div>
            </div>
            
            {/* Debug Mode Toggle */}
            <div className="preferences-section" style={{ marginTop: '20px' }}>
              <h4>🛠️ Developer Tools</h4>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={preferences.debugMode}
                    onChange={(e) => handleDebugModeToggle(e.target.checked)}
                  />
                  Enable Debug Mode
                </label>
                <small>Shows floating debug button on all pages with Ctrl+Shift+D shortcut</small>
              </div>
            </div>
            
            <button 
              onClick={saveSettings} 
              disabled={saving}
              className="save-btn"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Tile 5: Bank Accounts */}
        <div className="settings-tile">
          <h3>🏦 Bank Accounts</h3>
          <div className="tile-content">
            {Object.entries(bankAccounts).map(([key, account]) => (
              <div key={key} className="form-group">
                <label>{account.name} ({account.type})</label>
                <input
                  type="number"
                  step="0.01"
                  value={account.balance}
                  onChange={(e) => setBankAccounts({
                    ...bankAccounts,
                    [key]: {...account, balance: e.target.value}
                  })}
                  placeholder="Current balance"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Tile 6: Recurring Bills */}
        <div className="settings-tile bills-tile">
          <h3>🔄 Recurring Bills</h3>
          <div className="tile-content">
            
            {/* Info about advanced import */}
            <div className="import-info-section">
              <p className="info-message">
                💡 For advanced CSV import with duplicate detection and error handling, 
                visit the <Link to="/recurring" style={{ color: '#00ff88', textDecoration: 'none', fontWeight: 'bold' }}>
                  Recurring page
                </Link> which offers intelligent categorization and conflict resolution.
              </p>
              <p style={{ marginTop: '10px', fontSize: '14px', color: '#ccc' }}>
                The Recurring page provides:
              </p>
              <ul style={{ fontSize: '13px', color: '#ccc', marginTop: '5px', paddingLeft: '20px' }}>
                <li>Full CSV import preview with error validation</li>
                <li>Automatic duplicate detection and merging</li>
                <li>Plaid account matching by institution name</li>
                <li>Bulk actions and conflict resolution</li>
              </ul>
            </div>

            {/* Add Bill Section with Working Button */}
            <div className="add-bill-section">
              <h4>Quick Add Bill</h4>
              <button 
                type="button"
                onClick={addBill} 
                className="add-bill-btn"
              >
                + Add New Bill
              </button>
            </div>

            {/* Bills List with Large, Readable Inputs */}
            <div className="bills-list">
              {bills.map((bill, index) => (
                <div key={index} className="bill-row">
                  <input
                    type="text"
                    value={bill.name || ''}
                    onChange={(e) => updateBill(index, 'name', e.target.value)}
                    placeholder="Bill name"
                    className="bill-name-input"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={bill.amount || ''}
                    onChange={(e) => updateBill(index, 'amount', e.target.value)}
                    placeholder="Amount"
                    className="bill-amount-input"
                  />
                  <input
                    type="date"
                    value={bill.dueDate || ''}
                    onChange={(e) => updateBill(index, 'dueDate', e.target.value)}
                    className="bill-date-input"
                  />
                  <select
                    value={bill.recurrence || 'monthly'}
                    onChange={(e) => updateBill(index, 'recurrence', e.target.value)}
                    className="bill-recurrence-select"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="bi-weekly">Bi-weekly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annually">Annually</option>
                    <option value="one-time">One-time</option>
                  </select>
                  <button 
                    type="button"
                    onClick={() => removeBill(index)} 
                    className="remove-btn"
                  >
                    Remove
                  </button>
                </div>
              ))}
              
              {bills.length === 0 && (
                <div className="no-bills-message">
                  <p>No bills added yet. Click "Add New Bill" to start.</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Sentry Testing Section */}
      <div className="settings-section">
        <h2 className="settings-section-title">🔍 Sentry Testing</h2>
        <div className="settings-card">
          <p className="settings-description">
            Test Sentry error reporting to ensure errors are being tracked correctly.
          </p>
          
          <div className="button-group" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-secondary"
              onClick={() => {
                window.Sentry.captureMessage('🧪 Test message from Settings page!', 'info');
                alert('Test message sent to Sentry! Check your Sentry dashboard.');
              }}
            >
              🧪 Test Sentry Message
            </button>
            
            <button 
              className="btn btn-secondary"
              onClick={() => {
                window.Sentry.captureException(new Error('🧪 Test error from Settings page!'));
                alert('Test error sent to Sentry! Check your Sentry dashboard.');
              }}
            >
              ❌ Test Sentry Error
            </button>
            
            <button 
              className="btn btn-danger"
              onClick={() => {
                throw new Error('🧪 Test error to trigger ErrorBoundary!');
              }}
            >
              💥 Test Error Boundary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
