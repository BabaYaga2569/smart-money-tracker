import test from 'node:test';
import assert from 'node:assert/strict';
import {registerMobileReconciliationReadRoute} from '../routes/mobileReconciliationRead.js';

function harness({uid='owner-123',records=[]}={}){
 let route,readUid=null;
 const app={get(path,handler){assert.equal(path,'/api/mobile-reconciliation/transactions');route=handler;}};
 const db={collection(name){
  assert.equal(name,'users');
  return {doc(id){
   readUid=id;
   return {collection(c){
    assert.equal(c,'transactions');
    return {where(){
     return {limit(){
      return {get:async()=>({size:records.length,docs:records.map(data=>({data:()=>data}))})};
     }};
    }};
   }};
  }};
 }};
 registerMobileReconciliationReadRoute(app,db,async token=>{if(token==='valid')return {uid};throw {code:'auth/id-token-expired'};});
 async function call({token,query={}}={}){let status=200,cache=null;
  const req={headers:token?{authorization:'Bearer '+token}:{},query};
  const res={set(k,v){cache=[k,v];return this},status(s){status=s;return this},json(body){return body}};
  const body=await route(req,res);
  return{status,body,readUid,cache};
 }
 return{call};
}
test('rejects requests with no Firebase token before database access',async()=>{const r=await harness().call();assert.equal(r.status,401);assert.equal(r.readUid,null)});
test('rejects invalid Firebase tokens before database access',async()=>{const r=await harness().call({token:'bad'});assert.equal(r.status,401);assert.equal(r.readUid,null)});
test('uses verified Firebase UID exclusively, never a client userId',async()=>{const h=harness({records:[{source:'plaid',transaction_id:'tx1',account_id:'acctA',date:'2026-10-19',amount:-12.34,pending:true}]});const r=await h.call({token:'valid',query:{userId:'someone-else',days:'14'}});assert.equal(r.status,200);assert.equal(r.readUid,'owner-123');assert.equal(r.body.items[0].amountCents,1234);assert.equal(r.body.items[0].pending,true)});
test('blocks large time windows',async()=>{const r=await harness().call({token:'valid',query:{days:'60'}});assert.equal(r.status,422);assert.equal(r.readUid,null)});
test('filters manual records and excludes bank access secrets',async()=>{const h=harness({records:[{source:'manual',transaction_id:'m1',account_id:'acct',date:'2026-10-19',amount:-1},{source:'plaid',transaction_id:'p1',account_id:'acct',date:'2026-10-19',amount:-1,accessToken:'private-secret'}]});const r=await h.call({token:'valid'});assert.equal(r.body.items.length,1);assert.equal(JSON.stringify(r.body).includes('private-secret'),false)});
