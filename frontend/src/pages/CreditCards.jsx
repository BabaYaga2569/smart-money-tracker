// pages/CreditCards.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import PlaidErrorModal from "../components/PlaidErrorModal";
import PlaidConnectionManager from "../utils/PlaidConnectionManager";
import { calculateTotalProjectedBalance, getBalanceDifference, formatBalanceDifference } from "../utils/BalanceCalculator";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import "./Accounts.css";

export default function CreditCards() {
  const { currentUser } = useAuth();
  const [plaidAccounts, setPlaidAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalProjectedBalance, setTotalProjectedBalance] = useState(0);
  const [showBalanceType, setShowBalanceType] = useState("both");
  const [loading, setLoading] = useState(true);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [plaidStatus, setPlaidStatus] = useState({
    isConnected: false,
    hasError: false,
    errorMessage: null,
  });

  useEffect(() => {
    if (!currentUser) return;

    const loadCreditAccounts = async () => {
      try {
        const apiUrl =
          import.meta.env.VITE_API_URL ||
          "https://smart-money-tracker-09ks.onrender.com";
        const response = await fetch(
          `${apiUrl}/api/accounts?userId=${currentUser.uid}&_t=${Date.now()}`
        );
        const data = await response.json();

        if (data.success && data.accounts) {
          const creditAccounts = data.accounts.filter(
            (a) => a.type === "credit" || a.subtype === "credit"
          );
          const formatted = creditAccounts.map((account) => {
            const balances = account.balances || {};
            const currentBalance = parseFloat(balances.current ?? 0);
            const availableBalance = parseFloat(balances.available ?? currentBalance);
            const pendingAdjustment = availableBalance - currentBalance;
            return {
              ...account,
              current: currentBalance.toFixed(2),
              available: availableBalance.toFixed(2),
              pending_adjustment: pendingAdjustment.toFixed(2),
            };
          });

          setPlaidAccounts(formatted);

          const liveTotal = formatted.reduce(
            (sum, acc) => sum + parseFloat(acc.available || 0),
            0
          );
          const projectedTotal = calculateTotalProjectedBalance(formatted, transactions);
          setTotalBalance(liveTotal);
          setTotalProjectedBalance(projectedTotal);
        }
      } catch (error) {
        console.error("[CreditCards] Error loading accounts:", error);
      } finally {
        setLoading(false);
      }
    };

    loadCreditAccounts();
  }, [currentUser]);

  useEffect(() => {
    const unsubscribe = PlaidConnectionManager.subscribe((status) => {
      setPlaidStatus({
        isConnected:
          status.hasToken && status.isApiWorking === true && status.hasAccounts,
        hasError: status.error !== null,
        errorMessage: status.error,
      });
    });
    return () => unsubscribe();
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="accounts-container">
        <div className="page-header">
          <h2>💳 Credit Cards</h2>
          <p>Loading your credit cards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="accounts-container">
      <div className="page-header">
        <h2>💳 Credit Cards</h2>
        <p>View and manage your credit card balances and utilization</p>
      </div>

      {/* Summary */}
      <div className="accounts-summary">
        <div className="summary-card">
          <div className="summary-header">
            <h3>Total Balances</h3>
            <div className="balance-toggle">
              <button
                className={showBalanceType === "live" ? "active" : ""}
                onClick={() => setShowBalanceType("live")}
              >
                Live Only
              </button>
              <button
                className={showBalanceType === "both" ? "active" : ""}
                onClick={() => setShowBalanceType("both")}
              >
                Both
              </button>
              <button
                className={showBalanceType === "projected" ? "active" : ""}
                onClick={() => setShowBalanceType("projected")}
              >
                Projected Only
              </button>
            </div>
          </div>
          <div className="balance-display">
            {(showBalanceType === "live" || showBalanceType === "both") && (
              <div className="balance-item">
                <span className="balance-label">💳 Live Balance</span>
                <div className="balance-value">{formatCurrency(totalBalance)}</div>
              </div>
            )}
            {(showBalanceType === "projected" || showBalanceType === "both") && (
              <div className="balance-item">
                <span className="balance-label">📊 Projected Balance</span>
                <div className="balance-value projected">
                  {formatCurrency(totalProjectedBalance)}
                </div>
              </div>
            )}
            {showBalanceType === "both" &&
              totalProjectedBalance !== totalBalance && (
                <div className="balance-difference">
                  <span className="difference-label">Difference:</span>
                  <span
                    className={`difference-value ${
                      totalProjectedBalance > totalBalance ? "positive" : "negative"
                    }`}
                  >
                    {formatBalanceDifference(
                      getBalanceDifference(totalProjectedBalance, totalBalance)
                    )}
                  </span>
                </div>
              )}
          </div>
          <small>
            Across {plaidAccounts.length} credit card
            {plaidAccounts.length === 1 ? "" : "s"}
          </small>
        </div>
      </div>

      {/* Grid */}
      <div className="accounts-grid">
        {plaidAccounts.length === 0 ? (
          <div className="no-accounts">
            <h3>No Credit Cards Found</h3>
            <p>
              No credit card accounts detected from Plaid yet. Ensure your connected
              institutions include credit cards.
            </p>
          </div>
        ) : (
          plaidAccounts.map((account) => {
            const liveBalance = parseFloat(account.available) || 0;
            const projectedBalance = calculateTotalProjectedBalance(
              [account],
              transactions
            );
            const utilization = account.balances?.limit
              ? ((liveBalance / account.balances.limit) * 100).toFixed(1)
              : null;

            return (
              <div
                key={account.account_id}
                className="account-card plaid-account clickable-card"
              >
                <div className="account-header">
                  <div className="account-title">
                    <span className="account-icon">💳</span>
                    <h3>{account.name}</h3>
                  </div>
                  <span className="account-type">
                    Credit ••{account.mask || ""}
                  </span>
                </div>

                <div className="account-balances">
                  <div className="balance-row">
                    <span className="balance-label">💰 Available Credit</span>
                    <span className="balance-amount">
                      {formatCurrency(parseFloat(account.available || 0))}
                    </span>
                  </div>
                  <div className="balance-row" style={{ fontSize: "0.9em", opacity: 0.8 }}>
                    <span className="balance-label">📖 Current Balance</span>
                    <span className="balance-amount">
                      {formatCurrency(parseFloat(account.current || 0))}
                    </span>
                  </div>
                  {account.pending_adjustment &&
                    parseFloat(account.pending_adjustment) !== 0 && (
                      <div
                        className="balance-row"
                        style={{ fontSize: "0.85em", opacity: 0.7 }}
                      >
                        <span className="balance-label">⏳ Pending</span>
                        <span
                          className="balance-amount"
                          style={{
                            color:
                              parseFloat(account.pending_adjustment) > 0
                                ? "#10b981"
                                : "#f59e0b",
                          }}
                        >
                          {formatCurrency(parseFloat(account.pending_adjustment))}
                        </span>
                      </div>
                    )}
                </div>

                {utilization && (
                  <div
                    className="balance-row"
                    style={{ fontSize: "0.85em", opacity: 0.8, marginTop: "8px" }}
                  >
                    <span className="balance-label">📈 Utilization</span>
                    <span
                      className="balance-amount"
                      style={{
                        color: utilization > 50 ? "#f59e0b" : "#10b981",
                      }}
                    >
                      {utilization}%
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <PlaidErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        onRetry={() => {
          setShowErrorModal(false);
        }}
      />
    </div>
  );
}
