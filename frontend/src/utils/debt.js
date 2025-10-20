// utils/debt.js
export function simulatePayoff(balance, apr, monthlyPayment, maxMonths = 360) {
  const r = (apr / 100) / 12;
  let b = Math.max(0, Number(balance) || 0);
  let months = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  const schedule = [];

  if (b === 0) {
    return { months: 0, years: 0, totalInterest: 0, totalPaid: 0, schedule, negativeAmortization: false };
  }
  if (!monthlyPayment || monthlyPayment <= 0) {
    return { months: maxMonths, years: maxMonths / 12, totalInterest: Infinity, totalPaid: 0, schedule, negativeAmortization: true };
  }
  if (monthlyPayment <= b * r) {
    return { months: maxMonths, years: maxMonths / 12, totalInterest: Infinity, totalPaid: monthlyPayment * maxMonths, schedule, negativeAmortization: true };
  }

  while (b > 0.01 && months < maxMonths) {
    const interest = b * r;
    const principal = Math.min(monthlyPayment - interest, b);
    const payment = principal + interest;

    b = b - principal;
    months += 1;
    totalInterest += interest;
    totalPaid += payment;
    schedule.push({ month: months, balance: Math.max(0, b), interest, payment });
  }

  return { months, years: months / 12, totalInterest, totalPaid, schedule, negativeAmortization: false };
}

export function estimateMinimumPayment(balance, apr) {
  const r = (apr / 100) / 12;
  const percentPortion = balance * 0.02; // 2% of balance
  const interestPortion = balance * r;   // interest due
  const floor = 25;                       // common $25 floor
  return Math.max(floor, percentPortion + interestPortion);
}

export function currency(n) {
  try {
    return Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}