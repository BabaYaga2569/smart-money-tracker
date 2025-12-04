# Firebase Data Migration Scripts

## Overview

This directory contains migration scripts to transform the Smart Money Tracker database from its current bloated state to a clean, unified architecture. The migration addresses:

- **~55% data redundancy** from bills stored in 5 different places
- **Bloated settings document** (~50KB with embedded bill data)
- **Test user cleanup** (steve-colburn with ~34 documents)
- **Stale pending transactions** affecting balance calculations
- **Poor auto-detection** (0/8 matches due to merchant name variations)

### Target Architecture

| Before | After |
|--------|-------|
| billInstances collection | ❌ Deleted |
| paidBills collection | ❌ Deleted |
| bill_payments collection | ❌ Deleted |
| settings.bills[] | ❌ Removed |
| settings.recurringItems[] | ❌ Removed |
| - | ✅ financialEvents (single source of truth) |
| - | ✅ recurringPatterns (smart patterns) |
| - | ✅ aiLearning (merchant matching) |

**Expected Results:**
- Document count: ~906 → ~450 (50% reduction)
- Settings size: ~50KB → ~2KB
- Redundancy: ~55% → 0%

---

## Prerequisites

Before running any migration scripts:

### 1. Firebase Credentials

Place your Firebase service account JSON in one of these locations:

```bash
# Option A: File in backend directory
./firebase-key.json

# Option B: Environment variable
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"..."}'
```

### 2. Install Dependencies

```bash
cd backend
npm install
```

### 3. Test Firebase Connection

```bash
node scripts/check-all-plaid-data.js
```

If this runs without errors, your Firebase connection is working.

---

## Migration Phases

### Phase 0: Assessment & Safety (Required First!)

| Script | Purpose | Risk |
|--------|---------|------|
| `00-audit-current-state.js` | Generate detailed database report | 🟢 Safe (read-only) |
| `00-backup-firebase.js` | Create complete database backup | 🟢 Safe (read-only) |

**⚠️ Always run these first before any data modifications!**

### Phase 1: Quick Wins (Safe, Low Risk)

| Script | Purpose | Risk |
|--------|---------|------|
| `01-cleanup-test-user.js` | Delete test user steve-colburn | 🟡 Low (deletes test data) |
| `02-fix-pending-transactions.js` | Fix stale pending transactions | 🟡 Low (updates status) |
| `03-create-merchant-aliases.js` | Create AI learning collection | 🟢 Safe (new data only) |

### Phase 2: Data Restructuring (Medium Risk)

| Script | Purpose | Risk |
|--------|---------|------|
| `04-extract-bills-from-settings.js` | Move bills from settings to new collections | 🟡 Medium |
| `05-merge-collections.js` | Merge old bill collections | 🟡 Medium |
| `06-link-transactions.js` | Link transactions to financial events | 🟡 Medium |

### Phase 3: Final Cleanup (High Risk!)

| Script | Purpose | Risk |
|--------|---------|------|
| `07-delete-old-collections.js` | Delete old bill collections | 🔴 High (permanent) |

### Emergency Recovery

| Script | Purpose |
|--------|---------|
| `99-restore-from-backup.js` | Restore from backup file |

---

## Execution Timeline

### Day 1: Assessment

```bash
# 1. Run audit to understand current state
node scripts/00-audit-current-state.js

# Review the output and audit-report-*.json file
# Verify the numbers match expectations

# 2. Create a backup
node scripts/00-backup-firebase.js

# Verify backup file exists and has data
ls -la firebase-backup-*.json
```

### Day 2: Quick Wins

```bash
# 3. Clean up test user (optional but recommended)
node scripts/01-cleanup-test-user.js

# 4. Fix stale pending transactions
node scripts/02-fix-pending-transactions.js

# 5. Create merchant aliases for better matching
node scripts/03-create-merchant-aliases.js
```

### Day 3: Data Restructuring

```bash
# 6. Extract bills from settings document
node scripts/04-extract-bills-from-settings.js

# 7. Merge old bill collections
node scripts/05-merge-collections.js

# 8. Link transactions to financial events
node scripts/06-link-transactions.js

# IMPORTANT: Verify data before proceeding
# Check financialEvents and recurringPatterns in Firebase console
```

### Day 4: Cleanup (Only after verification!)

```bash
# 9. DANGER: Delete old collections
# Only run this after verifying all data is correctly migrated!
node scripts/07-delete-old-collections.js
```

---

## Script Details

### 00-audit-current-state.js

Generates a comprehensive report of the current database state:

- Total document counts by collection
- Bill data redundancy analysis
- Settings document size breakdown
- Stale pending transactions list
- Test user detection
- Recommendations for cleanup

