// Fail-closed mobile Google -> Firebase identity preflight.
// It does NOT return bank records or Firebase UIDs and has no write operations.
export function registerMobileIdentityPreflight(app,{verifyGoogle,findFirebaseUser}){
 app.get('/api/mobile-reconciliation/identity-check',async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{
   if(process.env.MOBILE_GOOGLE_IDENTITY_CHECK_ENABLED!=='YES_READ_ONLY')return res.status(503).json({ready:false,reason:'Mobile identity bridge not enabled'});
   const clientId=process.env.MOBILE_GOOGLE_CLIENT_ID;
   if(!clientId)return res.status(503).json({ready:false,reason:'Mobile Google client not configured'});
   const match=String(req.headers.authorization||'').match(/^Bearer (\S+)$/);
   if(!match)return res.status(401).json({ready:false,reason:'Google sign-in required'});
   const google=await verifyGoogle(match[1]);
   const email=String(google.email||'').trim().toLowerCase();
   if(google.aud!==clientId||(google.email_verified!==true&&google.email_verified!=='true')||!email||Number(google.exp)*1000<Date.now())return res.status(403).json({ready:false,reason:'Google identity not verified for mobile app'});
   const firebase=await findFirebaseUser(email);
   if(!firebase||firebase.disabled||firebase.emailVerified!==true||String(firebase.email||'').toLowerCase()!==email)return res.status(403).json({ready:false,reason:'Verified Firebase account mapping not established'});
   return res.status(200).json({ready:true,mode:'IDENTITY_ONLY',identityMatched:true});
  }catch(e){
   if(e?.code==='auth/user-not-found')return res.status(403).json({ready:false,reason:'No linked Firebase user'});
   return res.status(503).json({ready:false,reason:'Identity verification unavailable'});
  }
 });
}
