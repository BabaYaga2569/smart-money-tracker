import test from 'node:test';
import assert from 'node:assert/strict';
import {registerMobileIdentityPreflight} from '../routes/mobileIdentityPreflight.js';
function harness({google={},firebase={}}={}){
 let handler;const app={get:(path,fn)=>{assert.equal(path,'/api/mobile-reconciliation/identity-check');handler=fn;}};
 registerMobileIdentityPreflight(app,{verifyGoogle:async token=>{if(token!=='good')throw Error('invalid');return{aud:'test-client',sub:'google-user-123',iss:'https://accounts.google.com',email:'person@example.com',email_verified:'true',exp:Math.floor(Date.now()/1000)+3600,...google}},findFirebaseUser:async()=>({email:'person@example.com',emailVerified:true,disabled:false,...firebase})});
 return async token=>{let status=200;const res={set:()=>res,status:n=>{status=n;return res},json:data=>data};const data=await handler({headers:token?{authorization:'Bearer '+token}:{}},res);return{status,data}};
}
async function enabled(callback){const oldFlag=process.env.MOBILE_GOOGLE_IDENTITY_CHECK_ENABLED,oldId=process.env.MOBILE_GOOGLE_CLIENT_ID;process.env.MOBILE_GOOGLE_IDENTITY_CHECK_ENABLED='YES_READ_ONLY';process.env.MOBILE_GOOGLE_CLIENT_ID='test-client';try{await callback()}finally{if(oldFlag===undefined)delete process.env.MOBILE_GOOGLE_IDENTITY_CHECK_ENABLED;else process.env.MOBILE_GOOGLE_IDENTITY_CHECK_ENABLED=oldFlag;if(oldId===undefined)delete process.env.MOBILE_GOOGLE_CLIENT_ID;else process.env.MOBILE_GOOGLE_CLIENT_ID=oldId}}
test('disabled feature returns 503 before reading identity',async()=>{const old=process.env.MOBILE_GOOGLE_IDENTITY_CHECK_ENABLED;delete process.env.MOBILE_GOOGLE_IDENTITY_CHECK_ENABLED;try{assert.equal((await harness()('good')).status,503)}finally{if(old!==undefined)process.env.MOBILE_GOOGLE_IDENTITY_CHECK_ENABLED=old}});
test('missing bearer token is rejected',async()=>enabled(async()=>assert.equal((await harness()()).status,401)));
test('valid matching verified identities pass without personal details',async()=>enabled(async()=>{const r=await harness()('good');assert.equal(r.status,200);assert.deepEqual(r.data,{ready:true,mode:'IDENTITY_ONLY',identityMatched:true})}));
test('wrong Google audience denied',async()=>enabled(async()=>assert.equal((await harness({google:{aud:'wrong'}})('good')).status,403)));
test('unverified Firebase account denied',async()=>enabled(async()=>assert.equal((await harness({firebase:{emailVerified:false}})('good')).status,403)));
test('Google and Firebase email mismatch denied',async()=>enabled(async()=>assert.equal((await harness({firebase:{email:'another@example.com'}})('good')).status,403)));
test('disabled Firebase user denied',async()=>enabled(async()=>assert.equal((await harness({firebase:{disabled:true}})('good')).status,403)));

test('rejects spoofed Google token issuer',async()=>enabled(async()=>assert.equal((await harness({google:{iss:'https://evil.example'}})('good')).status,403)));
test('rejects expired Google token',async()=>enabled(async()=>assert.equal((await harness({google:{exp:1}})('good')).status,403)));
