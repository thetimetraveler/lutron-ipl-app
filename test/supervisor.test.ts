import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppConfig } from '../src/contracts.js';
import { resolveBroker } from '../src/supervisor.js';

const config={mqtt_url:'',mqtt_username:'',mqtt_password:''} as AppConfig;
function response(body:unknown,status=200) { return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}); }
test('explicit broker wins without Supervisor token or fetch',async()=>{
  const result=await resolveBroker({...config,mqtt_url:'mqtt://broker.invalid:1883',mqtt_username:'operator',mqtt_password:'private'},{token:'super-secret',fetchImpl:async()=>{throw Error('must not call');}});
  assert.deepEqual(result,{url:'mqtt://broker.invalid:1883',username:'operator',password:'private'});
});
test('missing token returns null; missing/invalid service returns null',async()=>{
  assert.equal(await resolveBroker(config,{token:'',fetchImpl:async()=>{throw Error('must not call');}}),null);
  for (const body of [{result:'error'}, {result:'ok',data:{}}, {result:'ok',data:{host:'x',port:0}}, {result:'ok',data:{host:'bad/user',port:1883}}, {result:'ok',data:{host:'x',port:1883,ssl:'yes'}}]) {
    assert.equal(await resolveBroker(config,{token:'token',fetchImpl:async()=>response(body)}),null);
  }
  assert.equal(await resolveBroker(config,{token:'token',fetchImpl:async()=>response({},404)}),null);
});
test('valid service sets scheme/port/credentials and token is sent only in authorization header',async()=>{
  const result=await resolveBroker(config,{token:'token',fetchImpl:async(url,init)=>{
    assert.equal(url,'http://supervisor/services/mqtt'); assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer token'); assert.ok(init?.signal);
    return response({result:'ok',data:{host:'broker.invalid',port:8883,ssl:true,username:'u',password:'p'}});
  }});
  assert.deepEqual(result,{url:'mqtts://broker.invalid:8883',username:'u',password:'p'});
  assert.deepEqual(await resolveBroker(config,{token:'token',fetchImpl:async()=>response({result:'ok',data:{host:'::1',port:1883,username:'',password:''}})}),{url:'mqtt://[::1]:1883',username:undefined,password:undefined});
});
test('five second deadline covers stalled response body even when fetch ignores abort',async t=>{
  t.mock.timers.enable({apis:['setTimeout']}); let signal:AbortSignal|undefined;
  const result=resolveBroker(config,{token:'token',fetchImpl:async(_url,init)=>{
    signal=init?.signal ?? undefined; return {ok:true,status:200,json:()=>new Promise(()=>{})} as Response;
  }});
  await Promise.resolve(); t.mock.timers.tick(4999); assert.equal(signal?.aborted,false); t.mock.timers.tick(1);
  assert.equal(await result,null); assert.equal(signal?.aborted,true);
});
test('failure logs never interpolate tokens, passwords or thrown messages',async()=>{
  const logs:string[]=[]; const result=await resolveBroker(config,{token:'token-secret',fetchImpl:async()=>{throw Error('token-secret password-secret');},log:line=>logs.push(line)});
  assert.equal(result,null); assert.ok(logs.length>0); assert.ok(logs.every(line=>!line.includes('secret')));
});
test('five second deadline also bounds a fetch that never returns headers',async t=>{
  t.mock.timers.enable({apis:['setTimeout']}); let signal:AbortSignal|undefined;
  const result=resolveBroker(config,{token:'token',fetchImpl:async(_url,init)=>{signal=init?.signal ?? undefined; return await new Promise<Response>(()=>{});}});
  t.mock.timers.tick(5000); assert.equal(await result,null); assert.equal(signal?.aborted,true);
});
test('abort-respecting request rejection cannot leak its exception text',async t=>{
  t.mock.timers.enable({apis:['setTimeout']}); const logs:string[]=[];
  const result=resolveBroker(config,{token:'token-secret',log:line=>logs.push(line),fetchImpl:async(_url,init)=>await new Promise<Response>((_resolve,reject)=>{
    init?.signal?.addEventListener('abort',()=>reject(Error('token-secret abort error')),{once:true});
  })});
  t.mock.timers.tick(5000); assert.equal(await result,null); assert.ok(logs.some(line=>line.includes('timed out'))); assert.ok(logs.every(line=>!line.includes('secret')));
});
