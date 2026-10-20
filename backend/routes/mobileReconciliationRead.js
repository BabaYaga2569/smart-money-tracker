import admin from 'firebase-admin';

// Dedicated strict-auth read endpoint, independent of the backend's AUTH_MODE.
// Read-only view of the authenticated owner's Plaid transaction identities.
export function registerMobileReconciliationReadRoute(app, db, verifyToken=(token)=>admin.auth().verifyIdToken(token,true)) {
 app.get('/api/mobile-reconciliation/transactions', async (req,res)=>{
  res.set('Cache-Control','no-store');
  try {
   const match=String(req.headers.authorization||'').match(/^Bearer (\S+)$/);
   if(!match)return res.status(401).json({error:'Firebase sign-in required'});
   const identity=await verifyToken(match[1]);
   if(!identity?.uid)return res.status(401).json({error:'Invalid identity'});
   const requestedDays=Number(req.query.days||14);
   if(!Number.isInteger(requestedDays)||requestedDays<1||requestedDays>31)return res.status(422).json({error:'days must be 1 through 31'});
   const since=new Date(Date.now()-requestedDays*86400000).toISOString().slice(0,10);
   const snap=await db.collection('users').doc(identity.uid).collection('transactions').where('date','>=',since).limit(500).get();
   const items=snap.docs.map(doc=>{
    const t=doc.data(),n=Number(t.amount);
    if(t.source!=='plaid'||!t.transaction_id||!t.account_id||!Number.isFinite(n)||n>=0||!/^\d{4}-\d{2}-\d{2}$/.test(String(t.date||'')))return null;
    return {transactionId:String(t.transaction_id),pendingTransactionId:t.pending_transaction_id?String(t.pending_transaction_id):null,accountId:String(t.account_id),amountCents:Math.round(Math.abs(n)*100),date:t.date,pending:t.pending===true,description:String(t.merchant_name||t.name||'').slice(0,160)};
   }).filter(Boolean);
   return res.status(200).json({mode:'READ_ONLY',items,limited:snap.size===500});
  } catch(err) {
   if(['auth/id-token-expired','auth/argument-error','auth/id-token-revoked'].includes(err.code))return res.status(401).json({error:'Firebase sign-in expired or invalid'});
   return res.status(503).json({error:'Read-only transaction service temporarily unavailable'});
  }
 });
}
