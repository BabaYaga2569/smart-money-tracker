export const isVisibleBillOccurrence = (bill) => {
  if (!bill) return false;

  return (
    bill.type === 'bill' &&
    bill.isPaid !== true &&
    bill.hiddenFromBills !== true &&
    bill.archivedDuplicate !== true
  );
};

export const visibleBillOccurrences = (bills = []) =>
  bills.filter(isVisibleBillOccurrence);
