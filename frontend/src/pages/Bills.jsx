import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { findMatchingTransactionForBill } from "../utils/billMatcher";
import "./Bills.css";

export default function Bills() {
  const { currentUser } = useAuth();
  const [bills, setBills] = useState([]);
  const [processedBills, setProcessedBills] = useState([]);

  // 🔁 Load bills in real-time from Firestore
  useEffect(() => {
    if (!currentUser) return;
    const billsRef = collection(db, "users", currentUser.uid, "bills");
    const q = query(billsRef, orderBy("dueDate", "asc"));

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBills(data);
    });

    return () => unsub();
  }, [currentUser]);

  // 🧠 Auto-mark paid when matching transaction exists
  useEffect(() => {
    const markPaid = async () => {
      if (!currentUser || !bills.length) return;

      const updatedBills = await Promise.all(
        bills.map(async (b) => {
          const matched = await findMatchingTransactionForBill(currentUser.uid, b);
          if (matched && !b.paid) {
            await updateDoc(doc(db, "users", currentUser.uid, "bills", b.id), { paid: true });
            return { ...b, paid: true };
          }
          return b;
        })
      );

      setProcessedBills(updatedBills);
    };

    markPaid();
  }, [bills, currentUser]);

  // 🧩 Categorize bills
  const overdue = useMemo(
    () => processedBills.filter((b) => !b.paid && new Date(b.dueDate) < new Date()),
    [processedBills]
  );
  const upcoming = useMemo(
    () => processedBills.filter((b) => !b.paid && new Date(b.dueDate) >= new Date()),
    [processedBills]
  );
  const paid = useMemo(() => processedBills.filter((b) => b.paid), [processedBills]);

  // 🧰 Mock fallback if Firestore is empty (for offline/dev)
  useEffect(() => {
    if (currentUser && !bills.length) {
      const mockBills = [
        {
          id: "mock1",
          name: "PiercePrime",
          amount: 125.5,
          category: "Bills & Utilities",
          recurrence: "monthly",
          dueDate: "2025-10-24",
          nextDueDate: "2025-10-24",
          status: "pending",
          account: "bofa",
          autopay: false,
          paid: false,
        },
      ];
      setBills(mockBills);
      setProcessedBills(mockBills);
    }
  }, [currentUser, bills.length]);

  // 🔹 Section renderer
  const Section = ({ title, items, emptyText }) => (
    <section className="bills-section">
      <h3 className="bills-section-title">
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <div className="bills-empty">{emptyText}</div>
      ) : (
        <div className="bills-list">
          {items.map((b) => {
            const isOverdue = new Date(b.dueDate) < new Date() && !b.paid;
            return (
              <div
                key={b.id}
                className={`bill-card ${b.paid ? "paid" : ""} ${isOverdue ? "overdue" : ""}`}
              >
                <div className="bill-title-row">
                  <span className="bill-name">{b.name}</span>
                  <span className="bill-amount">${Number(b.amount).toFixed(2)}</span>
                </div>
                <div className="bill-meta">
                  <span className="bill-date">
                    Due: {new Date(b.dueDate).toLocaleDateString()}
                  </span>
                  <span className="bill-status">
                    {b.paid ? "Paid" : isOverdue ? "Overdue" : "Pending"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  // 🏁 Render layout
  return (
    <div className="bills-page">
      <Section title="Overdue" items={overdue} emptyText="No overdue bills 🎉" />
      <Section title="Upcoming" items={upcoming} emptyText="No upcoming bills" />
      <Section title="Paid (this month)" items={paid} emptyText="Nothing paid yet" />
    </div>
  );
}
