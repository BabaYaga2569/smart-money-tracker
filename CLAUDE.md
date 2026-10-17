# Smart Money Tracker — Product Contract

These are the intended product rules for this app. Use them as the source of
truth before auditing, recommending, or changing anything. If code disagrees
with this contract, treat the code as the bug unless the owner says otherwise.

## Architecture

- Household financial tracker built on Plaid, Firebase/Firestore, a React
  frontend on Netlify, and a Node/Express backend on Render.
- Netlify is the canonical frontend deployment.
- The backend financial engine is the source of truth for bill lifecycle and
  payment state.
- Recurring patterns are templates; bill occurrences are generated from them.

## Household income

- **Steve** is paid biweekly. Total net pay is **$1,945.17**:
  - **$400** goes to **SoFi** one day before payday (early deposit).
  - The remainder (**$1,545.17**) goes to **Bank of America** on payday.
- **Tanci** is paid **$1,892.26** on the **15th** and the **30th**.
  - If the month has no 30th, use the last day of the month.
  - If the resulting date falls on a weekend, move it earlier to Friday.
  - No bank-holiday adjustment unless that rule is explicitly added later.
- **Upcoming Income** shows each household deposit as its own line item, not a
  single generic "Next Payday".

## Safe to Spend

- Safe to Spend = real available bank money minus bills due before the next
  household refill.
- **Available bank money** = the household cash accounts that are actually
  spendable and included in the financial model (the checking/savings accounts
  intentionally used for bills and household money). Never include credit
  cards or accounts explicitly excluded from Spendability.
- **Next household refill** = the very next incoming household deposit that
  materially increases available cash, including Steve's $400 SoFi early
  deposit. Reserve bills only until that refill event, then recalculate after
  the deposit lands. Money arriving today is already in the bank balance.

## Bill matching and payment lifecycle

- False-positive bill matches are more dangerous than missed matches.
- Automatic bill clearing requires strong evidence: merchant/name **and**
  amount **and** date, and only **outgoing Plaid** transactions.
- Changed-amount transactions are flagged for review. They must not
  automatically rewrite the recurring template.
- Broad merchants (Walmart, Amazon, Target, PayPal, Venmo, Zelle, etc.) are
  treated conservatively.
- Manual payment and manual linking flows must use the same canonical backend
  lifecycle as automatic payments.
- Paid bills must never be silently recreated as unpaid.
- A Plaid transaction must never be reused to clear more than one bill.

## Working rules

- No destructive live-data changes, token rotation, account disconnects, or
  security-sensitive production actions without explicit owner approval.
- Prefer focused, reversible fixes with regression tests over broad refactors.
- Do not change working production behavior just to "clean up" code unless the
  behavior is proven wrong.
- When auditing or proposing fixes, classify each item as one of:
  1. bug against these rules,
  2. legacy/dead code,
  3. security risk,
  4. optional cleanup.
