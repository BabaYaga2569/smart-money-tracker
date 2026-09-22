# Plaid to Monthly Bills staging bridge

This draft runs separately from SmartMoney. It reads the saved Plaid Items for one Firebase user, scans checking-account transactions without changing SmartMoney's cursor, and stages new rows in the **test** spreadsheet's `Plaid_Transactions` tab. It does not edit monthly tabs. Nothing runs automatically when this draft branch is pushed.

## Windows test run (no Render Shell or deployment needed)

Prerequisites: Node.js 20 or newer and Git on your PC; the existing Render environment values `FIREBASE_SERVICE_ACCOUNT`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`; and your SmartMoney Firebase Authentication user UID. Keep the credentials private. Never put them in Git, the Google Sheet, screenshots, or chat. The Firebase service account email inside `FIREBASE_SERVICE_ACCOUNT` must match the email granted Editor access to the test sheet. You may read and copy these values yourself from Render's Environment screen; changing the running service is unnecessary.

Open PowerShell on your own PC. Clone the **draft branch** into a new folder:

```powershell
git clone --branch codex/plaid-sheets-review-bridge https://github.com/BabaYaga2569/smart-money-tracker.git plaid-sheet-test
cd plaid-sheet-test/backend
npm ci
```

Set these values *in that PowerShell window only*. Do not paste JSON into a PowerShell prompt: it can break across lines and print the private key in terminal history. Read the **new, private** JSON file directly from disk instead. Keep it out of the cloned repository.

```powershell
$jsonPath = Read-Host 'Full path to the NEW downloaded Firebase JSON file'
$env:FIREBASE_SERVICE_ACCOUNT = Get-Content -LiteralPath $jsonPath -Raw
if (($env:FIREBASE_SERVICE_ACCOUNT | ConvertFrom-Json).client_email -ne 'firebase-adminsdk-fbsvc@smartmoneycockpit-18359.iam.gserviceaccount.com') { throw 'Service account does not match test sheet share' }

function Set-SessionSecret($name) {
  $secure = Read-Host "Paste $name from Render" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr), 'Process') }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
Set-SessionSecret 'PLAID_CLIENT_ID'
Set-SessionSecret 'PLAID_SECRET'
$env:PLAID_ENV = 'production'
$env:SHEETS_USER_ID = 'YOUR_FIREBASE_AUTH_UID'
$env:SHEETS_SPREADSHEET_ID = '1qaaf0t9il726oQpL2oXMbZqlF7zJpHomsClk8vklE_g'
$env:SHEETS_START_DATE = '2026-09-01'
node scripts/export-plaid-to-sheets.mjs
```

Use the actual `PLAID_ENV` shown in Render if it differs from production; it must match the environment of the existing Items. The `SHEETS_USER_ID` must be the UID of the SmartMoney account with your four checking accounts; it is not your email address. The file path itself is only entered in PowerShell, never in chat. Do not share screenshots showing credentials or full terminal history. If the service account check fails, stop before running the importer.

The default command is a read-only **preview**. It prints institutions, checking account counts, and the number of new transactions since September 1, without listing individual bank transactions. Check for Bank of America, USAA, SoFi, and Capital One before proceeding. The four enabled `Account_Map` rows translate these names into BofA, USAA, SoFi, and Cap1. Some institutions may use different names; an unmapped institution will be skipped and reported.

After the preview is verified, in the same PowerShell window run:

```powershell
node scripts/export-plaid-to-sheets.mjs --apply
```

The apply command appends new rows to **test** `Plaid_Transactions` as `REVIEW`; it does not insert them into a monthly tab or alter SmartMoney. Check the staging tab and review the rows before using the sheet's existing approval workflow. Closing PowerShell discards these session variables. No schedule is installed.

The script deduplicates existing transaction IDs. Pending and posted versions can have different IDs; the posted version names the pending ID in Notes. Reconcile such pairs by hand. It does not yet handle Plaid removals or automatically replace pending rows, so do not schedule recurring runs until those cases are addressed. Do not use the live spreadsheet ID for this test.

The draft does not modify existing SmartMoney endpoints. Its current authentication and Plaid token handling need a separate security review before building any public automation endpoint.
