import test from 'node:test';
import assert from 'node:assert/strict';
import {registerMobileGoogleSnapshot} from '../routes/mobileGoogleReconciliation.js';

function setup({google={},user={},items=[],accounts=[]}={}) {
 let route,readUid=null,reads=0;
 const app={get:(path,fn)=>{assert.equal(path,'/api/mobile-reconciliation/google-snapshot');route=fn}};
 const db={collection(name){assert.equal(name,'users');return{doc(uid){readUid=uid;return{collection(collection){
  if(collection==='transactions')return{where(){return{limit(){return{get:async()=>{reads++;return{size:items.length,docs:items.map(t=>({data:()=>t}))}}}}}}};
  if(collection==='settings')return{doc(){return{get:async()=>({exists:true,data:()=>({plaidAccounts:accounts})})}}};
  throw Error('unexpected collection');
 }}}}}};
 registerMobileGoogleSnapshot(app,{db,verifyGoogle:async token=>{if(token!=='valid')throw Error('Invalid token');return{aud:'test-client',iss:'https://accounts.google.com',sub:'google-id-1',email:'person@example.com',email_verified:true,exp:Math.floor(Date.now()/1000)+3600,...google}},findFirebaseUser:async email=>({uid:'verified-firebase-user',email,emailVerified:true,disabled:false,...user})});
 return{async call(token='valid',days='14'){let status=200;const res={set(){return this},status(n){status=n;return this},json(data){return data}};const body=await route({headers:token?{authorization:'Bearer '+token}:{},query:{days}},res);return{status,body,readUid,reads}}};
}
async function enabled(run){const names=['MOBILE_GOOGLE_IDENTITY_CHECK_ENABLED','MOBILE_GOOGLE_TRANSACTION_READ_ENABLED','MOBILE_GOOGLE_CLIENT_ID','MOBILE_GOOGLE_ALLOWED_EMAIL'];const old=names.map(k=>process.env[k]);Object.assign(process.env,{MOBILE_GOOGLE_IDENTITY_CHECK_ENABLED:'YES_READ_ONLY',MOBILE_GOOGLE_TRANSACTION_READ_ENABLED:'YES_READ_ONLY',MOBILE_GOOGLE_CLIENT_ID:'test-client',MOBILE_GOOGLE_ALLOWED_EMAIL:'person@example.com'});try{await run()}finally{names.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i]})}}
test('read-only feature remains disabled by default',async()=>{const h=setup();const r=await h.call();assert.equal(r.status,503);assert.equal(r.readUid,null)});
test('invalid Google credential cannot query Firestore',async()=>enabled(async()=>{const r=await setup().call('invalid');assert.equal(r.status,503);assert.equal(r.readUid,null)}));
test('wrong app audience cannot query Firestore',async()=>enabled(async()=>{const r=await setup({google:{aud:'other'}}).call();assert.equal(r.status,403);assert.equal(r.readUid,null)}));
test('unverified Firebase account cannot query Firestore',async()=>enabled(async()=>{const r=await setup({user:{emailVerified:false}}).call();assert.equal(r.status,403);assert.equal(r.readUid,null)}));
test('only verified Firebase UID is queried, not a supplied label',async()=>enabled(async()=>{const h=setup({items:[{source:'plaid',transaction_id:'t1',account_id:'acct-1',date:'2026-10-19',amount:-12.34,pending:true,pending_transaction_id:null}]});const r=await h.call();assert.equal(r.status,200);assert.equal(r.readUid,'verified-firebase-user');assert.equal(r.body.transactions[0].amountCents,1234)}));
test('only charges get into the reconciliation view',async()=>enabled(async()=>{const h=setup({items:[{source:'plaid',transaction_id:'refund',account_id:'acct',date:'2026-10-19',amount:12.34},{source:'manual',transaction_id:'m1',account_id:'acct',date:'2026-10-19',amount:-2},{source:'plaid',transaction_id:'charge',account_id:'acct',date:'2026-10-19',amount:-2,pending_transaction_id:'old'}]});const r=await h.call();assert.equal(r.body.transactions.length,1);assert.equal(r.body.transactions[0].pendingTransactionId,'old')}));
test('no Plaid tokens or full account credentials are returned',async()=>enabled(async()=>{const h=setup({items:[{source:'plaid',transaction_id:'t',account_id:'acct',date:'2026-10-19',amount:-1,secret:'never-show'}],accounts:[{account_id:'acct',institution_name:'Test Bank',mask:'1234',accessToken:'must-not-show'}]});const r=await h.call();assert.equal(r.status,200);assert.equal(JSON.stringify(r.body).includes('must-not-show'),false);assert.equal(JSON.stringify(r.body).includes('never-show'),false)}));
test('date windows larger than 31 days are rejected',async()=>enabled(async()=>{const r=await setup().call('valid','45');assert.equal(r.status,422);assert.equal(r.readUid,null)}));