**Output:** `audit-report-{timestamp}.json`

### 00-backup-firebase.js

Creates a complete JSON backup of the Firebase database:

- All collections and documents
- All subcollections (recursive)
- Timestamps converted to ISO strings

**Output:** `firebase-backup-{timestamp}.json`

### 01-cleanup-test-user.js

Removes the test user account and all associated data:

- User ID: `steve-colburn`
- Deletes all subcollections first
- Confirms before deletion
- Expected: ~34 documents deleted

### 02-fix-pending-transactions.js

Fixes transactions incorrectly marked as pending:

- Finds transactions with `pending: true` older than 3 days
- Updates to `pending: false`
- Preserves original status in `originalPending` field
- Reports balance impact

### 03-create-merchant-aliases.js

Creates the AI learning infrastructure:

**Documents created:**
- `aiLearning/merchantAliases` - 25+ merchant profiles with aliases
- `aiLearning/matchingConfig` - Matching configuration
- `aiLearning/usageStats` - Usage tracking

**Example merchant profile:**
```javascript
{
  canonicalName: 'SiriusXM',
  aliases: ['siriusxm', 'sirrius', 'sirius', 'sirius xm', 'sxm'],
  category: 'Entertainment',
  type: 'subscription',
  confidence: 0.95
}
```

### 04-extract-bills-from-settings.js

Extracts embedded bill data from settings document:

**From:** `settings/personal.bills[]` and `settings/personal.recurringItems[]`

**To:**
- `financialEvents/` - Individual bill instances
- `recurringPatterns/` - Recurring bill patterns

**Fields removed from settings:**
- `bills` array
- `recurringItems` array

### 05-merge-collections.js

Merges old bill collections into financialEvents:

**Source collections:**
- `billInstances`
- `paidBills`
- `bill_payments`

**Features:**
- Deduplication by name + date
- Preserves original data in `originalData` field
- Standardizes date formats

### 06-link-transactions.js

Links bank transactions to financial events:

**Matching criteria:**
- Amount: exact or within $0.50
- Date: within ±3 days
- Merchant name: 70%+ fuzzy match using aliases

**Updates:**
- `financialEvent.linkedTransactionId`
- `transaction.linkedEventId`
- Confidence scores stored

### 07-delete-old-collections.js

**⚠️ DANGER: Permanently deletes data!**

Deletes old bill collections after migration:

**Collections deleted:**
- `billInstances`
- `paidBills`
- `bill_payments`

**Safety features:**
- Requires `financialEvents` to have data
- 10-second countdown with Ctrl+C option
- Requires typing `DELETE` to confirm

### 99-restore-from-backup.js

Emergency restore from backup file:

```bash
node scripts/99-restore-from-backup.js firebase-backup-2024-01-15T12-30-00.json
```

**Features:**
- Restores all collections and subcollections
- Converts ISO strings back to Timestamps
- Overwrites existing documents

---

## Troubleshooting

### "Firebase credentials not found"

Ensure you have either:
- `./firebase-key.json` file in the backend directory
- `FIREBASE_SERVICE_ACCOUNT` environment variable set

### "Permission denied" errors

Your service account may not have write permissions. Check:
- Firestore rules allow admin writes
- Service account has appropriate IAM roles

### Script hangs on confirmation

Press Enter after typing your response, or use Ctrl+C to cancel.

### Partial migration completed

If a script fails mid-way:
1. Check the console output for the last successful operation
2. The script can be safely re-run (idempotent)
3. Use backup restore if needed

### Wrong data deleted

Immediately run the restore script:
```bash
node scripts/99-restore-from-backup.js firebase-backup-TIMESTAMP.json
```

---

## Success Checklist

Before running final cleanup (07-delete-old-collections.js):

- [ ] Backup file exists and is recent
- [ ] Audit report reviewed
- [ ] Test user cleaned up (optional)
- [ ] Pending transactions fixed
- [ ] Merchant aliases created
- [ ] Bills extracted from settings
- [ ] Collections merged
- [ ] Transactions linked
- [ ] **financialEvents has expected number of documents**
- [ ] **recurringPatterns has expected data**
- [ ] **Settings document size reduced**
- [ ] Application tested with new structure

---

## User IDs Reference

| User | ID | Notes |
|------|-----|-------|
| Main User | `MQWMkJUjTpTYVNJZAMWiSEk0ogj1` | Primary user data |
| Test User | `steve-colburn` | Can be deleted |

---

## Support

If you encounter issues:

1. Check the console output for error messages
2. Review the audit report for unexpected data
3. Use the backup restore as a safety net
4. Do not run Phase 3 until Phase 2 is verified

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024 | Initial migration scripts |
