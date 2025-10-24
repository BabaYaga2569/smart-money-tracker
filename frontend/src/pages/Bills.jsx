import React, { useMemo, useState, useEffect } from "react";
import { collection, doc, onSnapshot, orderBy, query, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { findMatchingTransactionForBill } from "../utils/billMatcher";
import "./Bills.css";

export default function Bills() {
  const { currentUser } = useAuth();
  const [bills, setBills] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    const billsRef = collection(db, "users", currentUser.uid, "bills");
    const q = query(billsRef, orderBy("dueDate", "asc"));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBills(data);
    });
    return () => unsub();
  }, [currentUser]);

  // If you already load transactions elsewhere, remove this listener and pass them in
  useEffect(() => {
    if (!currentUser) return;
    const txRef = collection(db, "users", currentUser.uid, "transactions");
    const unsub = onSnapshot(txRef, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(data);
    });
    return () => unsub();
  }, [currentUser]);

  const now = new Date();

  const { overdue, upcoming, paid } = useMemo(() => {
    const o = [], u = [], p = [];
    for (const b of bills) {
      const isPaid = !!b.paid;
      const due = b.dueDate ? new Date(b.dueDate) : null;
      const pastDue = due && due < new Date(now.toDateString()) && !isPaid;
      if (isPaid) p.push(b); else if (pastDue) o.push(b); else u.push(b);
    }
    o.sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
    u.sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
    p.sort((a,b)=>new Date(b.paidDate||0)-new Date(a.paidDate||0));
    return { overdue:o, upcoming:u, paid:p };
  }, [bills]);

  async function markPaid(bill) {
    if (!currentUser) return;
    const ref = doc(db, "users", currentUser.uid, "bills", bill.id);
    await updateDoc(ref, { paid:true, paidDate:Timestamp.now(), paidVia:"Manual" });
  }

  // Local auto-match pass using transactions (non-destructive; only marks when certain)
  useEffect(() => {
    (async () => {
      if (!currentUser || !transactions.length || !bills.length) return;
      const updates = [];
      for (const b of bills) {
        if (b.paid) continue;
        const m = findMatchingTransactionForBill(b, transactions);
        if (!m) continue;
        const ref = doc(db, "users", currentUser.uid, "bills", b.id);
        updates.push(updateDoc(ref, {
          paid: true,
          paidDate: Timestamp.now(),
          paidVia: "Auto (Plaid)",
          lastMatchedTxnId: m.id || null,
        }));
      }
      await Promise.allSettled(updates);
    })();
  }, [currentUser, transactions, bills]);

  const Section = ({ title, items, emptyText }) => (
    <section className="bills-section">
      <h3 className="bills-section-title">{title} ({items.length})</h3>
      {items.length===0 ? <div className="bills-empty">{emptyText}</div> : (
        <div className="bills-list">
          {items.map(b => {
            const isOverdue = new Date(b.dueDate) < now && !b.paid;
            return (
              <div key={b.id} className={`bill-card ${b.paid?"paid":""} ${isOverdue?"overdue":""}`}>
                <div className="bill-title-row">
                  <span className="bill-name">{b.name}</span>
                  <span className="bill-amount">${Number(b.amount).toFixed(2)}</span>
                </div>
                <div className="bill-meta-row">
                  <span className="bill-duedate">Due {new Date(b.dueDate).toLocaleDateString()}</span>
                  {b.paid ? (
                    <span className="bill-paid-badge">
                      ✅ Paid {b.paidDate?.toDate?.() ? b.paidDate.toDate().toLocaleDateString() : (b.paidDate? new Date(b.paidDate).toLocaleDateString() : "")}
                      {b.paidVia ? ` • ${b.paidVia}` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="bill-actions">
                  {!b.paid ? (
                    <button className="btn btn-success" onClick={() => markPaid(b)}>Mark Paid</button>
                  ) : (
                    <button className="btn btn-muted" disabled>Paid {b.paidVia?`(${b.paidVia})`:""}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className="bills-page">
      <Section title="Overdue" items={overdue} emptyText="No overdue bills 🎉"/>
      <Section title="Upcoming" items={upcoming} emptyText="No upcoming bills"/>
      <Section title="Paid (this month)" items={paid} emptyText="Nothing paid yet"/>
    </div>
  );
}
