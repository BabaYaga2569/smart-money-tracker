# Plaid to Monthly Bills staging bridge

This bridge runs on the SmartMoney backend with its existing Plaid and Firebase credentials. It reads the saved Items for exactly one Firebase user, obtains checking account transactions using its own Plaid sync cursor (it never updates SmartMoney's cursor), and stages only new transactions on `Plaid_Transactions`.

It uses the active rows of the test spreadsheet's `Account_Map` to translate institution names to the sheet's bank labels. The current map recognizes Bank of America → BofA, USAA → USAA, SoFi → SoFi, and Capital One → Cap1. No credit card accounts are imported.

## Setup for the test copy

1. Use the existing backend environment variables `FIREBASE_SERVICE_ACCOUNT`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV`. For real bank Items, `PLAID_ENV` must match the environment where they were created. Never commit values or paste them into a conversation.
2. Share the **test** Google spreadsheet with the `client_email` from the existing Firebase service account, as an editor. Grant this service account the Google Sheets API scope/permission in its Google Cloud project if needed.
3. Set `SHEETS_SPREADSHEET_ID=1qaaf0t9il726oQpL2oXMbZqlF7zJpHomsClk8vklE_g` and `SHEETS_USER_ID` to the Firebase Authentication UID of the SmartMoney account that owns the four checking accounts. Confirm the owner before setting it.
4. Set `SHEETS_START_DATE=2026-09-01` to limit the staged history. It defaults to 35 days ago if omitted.

From `backend/`, run `node scripts/export-plaid-to-sheets.mjs` to preview institution counts; this performs reads and writes nothing. After verifying the list and the test sheet's account map, run `node scripts/export-plaid-to-sheets.mjs --apply` to add the new rows. They remain in `REVIEW`; no monthly tab is touched.

The script checks existing transaction IDs before appending, so repeated runs skip those IDs. Pending and posted transactions can have different Plaid IDs; the posted row names the earlier pending ID in Notes for review. Review and remove the pending duplicate during reconciliation. It does not yet process Plaid removals or automatically reconcile a posted transaction with a pending row. Do not schedule this bridge until this behavior and the four account mappings are validated.

This draft does not modify the existing backend endpoints. The existing userId trust and token-returning Netlify function need separate security work before exposing an automated endpoint. This is a local backend command requiring the existing server-side credentials, not a public endpoint.
