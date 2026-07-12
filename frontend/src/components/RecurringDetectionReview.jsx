// RecurringDetectionReview.jsx
// Review UI for auto-detected recurring streams.
//
// Wire-up in Recurring.jsx:
//   import RecurringDetectionReview from '../components/RecurringDetectionReview';
//   const [showDetection, setShowDetection] = useState(false);
//   <button className="btn-primary" onClick={() => setShowDetection(true)}>
//     🔍 Detect from my banks
//   </button>
//   {showDetection && (
//     <RecurringDetectionReview
//       userId={currentUser.uid}
//       apiUrl={import.meta.env.VITE_API_URL}
//       onApprove={handleApproveDetectedStreams}   // receives array of template objects
//       onClose={() => setShowDetection(false)}
//     />
//   )}

import React, { useState, useEffect, useCallback } from 'react';
import './RecurringDetectionReview.css';

const FREQ_LABEL = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Yearly',
};

export default function RecurringDetectionReview({ userId, apiUrl, onApprove, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState({});   // streamKey -> bool
  const [edits, setEdits] = useState({});         // streamKey -> {name, amount}
  const [saving, setSaving] = useState(false);

  const streamKey = (s) => `${s.merchantKey}::${s.averageAmount}`;

  const runDetection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${apiUrl}/api/recurring/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!resp.ok) throw new Error(`Detection failed (${resp.status})`);
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Detection failed');
      setResult(data);
      // Pre-select high-confidence new streams
      const pre = {};
      for (const s of data.newStreams) {
        pre[streamKey(s)] = s.confidence >= 70;
      }
      setSelected(pre);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, userId]);

  useEffect(() => { runDetection(); }, [runDetection]);

  const toggle = (s) =>
    setSelected(prev => ({ ...prev, [streamKey(s)]: !prev[streamKey(s)] }));

  const edit = (s, field, value) =>
    setEdits(prev => ({
      ...prev,
      [streamKey(s)]: { ...prev[streamKey(s)], [field]: value },
    }));

  const handleApprove = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const approved = result.newStreams
        .filter(s => selected[streamKey(s)])
        .map(s => {
          const e = edits[streamKey(s)] || {};
          return {
            name: e.name ?? s.displayName,
            amount: Number(e.amount ?? s.averageAmount),
            frequency: s.frequency === 'semimonthly' ? 'monthly' : s.frequency,
            nextOccurrence: s.nextPredictedDate,
            dayOfMonth: s.dayOfMonth,
            category: s.category || '',
            institutionName: s.institutionName || '',
            accountId: s.accountId || null,
            dataSource: 'auto_detected',
            detectionConfidence: s.confidence,
            detectedAt: new Date().toISOString(),
            status: 'active',
          };
        });
      await onApprove(approved, result.matched);
      onClose();
    } catch (err) {
      setError(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="rdr-overlay" onClick={onClose}>
      <div className="rdr-modal" onClick={e => e.stopPropagation()}>
        <div className="rdr-header">
          <h2>🔍 Detected Recurring Bills</h2>
          <button className="rdr-close" onClick={onClose}>✕</button>
        </div>

        {loading && (
          <div className="rdr-loading">
            Scanning your transaction history for recurring patterns…
          </div>
        )}

        {error && (
          <div className="rdr-error">
            {error}
            <button onClick={runDetection}>Retry</button>
          </div>
        )}

        {result && !loading && (
          <div className="rdr-body">
            {/* ---- New streams: candidates to add ---- */}
            <section>
              <h3>
                New recurring bills found ({result.newStreams.length})
                <span className="rdr-hint"> — check the ones to add</span>
              </h3>
              {result.newStreams.length === 0 && (
                <p className="rdr-empty">No new recurring bills detected. Everything already has a template. 🎉</p>
              )}
              {result.newStreams.map(s => {
                const key = streamKey(s);
                const e = edits[key] || {};
                return (
                  <div key={key} className={`rdr-stream ${selected[key] ? 'selected' : ''}`}>
                    <label className="rdr-check">
                      <input
                        type="checkbox"
                        checked={!!selected[key]}
                        onChange={() => toggle(s)}
                      />
                    </label>
                    <div className="rdr-stream-main">
                      <input
                        className="rdr-name-input"
                        value={e.name ?? s.displayName}
                        onChange={ev => edit(s, 'name', ev.target.value)}
                      />
                      <div className="rdr-meta">
                        <span className="rdr-freq">{FREQ_LABEL[s.frequency] || s.frequency}</span>
                        {s.dayOfMonth && <span>day {s.dayOfMonth}</span>}
                        <span>next: {s.nextPredictedDate}</span>
                        <span>seen {s.occurrences}×</span>
                        <span className={`rdr-conf conf-${s.confidence >= 80 ? 'high' : s.confidence >= 60 ? 'med' : 'low'}`}>
                          {s.confidence}% confident
                        </span>
                      </div>
                    </div>
                    <div className="rdr-amount">
                      $<input
                        className="rdr-amount-input"
                        type="number"
                        step="0.01"
                        value={e.amount ?? s.averageAmount}
                        onChange={ev => edit(s, 'amount', ev.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </section>

            {/* ---- Matched streams: drift warnings ---- */}
            {result.matched.length > 0 && (
              <section>
                <h3>Already tracked ({result.matched.length})</h3>
                {result.matched
                  .filter(m => Math.abs(m.amountDrift) >= 1)
                  .map(m => (
                    <div key={m.templateName + m.stream.merchantKey} className="rdr-drift">
                      ⚠️ <strong>{m.templateName}</strong>: your template says ${m.templateAmount.toFixed(2)},
                      but the bank was recently charged ${m.stream.lastAmount.toFixed(2)}
                      &nbsp;({m.amountDrift > 0 ? '+' : ''}{m.amountDrift.toFixed(2)}).
                    </div>
                  ))}
                {result.matched.every(m => Math.abs(m.amountDrift) < 1) && (
                  <p className="rdr-empty">All tracked bill amounts match your bank activity. ✅</p>
                )}
              </section>
            )}

            {/* ---- Income streams: payday confirmation ---- */}
            {result.incomeStreams.length > 0 && (
              <section>
                <h3>Detected income ({result.incomeStreams.length})</h3>
                {result.incomeStreams.map(s => (
                  <div key={streamKey(s)} className="rdr-income">
                    💵 <strong>{s.displayName}</strong> — ${s.averageAmount.toFixed(2)}, {FREQ_LABEL[s.frequency] || s.frequency},
                    next expected {s.nextPredictedDate}
                  </div>
                ))}
                <p className="rdr-hint">Income isn't added as bills — use it to verify your Pay Cycle settings.</p>
              </section>
            )}

            {/* ---- Ended streams: informational only ---- */}
            {result.endedStreams?.length > 0 && (
              <section>
                <h3>Ended — no longer charging ({result.endedStreams.length})</h3>
                {result.endedStreams.map(s => (
                  <div key={streamKey(s) + s.lastSeen} className="rdr-ended">
                    ⏹️ <strong>{s.displayName}</strong> — was ${s.averageAmount.toFixed(2)} {FREQ_LABEL[s.frequency] || s.frequency},
                    last seen {s.lastSeen} ({s.daysSinceLastSeen} days ago)
                  </div>
                ))}
                <p className="rdr-hint">Likely paid-off loans or cancelled subscriptions. Not suggested as bills.</p>
              </section>
            )}
          </div>
        )}

        <div className="rdr-footer">
          <button className="rdr-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="rdr-btn-primary"
            onClick={handleApprove}
            disabled={saving || selectedCount === 0}
          >
            {saving ? 'Saving…' : `Add ${selectedCount} bill${selectedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
