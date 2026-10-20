// Google-to-Firebase, strictly read-only mobile Plaid snapshot.
// The two independent Render feature flags and exact email allowlist are mandatory.
// No Plaid API calls, no bank secrets, no writes, and no automatic reconciliation.
export function registerMobileGoogleSnapshot(app,{verifyGoogle,findFirebaseUser,db}) {
 app.get('/api/mobile-reconciliation/google-snapshot',async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{
   if(process.env.MOBILE_GOOGLE_IDENTITY_CHECK_ENABLED!=='YES_READ_ONLY'||process.env.MOBILE_GOOGLE_TRANSACTION_READ_ENABLED!=='YES_READ_ONLY')
    return res.status(503).json({ready:false,reason:'Mobile bank read disabled'});
   const clientId=process.env.MOBILE_GOOGLE_CLIENT_ID;
   const allowed=String(process.env.MOBILE_GOOGLE_ALLOWED_EMAIL||'').trim().toLowerCase();
   if(!clientId||!allowed)return res.status(503).json({ready:false,reason:'Mobile identity configuration incomplete'});
   const bearer=String(req.headers.authorization||'').match(/^Bearer (\S+)$/);
   if(!bearer)return res.status(401).json({ready:false,reason:'Google sign-in required'});
   const identity=await verifyGoogle(bearer[1]);
   const email=String(identity?.email||'').trim().toLowerCase();
   if(identity?.aud!==clientId||!['accounts.google.com','https://accounts.google.com'].includes(identity?.iss)||
      !identity?.sub||(identity?.email_verified!==true&&identity?.email_verified!=='true')||
      !Number.isFinite(Number(identity.exp))||Number(identity.exp)*1000<=Date.now()||email!==allowed)
     return res.status(403).json({ready:false,reason:'Mobile account not authorized'});
   const user=await findFirebaseUser(email);
   if(!user?.uid||user.disabled||user.emailVerified!==true||String(user.email||'').toLowerCase()!==email)
     return res.status(403).json({ready:false,reason:'Firebase account mapping not verified'});
   const days=Number(req.query.days||14);
   if(!Number.isInteger(days)||days<1||days>31)return res.status(422).json({ready:false,reason:'Invalid date window'});
   const since=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
   const ref=db.collection('users').doc(user.uid);
   const snapshot=await ref.collection('transactions').where('date','>=',since).limit(300).get();
   const transactions=snapshot.docs.map(doc=>{
    const t=doc.data(),amount=Number(t.amount);
    if(t.source!=='plaid'||!t.transaction_id||!t.account_id||!Number.isFinite(amount)||amount>=0||
       !/^\d{4}-\d{2}-\d{2}$/.test(String(t.date||'')))return null;
    return {transactionId:String(t.transaction_id),pendingTransactionId:t.pending_transaction_id?String(t.pending_transaction_id):null,accountId:String(t.account_id),amountCents:Math.round(-amount*100),date:String(t.date),pending:t.pending===true,description:String(t.merchant_name||t.name||'').slice(0,120)};
   }).filter(Boolean);
   const settings=await ref.collection('settings').doc('personal').get();
   const accounts=(settings.exists&&Array.isArray(settings.data()?.plaidAccounts)?settings.data().plaidAccounts:[]).map(a=>{
    const id=a.account_id||a.accountId||a.id;
    if(!id)return null;
    return{accountId:String(id),name:String(a.name||a.official_name||'').slice(0,80),institution:String(a.institution_name||a.institutionName||'').slice(0,80),mask:String(a.mask||'').slice(-4)};
   }).filter(Boolean);
   return res.status(200).json({ready:true,mode:'READ_ONLY',transactions,accounts,limited:snapshot.size===300});
  }catch(e){
   if(e?.code==='auth/user-not-found')return res.status(403).json({ready:false,reason:'Firebase identity not linked'});
   return res.status(503).json({ready:false,reason:'Mobile reconciliation temporarily unavailable'});
  }
 });
}
