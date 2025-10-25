// frontend/src/utils/billMatcher.js
export function findMatchingTransactionForBill(bill, transactions) {
  if (!bill || !transactions) return null;

  const normalizedBillName = bill.name?.trim().toLowerCase();
  const candidates = transactions.filter(
    (tx) =>
      tx.name?.trim().toLowerCase().includes(normalizedBillName) &&
      Math.abs(Number(tx.amount) - Number(bill.amount)) < 0.01
  );

  // Pick the closest date match if multiple found
  if (candidates.length > 0) {
    return candidates.reduce((closest, current) => {
      const billDate = new Date(bill.dueDate);
      const currentDiff = Math.abs(new Date(current.date) - billDate);
      const closestDiff = Math.abs(new Date(closest.date) - billDate);
      return currentDiff < closestDiff ? current : closest;
    });
  }

  return null;
}
