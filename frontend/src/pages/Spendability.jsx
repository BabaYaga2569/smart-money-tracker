import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import "./Spendability.css";

const Spendability = () => {
  const [accountData, setAccountData] = useState({
    checking: 0,
    savings: 0,
    total: 0
  });

  const [upcomingBills, setUpcomingBills] = useState([]);
  const [payCycle, setPayCycle] = useState({
    nextPayday: "",
    daysUntilPay: 0
  });

  const [safetyBuffer, setSafetyBuffer] = useState(200);
  const [weeklyEssentials, setWeeklyEssentials] = useState(150);
  const [requestedAmount, setRequestedAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load data from Firebase
  useEffect(() => {
    const loadFinancialData = async () => {
      try {
        // For now, we'll use a fixed user ID. Later we'll add authentication
        const userId = "steve-colburn";
        
        // Load account data
        const accountRef = doc(db, 'users', userId, 'financial', 'accounts');
        const accountSnap = await getDoc(accountRef);
        
        if (accountSnap.exists()) {
          setAccountData(accountSnap.data());
        } else {
          // Create initial data if it doesn't exist
          const initialAccountData = {
            checking: 2847.50,
            savings: 5420.00,
            total: 8267.50
          };
          await setDoc(accountRef, initialAccountData);
          setAccountData(initialAccountData);
        }

        // Load bills data
        const billsRef = doc(db, 'users', userId, 'financial', 'bills');
        const billsSnap = await getDoc(billsRef);
        
        if (billsSnap.exists()) {
          setUpcomingBills(billsSnap.data().upcoming || []);
        } else {
          const initialBills = [
            { name: "Rent", amount: 1200, dueDate: "2025-09-25" },
            { name: "Electric", amount: 89.50, dueDate: "2025-09-28" },
            { name: "Phone", amount: 65.00, dueDate: "2025-09-30" },
            { name: "Car Insurance", amount: 125.00, dueDate: "2025-10-01" }
          ];
          await setDoc(billsRef, { upcoming: initialBills });
          setUpcomingBills(initialBills);
        }

        // Load pay cycle data
        const payCycleRef = doc(db, 'users', userId, 'financial', 'payCycle');
        const payCycleSnap = await getDoc(payCycleRef);
        
        if (payCycleSnap.exists()) {
          setPayCycle(payCycleSnap.data());
        } else {
          const initialPayCycle = {
            nextPayday: "2025-10-05",
            daysUntilPay: 13
          };
          await setDoc(payCycleRef, initialPayCycle);
          setPayCycle(initialPayCycle);
        }

        // Load settings
        const settingsRef = doc(db, 'users', userId, 'financial', 'settings');
        const settingsSnap = await getDoc(settingsRef);
        
        if (settingsSnap.exists()) {
          const settings = settingsSnap.data();
          setSafetyBuffer(settings.safetyBuffer || 200);
          setWeeklyEssentials(settings.weeklyEssentials || 150);
        }

        setLoading(false);
      } catch (err) {
        console.error("Error loading financial data:", err);
        setError("Could not load financial data. Check console for details.");
        setLoading(false);
      }
    };

    loadFinancialData();
  }, []);

  // Calculate safe spendable amount
  const calculateSpendability = () => {
    const totalBills = upcomingBills.reduce((sum, bill) => sum + bill.amount, 0);
    const essentialsNeeded = weeklyEssentials * (payCycle.daysUntilPay / 7);
    const totalReserved = totalBills + essentialsNeeded + safetyBuffer;
    return accountData.total - totalReserved;
  };

  const safeSpendAmount = calculateSpendability();
  const canSpendRequested = requestedAmount ? parseFloat(requestedAmount) <= safeSpendAmount : null;

  if (loading) {
    return (
      <div className="spendability">
        <div className="loading">Loading your financial data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="spendability">
        <div className="error">
          <h2>Firebase Connection Error</h2>
          <p>{error}</p>
          <p>Make sure you've enabled Firestore in your Firebase console.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="spendability">
      <div className="spendability-header">
        <h1>Spendability Calculator</h1>
        <p>Find out how much you can safely spend until your next payday</p>
        <p className="firebase-status">✅ Connected to Firebase</p>
      </div>

      <div className="spendability-grid">
        {/* Quick Answer Section */}
        <div className="quick-check card">
          <h2>Can I spend this amount?</h2>
          <div className="amount-input">
            <span className="dollar-sign">$</span>
            <input
              type="number"
              placeholder="0.00"
              value={requestedAmount}
              onChange={(e) => setRequestedAmount(e.target.value)}
            />
          </div>
          
          {canSpendRequested !== null && (
            <div className={`answer ${canSpendRequested ? 'safe' : 'unsafe'}`}>
              {canSpendRequested 
                ? "✅ Yes, you can safely spend this amount" 
                : "❌ No, this would exceed your safe spending limit"
              }
            </div>
          )}
        </div>

        {/* Safe Amount Display */}
        <div className="safe-amount card">
          <h2>Safe to Spend</h2>
          <div className="amount-display">
            <span className="currency">$</span>
            <span className="amount">{safeSpendAmount.toFixed(2)}</span>
          </div>
          <p>Available until {payCycle.nextPayday}</p>
        </div>

        {/* Account Balances */}
        <div className="balances card">
          <h3>Current Balances</h3>
          <div className="balance-item">
            <span>Checking</span>
            <span>${accountData.checking.toFixed(2)}</span>
          </div>
          <div className="balance-item">
            <span>Savings</span>
            <span>${accountData.savings.toFixed(2)}</span>
          </div>
          <div className="balance-total">
            <span>Total Available</span>
            <span>${accountData.total.toFixed(2)}</span>
          </div>
        </div>

        {/* Upcoming Bills */}
        <div className="bills card">
          <h3>Bills Due Before Payday</h3>
          {upcomingBills.map((bill, index) => (
            <div key={index} className="bill-item">
              <span>{bill.name}</span>
              <span>${bill.amount.toFixed(2)}</span>
            </div>
          ))}
          <div className="bills-total">
            <span>Total Bills</span>
            <span>${upcomingBills.reduce((sum, bill) => sum + bill.amount, 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="breakdown card">
          <h3>Calculation Breakdown</h3>
          <div className="breakdown-item">
            <span>Total Available</span>
            <span>${accountData.total.toFixed(2)}</span>
          </div>
          <div className="breakdown-item">
            <span>- Upcoming Bills</span>
            <span>-${upcomingBills.reduce((sum, bill) => sum + bill.amount, 0).toFixed(2)}</span>
          </div>
          <div className="breakdown-item">
            <span>- Weekly Essentials</span>
            <span>-${(weeklyEssentials * (payCycle.daysUntilPay / 7)).toFixed(2)}</span>
          </div>
          <div className="breakdown-item">
            <span>- Safety Buffer</span>
            <span>-${safetyBuffer.toFixed(2)}</span>
          </div>
          <div className="breakdown-total">
            <span>Safe to Spend</span>
            <span>${safeSpendAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Pay Cycle Info */}
        <div className="paycycle card">
          <h3>Next Payday</h3>
          <div className="payday-info">
            <div className="payday-date">{payCycle.nextPayday}</div>
            <div className="days-remaining">{payCycle.daysUntilPay} days</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Spendability;