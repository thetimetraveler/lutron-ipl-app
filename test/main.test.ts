import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOptions } from "../src/config.js";
import type { Broker, IplFrame, Publisher, TransportOptions } from "../src/contracts.js";
import { startApp } from "../src/runtime.js";

function setup() {
  const config=parseOptions({processor_host:"processor.example",mappings:[{id:"demo",name:"Demo",device_id:101,ui_object_id:102}]});
  let timer:(()=>void)|undefined, callback:TransportOptions|undefined;
  let resolveCalls=0,transportStarts=0,transportStops=0,publisherStops=0;
  const published: unknown[]=[]; const health:boolean[]=[]; const logs:string[]=[];
  const publisher:Publisher={setIplHealth:h=>health.push(h),publishLevel:(_id,event)=>{published.push(event);return true;},
    publishDebug:()=>{published.push("debug");return true;},stop:async()=>{publisherStops++;}};
  const deps={resolveBroker:async():Promise<Broker|null>=>{resolveCalls++;return {url:"mqtt://broker.example"};},
    createPublisher:()=>publisher,
    startTransport:(options:TransportOptions)=>{transportStarts++;callback=options;return {stop:async()=>{transportStops++;}};},
    levelEvent:()=>({mappingId:"demo",event:{event_type:"level_adjustment" as const,source_kind:"ui_level_report" as const,
      device_id:101,ui_object_id:102,level:50,wire_value:0x7f80,received_at:"2026-01-01T00:00:00Z",session_id:"session"}}),
    setTimer:(fn:()=>void,delay:number)=>{assert.equal(delay,30000);timer=()=>{timer=undefined;fn();};return 1;},
    clearTimer:()=>{timer=undefined;},log:(msg:string)=>logs.push(msg)};
  return {config,deps,published,health,logs,publisher,get callback(){return callback;},get timer(){return timer;},
    counts:()=>({resolveCalls,transportStarts,transportStops,publisherStops})};
}

test("missing broker stays offline and retries without opening IPL",async()=>{
  const s=setup();let available=false;
  s.deps.resolveBroker=async()=>available?{url:"mqtt://broker.example"}:null;
  const app=startApp(s.config,{cert:"/fixture/cert",key:"/fixture/key",ca:"/fixture/ca"},s.deps);
  await app.ready;
  assert.equal(s.counts().transportStarts,0); assert.ok(s.timer);
  available=true;s.timer!();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(s.counts().transportStarts,1);assert.deepEqual(s.health,[false]);
  await app.stop();assert.equal(s.timer,undefined);
});

test("composition exposes UI observations and health without querying or commanding load state",async()=>{
  const s=setup(); const app=startApp(s.config,{cert:"/fixture/cert",key:"/fixture/key",ca:"/fixture/ca"},s.deps);await app.ready;
  assert.equal(s.callback?.host,"processor.example"); assert.deepEqual(s.health,[false]);
  s.callback!.onHealth(true);s.callback!.onFrame({} as IplFrame,"session");
  assert.deepEqual(s.health,[false,true]); assert.equal(s.published.length,1);
  assert.equal((s.published[0] as {source_kind:string}).source_kind,"ui_level_report");
  await app.stop();await app.stop();
  assert.equal(s.counts().publisherStops,1);assert.equal(s.counts().transportStops,1);
  s.callback!.onFrame({} as IplFrame,"session");assert.equal(s.published.length,1);
});

test("stop during broker lookup prevents late publisher or child creation",async()=>{
  const s=setup();let finish!:(value:Broker|null)=>void;
  s.deps.resolveBroker=()=>new Promise(resolve=>{finish=resolve;});
  const app=startApp(s.config,{cert:"c",key:"k",ca:"a"},s.deps);
  await app.stop();finish({url:"mqtt://broker.example"});await app.ready;
  assert.equal(s.counts().transportStarts,0);
});

test("discovery exceptions are redacted and schedule a retry",async()=>{
  const s=setup();s.deps.resolveBroker=async()=>{throw new Error("SECRET");};
  const app=startApp(s.config,{cert:"c",key:"k",ca:"a"},s.deps);await app.ready;
  assert.ok(s.timer);assert.ok(s.logs.length);assert.ok(s.logs.every(log=>!log.includes("SECRET")));
  await app.stop();
});

test("stop closes both resources even if one fails",async()=>{
  const s=setup();s.publisher.stop=async()=>{throw new Error("fixture close failure");};
  const app=startApp(s.config,{cert:"c",key:"k",ca:"a"},s.deps);await app.ready;
  await app.stop();assert.equal(s.counts().transportStops,1);
});
