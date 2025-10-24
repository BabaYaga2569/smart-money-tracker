import React, { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import "./Bills.css";

export default function Bills() {
  const { currentUser } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    if (!currentUser) return;
    const billsRef = collection(db, "users", currentUser.uid, "bills");
    const q = query(billsRef, orderBy("dueDate", "asc"));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBills(data);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  if (loading) return <div className="bills-loading">Loading bills...</div>;

  const Section = ({ title, items, emptyText }) => (
    <section className="bills-section">
      <h3 className="bills-section-title">{title} ({items.length})</h3>
      {items.length === 0 ? (
        <div className="bills-empty">{emptyText}</div>
      ) : (
        <div className="bills-list">
          {items.map(b => {
            const isOverdue = new Date(b.dueDate) < now && !b.paid;
            return (
              <div key={b.id} className={\`bill-card \${b.paid ? "paid" : ""} \${isOverdue ? "overdue" : ""}\`}>
                <div className="bill-title-row">
                  <span className="bill-name">{b.name}</span>
                  <span className="bill-amount">${Number(b.amount).toFixed(2)}</span>
                </div>
                <div className="bill-meta">
                  <span className="bill-date">Due: {b.dueDate}</span>
                  {isOverdue && <span className="bill-status overdue">Overdue</span>}
                  {b.paid && <span className="bill-status paid">Paid</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  const overdue = bills.filter(b => new Date(b.dueDate) < now && !b.paid);
  const upcoming = bills.filter(b => new Date(b.dueDate) >= now && !b.paid);
  const paid = bills.filter(b => b.paid);

  return (
    <div className="bills-page">
      <h2 className="page-title">Bills</h2>
      <Section title="Overdue" items={overdue} emptyText="No overdue bills" />
      <Section title="Upcoming" items={upcoming} emptyText="No upcoming bills" />
      <Section title="Paid" items={paid} emptyText="No paid bills yet" />
    </div>
  );
}
