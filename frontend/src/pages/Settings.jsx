import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import "./Settings.css";

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [uploadedBills, setUploadedBills] = useState([]);
  const [showUploadPreview, setShowUploadPreview] = useState(false);

  // User info
  const [userInfo, setUserInfo] = useState({
    yourName: "",
    spouseName: ""
  });

  // Pay schedules with safe defaults
  const [paySchedules, setPaySchedules] = useState({
    yours: {
      type: "bi-weekly",
      amount: "",
      nextPayDate: "",
      bankSplit: {
        fixedAmount: { bank: "SoFi", amount: "" },
        remainder: { bank: "BofA" }
      }
    },
    spouse: {
      type: "bi-monthly", 
      amount: "",
      dates: [15, 30]
    }
  });

  // Bank accounts
  const [bankAccounts, setBankAccounts] = useState({
    bofa: { name: "Bank of America", type: "checking", balance: "", primary: true },
    sofi: { name: "SoFi", type: "savings", balance: "", primary: false },
    usaa: { name: "USAA", type: "checking", balance: "", primary: false },
    cap1: { name: "Capital One", type: "savings", balance: "", primary: false }
  });

  // Bills
  const [bills, setBills] = useState([
    { name: "", amount: "", dueDate: "", recurring: true }
  ]);

  // Settings
  const [preferences, setPreferences] = useState({
    safetyBuffer: 200,
    weeklyEssentials: 150,
    autoCalculatePayday: true
  });

  const userId = "steve-colburn";

  // Load existing data
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsRef = doc(db, 'users', userId, 'settings', 'personal');
        const settingsSnap = await getDoc(settingsRef);
        
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          
          // Handle user info
          if (data.userInfo) {
            setUserInfo(data.userInfo);
          }
          
          // Handle pay schedules with migration
          if (data.paySchedules) {
            const loadedPaySchedules = { ...paySchedules };
            
            if (data.paySchedules.yours) {
              loadedPaySchedules.yours = {
                ...loadedPaySchedules.yours,
                ...data.paySchedules.yours
              };
              
              // Migrate old percentage structure to new fixed amount structure
              if (data.paySchedules.yours.bankSplit && !data.paySchedules.yours.bankSplit.fixedAmount) {
                loadedPaySchedules.yours.bankSplit = {
                  fixedAmount: { bank: "SoFi", amount: "" },
                  remainder: { bank: "BofA" }
                };
              }
            }
            
            if (data.paySchedules.spouse) {
              loadedPaySchedules.spouse = {
                ...loadedPaySchedules.spouse,
                ...data.paySchedules.spouse
              };
            }
            
            setPaySchedules(loadedPaySchedules);
          }
          
          // Handle other data
          if (data.bankAccounts) {
            setBankAccounts({ ...bankAccounts, ...data.bankAccounts });
          }
          
          if (data.bills && Array.isArray(data.bills)) {
            setBills(data.bills.length > 0 ? data.bills : bills);
          }
          
          if (data.preferences) {
            setPreferences({ ...preferences, ...data.preferences });
          }
        }
        
        setLoading(false);
      } catch (error) {
        console.error("Error loading settings:", error);
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = (e) => {
      const text = e.target.result;
      const isCSV = file.name.toLowerCase().endsWith('.csv');
      
      if (isCSV) {
        parseCSV(text);
      } else {
        // Handle Excel files here if needed
        alert('Excel support coming soon. Please use CSV format for now.');
      }
    };
    
    reader.readAsText(file);
  };

  // Parse CSV data
  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      alert('CSV must have at least a header row and one data row');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const parsedBills = [];

    // Find column indices
    const nameIndex = headers.findIndex(h => h.includes('name') || h.includes('bill') || h.includes('payee'));
    const amountIndex = headers.findIndex(h => h.includes('amount') || h.includes('cost') || h.includes('payment'));
    const dateIndex = headers.findIndex(h => h.includes('date') || h.includes('due'));

    if (nameIndex === -1 || amountIndex === -1) {
      alert('CSV must have columns for bill name and amount. Optional: due date');
      return;
    }

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      
      if (values.length > Math.max(nameIndex, amountIndex)) {
        const bill = {
          name: values[nameIndex] || '',
          amount: values[amountIndex]?.replace(/[^0-9.-]/g, '') || '',
          dueDate: dateIndex !== -1 ? formatDate(values[dateIndex]) : '',
          recurring: true
        };
        
        if (bill.name && bill.amount) {
          parsedBills.push(bill);
        }
      }
    }

    setUploadedBills(parsedBills);
    setShowUploadPreview(true);
  };

  // Format date to YYYY-MM-DD
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date)) return '';
    return date.toISOString().split('T')[0];
  };

  // Import uploaded bills
  const importUploadedBills = () => {
    setBills([...bills.filter(bill => bill.name || bill.amount), ...uploadedBills]);
    setUploadedBills([]);
    setShowUploadPreview(false);
    setSuccessMessage('Bills imported successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Save settings to Firebase
  const saveSettings = async () => {
    setSaving(true);
    try {
      const settingsData = {
        userInfo,
        paySchedules,
        bankAccounts,
        bills: bills.filter(bill => bill.name && bill.amount),
        preferences,
        lastUpdated: new Date().toISOString()
      };

      const settingsRef = doc(db, 'users', userId, 'settings', 'personal');
      await setDoc(settingsRef, settingsData);
      await updateFinancialData();

      setSuccessMessage("Settings saved successfully!");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
    }
    setSaving(false);
  };

  // Update financial data for calculations
  const updateFinancialData = async () => {
    const totalBalance = Object.values(bankAccounts).reduce((sum, account) => 
      sum + (parseFloat(account.balance) || 0), 0
    );
    
    const accountData = {
      checking: Object.values(bankAccounts).filter(acc => acc.type === 'checking').reduce((sum, acc) => sum + (parseFloat(acc.balance) || 0), 0),
      savings: Object.values(bankAccounts).filter(acc => acc.type === 'savings').reduce((sum, acc) => sum + (parseFloat(acc.balance) || 0), 0),
      total: totalBalance
    };

    const upcomingBills = bills.filter(bill => bill.name && bill.amount).map(bill => ({
      name: bill.name,
      amount: parseFloat(bill.amount) || 0,
      dueDate: bill.dueDate
    }));

    // Calculate next payday (comparing both schedules)
    const calculateNextPayday = () => {
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      // Calculate wife's next payday (15th or 30th)
      let wifeNext15th = new Date(currentYear, currentMonth, 15);
      let wifeNext30th = new Date(currentYear, currentMonth + 1, 0); // Last day of current month
      
      // If 15th already passed this month, use next month's 15th
      if (wifeNext15th <= today) {
        wifeNext15th = new Date(currentYear, currentMonth + 1, 15);
      }
      
      // If end of month already passed, use next month's end
      if (wifeNext30th <= today) {
        wifeNext30th = new Date(currentYear, currentMonth + 2, 0); // Last day of next month
      }
      
      // Find wife's next payday (whichever comes first)
      const wifeNextPayday = wifeNext15th < wifeNext30th ? wifeNext15th : wifeNext30th;
      
      // Your payday from settings
      const yourNextPayday = paySchedules.yours.nextPayDate ? 
        new Date(paySchedules.yours.nextPayDate) : 
        new Date(currentYear, currentMonth + 1, 3); // Default fallback
      
      // Compare and use whichever comes first
      const nextPayday = wifeNextPayday < yourNextPayday ? wifeNextPayday : yourNextPayday;
      const paydaySource = wifeNextPayday < yourNextPayday ? 'spouse' : 'yours';
      
      return {
        date: nextPayday.toISOString().split('T')[0],
        daysUntil: Math.ceil((nextPayday - today) / (1000 * 60 * 60 * 24)),
        source: paydaySource,
        amount: paydaySource === 'spouse' ? 
          parseFloat(paySchedules.spouse.amount) || 0 : 
          parseFloat(paySchedules.yours.amount) || 0
      };
    };

    const nextPaydayInfo = calculateNextPayday();

    const payCycleData = {
      nextPayday: nextPaydayInfo.date,
      daysUntilPay: nextPaydayInfo.daysUntil,
      paydaySource: nextPaydayInfo.source,
      paydayAmount: nextPaydayInfo.amount
    };

    await setDoc(doc(db, 'users', userId, 'financial', 'accounts'), accountData);
    await setDoc(doc(db, 'users', userId, 'financial', 'bills'), { upcoming: upcomingBills });
    await setDoc(doc(db, 'users', userId, 'financial', 'payCycle'), payCycleData);
    await setDoc(doc(db, 'users', userId, 'financial', 'settings'), {
      safetyBuffer: preferences.safetyBuffer,
      weeklyEssentials: preferences.weeklyEssentials
    });
  };

  // Add new bill
  const addBill = () => {
    setBills([...bills, { name: "", amount: "", dueDate: "", recurring: true }]);
  };

  // Remove bill
  const removeBill = (index) => {
    setBills(bills.filter((_, i) => i !== index));
  };

  // Update bill
  const updateBill = (index, field, value) => {
    const updatedBills = [...bills];
    updatedBills[index][field] = value;
    setBills(updatedBills);
  };

  if (loading) {
    return (
      <div className="settings">
        <div className="loading">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h1>Financial Settings</h1>
        <p>Configure your pay schedules, bank accounts, and bills</p>
        {successMessage && <div className="success-message">{successMessage}</div>}
      </div>

      <div className="settings-grid">
        {/* User Information */}
        <div className="settings-section">
          <h2>Personal Information</h2>
          <div className="form-group">
            <label>Your Name</label>
            <input
              type="text"
              value={userInfo.yourName}
              onChange={(e) => setUserInfo({...userInfo, yourName: e.target.value})}
              placeholder="Your name"
            />
          </div>
          <div className="form-group">
            <label>Spouse Name</label>
            <input
              type="text"
              value={userInfo.spouseName}
              onChange={(e) => setUserInfo({...userInfo, spouseName: e.target.value})}
              placeholder="Spouse name"
            />
          </div>
        </div>

        {/* Your Pay Schedule */}
        <div className="settings-section">
          <h2>Your Pay Schedule (Bi-Weekly)</h2>
          <div className="form-group">
            <label>Pay Amount</label>
            <input
              type="number"
              value={paySchedules.yours.amount}
              onChange={(e) => setPaySchedules({
                ...paySchedules,
                yours: {...paySchedules.yours, amount: e.target.value}
              })}
              placeholder="2500.00"
            />
          </div>
          <div className="form-group">
            <label>Next Pay Date</label>
            <input
              type="date"
              value={paySchedules.yours.nextPayDate}
              onChange={(e) => setPaySchedules({
                ...paySchedules,
                yours: {...paySchedules.yours, nextPayDate: e.target.value}
              })}
            />
          </div>
          <div className="form-group">
            <label>Fixed Amount to SoFi</label>
            <input
              type="number"
              value={paySchedules.yours.bankSplit?.fixedAmount?.amount || ""}
              onChange={(e) => setPaySchedules({
                ...paySchedules,
                yours: {
                  ...paySchedules.yours,
                  bankSplit: {
                    ...paySchedules.yours.bankSplit,
                    fixedAmount: {
                      ...paySchedules.yours.bankSplit.fixedAmount,
                      amount: e.target.value
                    }
                  }
                }
              })}
              placeholder="500.00"
            />
            <small>Fixed amount that goes to SoFi each paycheck</small>
          </div>
          <div className="form-group">
            <label>Remainder Goes To</label>
            <select
              value={paySchedules.yours.bankSplit?.remainder?.bank || "BofA"}
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
              <option value="BofA">Bank of America</option>
              <option value="SoFi">SoFi</option>
              <option value="USAA">USAA</option>
              <option value="Cap1">Capital One</option>
            </select>
            <small>Where the rest of your paycheck goes</small>
          </div>
        </div>

        {/* Spouse Pay Schedule */}
        <div className="settings-section">
          <h2>Spouse Pay Schedule (15th & 30th)</h2>
          <div className="form-group">
            <label>Pay Amount</label>
            <input
              type="number"
              value={paySchedules.spouse.amount}
              onChange={(e) => setPaySchedules({
                ...paySchedules,
                spouse: {...paySchedules.spouse, amount: e.target.value}
              })}
              placeholder="3000.00"
            />
          </div>
          <div className="pay-dates">
            <span>Pays on the 15th and 30th of each month</span>
            <small>(If weekend, pays Friday before)</small>
          </div>
        </div>

        {/* Bank Accounts */}
        <div className="settings-section full-width">
          <h2>Bank Accounts</h2>
          <div className="bank-grid">
            {Object.entries(bankAccounts).map(([key, account]) => (
              <div key={key} className="bank-account">
                <h3>{account.name}</h3>
                <div className="form-group">
                  <label>Account Type</label>
                  <select
                    value={account.type}
                    onChange={(e) => setBankAccounts({
                      ...bankAccounts,
                      [key]: {...account, type: e.target.value}
                    })}
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Current Balance</label>
                  <input
                    type="number"
                    value={account.balance}
                    onChange={(e) => setBankAccounts({
                      ...bankAccounts,
                      [key]: {...account, balance: e.target.value}
                    })}
                    placeholder="0.00"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bills */}
        <div className="settings-section full-width">
          <h2>Recurring Bills</h2>
          
          {/* File Upload Section */}
          <div className="upload-section">
            <h3>Import from Spreadsheet</h3>
            <div className="upload-instructions">
              <p>Upload a CSV file with columns for: Bill Name, Amount, Due Date (optional)</p>
              <p>Example: <code>Bill Name,Amount,Due Date</code></p>
            </div>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="file-input"
            />
          </div>

          {/* Upload Preview */}
          {showUploadPreview && (
            <div className="upload-preview">
              <h3>Preview Imported Bills ({uploadedBills.length} found)</h3>
              <div className="preview-table">
                {uploadedBills.slice(0, 5).map((bill, index) => (
                  <div key={index} className="preview-row">
                    <span>{bill.name}</span>
                    <span>${bill.amount}</span>
                    <span>{bill.dueDate || 'No date'}</span>
                  </div>
                ))}
                {uploadedBills.length > 5 && <p>...and {uploadedBills.length - 5} more</p>}
              </div>
              <div className="preview-actions">
                <button onClick={importUploadedBills} className="import-btn">
                  Import All Bills
                </button>
                <button onClick={() => setShowUploadPreview(false)} className="cancel-btn">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Manual Bill Entry */}
          {bills.map((bill, index) => (
            <div key={index} className="bill-row">
              <input
                type="text"
                placeholder="Bill name"
                value={bill.name}
                onChange={(e) => updateBill(index, 'name', e.target.value)}
              />
              <input
                type="number"
                placeholder="Amount"
                value={bill.amount}
                onChange={(e) => updateBill(index, 'amount', e.target.value)}
              />
              <input
                type="date"
                value={bill.dueDate}
                onChange={(e) => updateBill(index, 'dueDate', e.target.value)}
              />
              <button 
                type="button" 
                onClick={() => removeBill(index)}
                className="remove-btn"
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addBill} className="add-btn">
            Add Bill
          </button>
        </div>

        {/* Preferences */}
        <div className="settings-section">
          <h2>Spending Preferences</h2>
          <div className="form-group">
            <label>Safety Buffer</label>
            <input
              type="number"
              value={preferences.safetyBuffer}
              onChange={(e) => setPreferences({
                ...preferences,
                safetyBuffer: parseFloat(e.target.value) || 0
              })}
            />
            <small>Emergency fund amount to keep untouched</small>
          </div>
          <div className="form-group">
            <label>Weekly Essentials</label>
            <input
              type="number"
              value={preferences.weeklyEssentials}
              onChange={(e) => setPreferences({
                ...preferences,
                weeklyEssentials: parseFloat(e.target.value) || 0
              })}
            />
            <small>Groceries, gas, and other essentials per week</small>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="save-section">
        <button 
          onClick={saveSettings} 
          disabled={saving}
          className="save-btn"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
};

export default Settings;