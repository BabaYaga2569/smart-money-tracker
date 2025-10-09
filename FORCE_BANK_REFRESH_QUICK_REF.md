# Force Bank Refresh - Quick Reference Card

## 🎯 What It Does

Forces Plaid to check your bank **RIGHT NOW** for new pending transactions.

## 🚀 Quick Start

### For Users

1. Click green "🔄 Force Bank Check" button in Transactions page
2. Wait ~5 seconds
3. New pending transactions appear automatically!

### For Developers

**Backend Endpoint:**
```javascript
POST /api/plaid/refresh_transactions
Body: { userId: "firebase-user-id" }
Response: { success: true, request_id: "..." }
```

**Frontend Usage:**
```javascript
const forceRefresh = async () => {
  // Tell Plaid to check bank
  await fetch('/api/plaid/refresh_transactions', {
    method: 'POST',
    body: JSON.stringify({ userId: currentUser.uid })
  });
  
  // Wait 3 seconds
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Auto-sync new transactions
  await syncPlaidTransactions();
};
```

## 🎨 Visual Quick Reference

### Button Location
```
Transactions Page → Action Buttons Row
[ 🔄 Sync Plaid ]  [ 🔄 Force Bank Check ] ← HERE (green)
```

### Button States
```
Ready:     🔄 Force Bank Check       (green)
Active:    ⏳ Checking Bank...       (gray)
Disabled:  🔒 Force Bank Check       (gray, faded)
```

### Timeline
```
0s → Click button
3s → Auto-sync starts
5s → New transactions appear ✅
```

## 📋 Quick Testing

### Test Backend
```bash
curl -X POST http://localhost:5000/api/plaid/refresh_transactions \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-123"}'
```

### Test Frontend
1. Open Transactions page
2. Make a small purchase ($1-5)
3. Wait 1 minute
4. Click "Force Bank Check"
5. Wait 5 seconds
6. See new transaction appear!

## 📁 Files Modified

```
backend/server.js              +64 lines
frontend/src/pages/Transactions.jsx  +90 lines
```

## 📚 Documentation

- **Technical:** `FORCE_BANK_REFRESH_IMPLEMENTATION.md`
- **Visual:** `FORCE_BANK_REFRESH_VISUAL_GUIDE.md`
- **Summary:** `FORCE_BANK_REFRESH_SUMMARY.md`

## 🔑 Key Points

- ✅ Green button next to Sync button
- ✅ Takes ~5 seconds total
- ✅ Automatically syncs after refresh
- ✅ Works with pending transactions
- ✅ Disables all buttons during operation
- ✅ Shows clear notifications
- ✅ Full error handling

## ⚡ Quick Commands

```bash
# Start backend
cd backend && npm start

# Build frontend
cd frontend && npm run build

# Test endpoint
curl -X POST http://localhost:5000/api/plaid/refresh_transactions \
  -H "Content-Type: application/json" -d '{"userId":"test"}'
```

## 💡 Use Cases

| Scenario | Solution |
|----------|----------|
| Just made a purchase | Click Force Bank Check → See it in 5s |
| Checking balance | Force refresh → Get latest pending charges |
| Transaction not showing | Force refresh → Verify if it's at bank |
| Testing features | Force refresh → Immediate feedback |

## 🔒 Security

- ✅ Tokens stored server-side (Firestore)
- ✅ User isolation enforced
- ✅ Input validation
- ✅ No sensitive data in errors

## ⚠️ Limitations

- Bank response time: 1-5 seconds
- Requires active Plaid connection
- Subject to Plaid rate limits
- Needs internet connectivity

## 📊 Statistics

```
Total Changes:   +1,315 lines
Code:            +154 lines
Documentation:   +1,168 lines
Files:           5 files
Time:            ~1.5 hours
```

## ✅ Status

**Implementation:** ✅ Complete  
**Testing:** ✅ Passed  
**Documentation:** ✅ Complete  
**Ready:** ✅ For Deployment  

---

**Quick Links:**
- [Full Documentation](FORCE_BANK_REFRESH_IMPLEMENTATION.md)
- [Visual Guide](FORCE_BANK_REFRESH_VISUAL_GUIDE.md)
- [Summary](FORCE_BANK_REFRESH_SUMMARY.md)
- [Plaid API Docs](https://plaid.com/docs/api/products/transactions/#transactionsrefresh)
