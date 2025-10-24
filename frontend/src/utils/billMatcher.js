import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

/**
 * 🧠 Finds a Plaid transaction that matches a given bill.
 * This compares both the merchant name and the amount.
 * It’s used to auto-mark bills as paid when Plaid data updates.
 */
export async function findMatchingTransactionForBill(userId, bill) {
  if (!userId || !bill) return null;

  try {
    // Defensive guards
    const billName = bill.name?.trim().toLowerCase();
    const billAmount = parseFloat(bill.amount);
    if (!billName || isNaN(billAmount)) return null;

    // Grab all user transactions from Firestore
    const txRef = collection(db, "users", userId, "transactions");
    const snap = await getDocs(txRef);

    let bestMatch = null;
    let smallestDiff = Infinity;

    snap.forEach((doc) => {
      const tx = doc.data();
      const txName = tx.name?.trim().toLowerCase();
      const txAmount = parseFloat(tx.amount);

      // Match by name similarity (substring or partial)
      const nameMatches =
        txName?.includes(billName) ||
        billName?.includes(txName) ||
        txName?.split(" ").some((w) => billName.includes(w));

      // Match by amount difference within $1 tolerance
      const amountDiff = Math.abs(txAmount - billAmount);

      if (nameMatches && amountDiff < 1 && amountDiff < smallestDiff) {
        bestMatch = { id: doc.id, ...tx };
        smallestDiff = amountDiff;
      }
    });

    if (bestMatch) {
      console.log(
        `✅ Found match for ${bill.name}: ${bestMatch.name} ($${bestMatch.amount})`
      );
    } else {
      console.log(`ℹ️ No matching transaction found for ${bill.name}`);
    }

    return bestMatch;
  } catch (err) {
    console.error("BillMatcher error:", err);
    return null;
  }
}
