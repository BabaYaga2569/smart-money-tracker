import React, { useMemo, useState } from 'react';
import './BillDoctor.css';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://smart-money-tracker-09ks.onrender.com';

const severityLabels = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low'
};

const formatCurrency = value =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(value || 0));

const StoreCard = ({ title, value, subtitle, tone = 'normal' }) => (
  <div className={`doctor-store-card ${tone}`}>
    <div className="doctor-store-title">{title}</div>
    <div className="doctor-store-value">{value}</div>
    <div className="doctor-store-subtitle">{subtitle}</div>
  </div>
);

const IssueTable = ({ items = [] }) => {
  if (!items.length) return null;

  return (
    <div className="doctor-table-wrap">
      <table className="doctor-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Amount</th>
            <th>Date / Next</th>
            <th>Status</th>
            <th>Pattern</th>
            <th>Bank Link</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 100).map((item, index) => (
            <tr key={item.id || `${item.name}-${index}`}>
              <td>{item.name || 'Unnamed'}</td>
              <td>{item.amount !== undefined ? formatCurrency(item.amount) : '—'}</td>
              <td>{item.dueDate || item.nextOccurrence || '—'}</td>
              <td>{item.status || item.type || '—'}</td>
              <td>{item.recurringPatternId || '—'}</td>
              <td>
                {item.linkedTransaction === true
                  ? 'Yes'
                  : item.linkedTransaction === false
                    ? 'No'
                    : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length > 100 && (
        <div className="doctor-table-note">
          Showing first 100 of {items.length} records.
        </div>
      )}
    </div>
  );
};

const BillDoctor = () => {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedIssues, setExpandedIssues] = useState({});

  const runAudit = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`${API_URL}/api/diagnostics/bill-doctor`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
          data.error ||
          'Unable to run the Bill Doctor audit.'
        );
      }

      setAudit(data);
    } catch (err) {
      console.error('[BillDoctor] Audit failed:', err);
      setError(err.message || 'Unable to run the Bill Doctor audit.');
    } finally {
      setLoading(false);
    }
  };

  const issues = audit?.report?.issues || [];
  const legacy = audit?.report?.legacy || {};
  const canonical = audit?.report?.canonical || {};

  const issueTotal = useMemo(
    () => issues.reduce((sum, issue) => sum + Number(issue.count || 0), 0),
    [issues]
  );

  const toggleIssue = code => {
    setExpandedIssues(previous => ({
      ...previous,
      [code]: !previous[code]
    }));
  };

  return (
    <div className="bill-doctor-page">
      <div className="doctor-header">
        <div>
          <h1>🩺 Bill & Recurring Doctor</h1>
          <p>
            Read-only X-ray of every active and legacy bill store in Smart Money Tracker.
          </p>
        </div>
        <div className="doctor-readonly-badge">READ ONLY</div>
      </div>

      <div className="doctor-safety-banner">
        <strong>No fixes run from this page.</strong>
        <span>
          It does not delete, migrate, generate, advance, clear, or mark any bill paid.
          The audit only reads your bill/recurring data when you click the button.
        </span>
      </div>

      <section className="doctor-section">
        <h2>Target architecture</h2>
        <div className="doctor-flow">
          <div className="doctor-flow-node canonical">
            <strong>Recurring Pattern</strong>
            <span>the rule</span>
          </div>
          <div className="doctor-flow-arrow">→</div>
          <div className="doctor-flow-node canonical">
            <strong>Bill Occurrence</strong>
            <span>financialEvents / type=bill</span>
          </div>
          <div className="doctor-flow-arrow">→</div>
          <div className="doctor-flow-node canonical">
            <strong>Bank Transaction</strong>
            <span>payment evidence</span>
          </div>
          <div className="doctor-flow-arrow">→</div>
          <div className="doctor-flow-node canonical">
            <strong>Paid Occurrence</strong>
            <span>one linked outcome</span>
          </div>
        </div>

        <div className="doctor-legacy-strip">
          Legacy stores we are measuring, not trusting as canonical:
          <strong> settings.bills</strong>,
          <strong> settings.recurringItems</strong>,
          <strong> recurringItems</strong>,
          <strong> billInstances</strong>,
          <strong> paidBills</strong>,
          <strong> bill_payments</strong>.
        </div>
      </section>

      <section className="doctor-section doctor-run-section">
        <div>
          <h2>Live database audit</h2>
          <p>
            Run this manually when you want a point-in-time census. It does not auto-run on page load.
          </p>
        </div>
        <button
          type="button"
          className="doctor-run-btn"
          onClick={runAudit}
          disabled={loading}
        >
          {loading ? 'Running read-only audit…' : audit ? 'Run Audit Again' : 'Run Read-Only Audit'}
        </button>
      </section>

      {error && (
        <div className="doctor-error">
          <strong>Audit could not run.</strong>
          <span>{error}</span>
          {error.toLowerCase().includes('quota') && (
            <span>
              Firestore is still quota-limited. Nothing was changed; retry after quota is available.
            </span>
          )}
        </div>
      )}

      {audit && (
        <>
          <section className="doctor-section">
            <div className="doctor-report-heading">
              <div>
                <h2>System health snapshot</h2>
                <p>
                  Generated {new Date(audit.report.generatedAt).toLocaleString()} · approximately{' '}
                  {audit.estimatedDocumentsRead} documents inspected.
                </p>
              </div>
              <div className="doctor-score">
                <span>{audit.report.healthScore}</span>
                <small>/ 100</small>
              </div>
            </div>

            <div className="doctor-summary-grid">
              <StoreCard
                title="Recurring patterns"
                value={canonical.recurringPatterns?.total ?? 0}
                subtitle={`${canonical.recurringPatterns?.activeExpenses ?? 0} active expense templates`}
              />
              <StoreCard
                title="Bill occurrences"
                value={canonical.financialEvents?.bills ?? 0}
                subtitle="financialEvents type=bill"
              />
              <StoreCard
                title="Open bills"
                value={canonical.financialEvents?.unpaidBills ?? 0}
                subtitle="currently unpaid"
                tone={(canonical.financialEvents?.overdueBills ?? 0) > 0 ? 'warning' : 'normal'}
              />
              <StoreCard
                title="Derived overdue"
                value={canonical.financialEvents?.overdueBills ?? 0}
                subtitle="past due and still unpaid"
                tone={(canonical.financialEvents?.overdueBills ?? 0) > 0 ? 'danger' : 'normal'}
              />
              <StoreCard
                title="Paid occurrences"
                value={canonical.financialEvents?.paidBills ?? 0}
                subtitle="canonical paid bill records"
              />
              <StoreCard
                title="Legacy records"
                value={legacy.totalLegacyRecords ?? 0}
                subtitle="records in retired/competing stores"
                tone={(legacy.totalLegacyRecords ?? 0) > 0 ? 'warning' : 'normal'}
              />
            </div>

            <div className="doctor-issue-summary">
              <span className="critical">
                {audit.report.issueCounts?.critical ?? 0} critical groups
              </span>
              <span className="high">
                {audit.report.issueCounts?.high ?? 0} high
              </span>
              <span className="medium">
                {audit.report.issueCounts?.medium ?? 0} medium
              </span>
              <span>{issueTotal} affected records/signals</span>
            </div>
          </section>

          <section className="doctor-section">
            <h2>Canonical vs legacy stores</h2>
            <div className="doctor-store-columns">
              <div className="doctor-store-panel canonical-panel">
                <h3>Intended canonical stores</h3>
                <div className="doctor-store-row">
                  <span>recurringPatterns</span>
                  <strong>{canonical.recurringPatterns?.total ?? 0}</strong>
                </div>
                <div className="doctor-store-row">
                  <span>financialEvents bills</span>
                  <strong>{canonical.financialEvents?.bills ?? 0}</strong>
                </div>
                <div className="doctor-store-row">
                  <span>paymentRules</span>
                  <strong>{canonical.transactions?.paymentRules ?? 0}</strong>
                </div>
              </div>

              <div className="doctor-store-panel legacy-panel">
                <h3>Legacy / competing stores</h3>
                <div className="doctor-store-row">
                  <span>settings.recurringItems[]</span>
                  <strong>{legacy.settingsRecurringItems ?? 0}</strong>
                </div>
                <div className="doctor-store-row">
                  <span>recurringItems collection</span>
                  <strong>{legacy.recurringItemsCollection ?? 0}</strong>
                </div>
                <div className="doctor-store-row">
                  <span>settings.bills[]</span>
                  <strong>{legacy.settingsBills ?? 0}</strong>
                </div>
                <div className="doctor-store-row">
                  <span>billInstances</span>
                  <strong>{legacy.billInstances ?? 0}</strong>
                </div>
                <div className="doctor-store-row">
                  <span>paidBills</span>
                  <strong>{legacy.paidBills ?? 0}</strong>
                </div>
                <div className="doctor-store-row">
                  <span>bill_payments</span>
                  <strong>{legacy.billPayments ?? 0}</strong>
                </div>
                <div className="doctor-store-row">
                  <span>subscriptions</span>
                  <strong>{legacy.subscriptions ?? 0}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="doctor-section">
            <h2>Problems found</h2>
            {issues.length === 0 ? (
              <div className="doctor-clean-result">
                No structural anomalies were detected by this audit.
              </div>
            ) : (
              <div className="doctor-issues">
                {issues.map(issue => (
                  <div
                    className={`doctor-issue-card ${issue.severity}`}
                    key={issue.code}
                  >
                    <div className="doctor-issue-header">
                      <div>
                        <span className={`doctor-severity ${issue.severity}`}>
                          {severityLabels[issue.severity] || issue.severity}
                        </span>
                        <h3>{issue.title}</h3>
                        <p>{issue.description}</p>
                      </div>
                      <div className="doctor-issue-count">{issue.count}</div>
                    </div>

                    {issue.items?.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="doctor-expand-btn"
                          onClick={() => toggleIssue(issue.code)}
                        >
                          {expandedIssues[issue.code] ? 'Hide records' : 'Show affected records'}
                        </button>
                        {expandedIssues[issue.code] && (
                          <IssueTable items={issue.items} />
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="doctor-section">
            <h2>What this tells us next</h2>
            <div className="doctor-next-steps">
              <div>
                <strong>1. Freeze legacy writers</strong>
                <span>
                  Stop pages from creating/updating settings bill arrays and retired collections.
                </span>
              </div>
              <div>
                <strong>2. Repair canonical links</strong>
                <span>
                  Make every recurring bill occurrence point to exactly one recurring pattern.
                </span>
              </div>
              <div>
                <strong>3. Rebuild payment clearing</strong>
                <span>
                  A matched posted transaction should make one occurrence paid and remove it from overdue immediately.
                </span>
              </div>
              <div>
                <strong>4. Migrate your Sheet</strong>
                <span>
                  Use the reviewed recurring-bills tab to seed clean recurring patterns only after the engine is stable.
                </span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default BillDoctor;
