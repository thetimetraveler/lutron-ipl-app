import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { Duplex } from 'node:stream';
import { MqttClient } from 'mqtt';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import type { AppConfig, LevelEvent, IplFrame } from '../src/contracts.js';
import { createPublisher, type ClientLike, type PublisherOptions } from '../src/mqtt.js';

class FakeClient extends EventEmitter implements ClientLike {
  connected = false;
  stream = { writableLength: 0, destroy: () => { this.destroyed++; this.connected = false; this.emit('close'); } };
  destroyed = 0;
  ended = 0;
  hold = false;
  writes: {topic:string; payload:string; options:{retain?:boolean;qos?:0|1|2}}[] = [];
  subscriptions: string[] = [];
  callbacks: ((error?:Error)=>void)[] = [];
  publish(topic:string,payload:string,options:{retain?:boolean;qos?:0|1|2},callback?:(error?:Error)=>void) {
    this.writes.push({topic,payload,options});
    if (callback) { if (this.hold) this.callbacks.push(callback); else callback(); }
  }
  subscribe(topic:string) { this.subscriptions.push(topic); }
  end(_force?:boolean,callback?:()=>void) { this.ended++; callback?.(); }
  connect() { this.connected=true; this.emit('connect'); }
}

function fixture(t: TestContext, overrides:Partial<AppConfig>={}, options:PublisherOptions={}) {
  const dir=mkdtempSync(join(tmpdir(),'ipl-mqtt-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const config:AppConfig={processor_host:'fixture.invalid',processor_port:51023,credential_dir:'/fixture',client_cert:'cert',client_key:'key',ca_cert:'ca',expected_server_name:'',expected_server_ip:'',mqtt_url:'mqtt://fixture.invalid',mqtt_username:'',mqtt_password:'',instance_id:'fixture',base_topic:'test/ipl',discovery_prefix:'homeassistant',ha_birth_topic:'homeassistant/status',publish_debug:false,mappings:[{id:'wall',name:'Wall',device_id:5,ui_object_id:10}],data_dir:dir,...overrides};
  const client=new FakeClient(); let connectOptions:any; const logs:string[]=[];
  const publisher=createPublisher(config,{url:config.mqtt_url},line=>logs.push(line), {...options,clientFactory:(_url,opts)=>{connectOptions=opts;return client;}});
  t.after(()=>publisher.stop());
  return {config,client,publisher,logs,get connectOptions(){return connectOptions;}};
}
const event:LevelEvent={event_type:'level_adjustment',source_kind:'ui_level_report',device_id:5,ui_object_id:10,level:33,wire_value:3300,received_at:'2026-10-04T00:00:00Z',session_id:'session-one'};
const frame:IplFrame={version:1,msgType:5,receiverProcessing:'00',attempt:'00',systemId:1,senderId:2,receiverId:3,messageId:4,body:Buffer.from('abcd','hex')};

test('eager discovery, clean QoS0 session, retained last will, independent IPL health availability',t=>{
  const f=fixture(t); assert.equal(f.connectOptions.clean,true); assert.equal(f.connectOptions.queueQoSZero,false);
  assert.equal(f.connectOptions.will.payload,'offline'); assert.equal(f.connectOptions.will.retain,true);
  f.client.connect();
  const discovery=f.client.writes.filter(w=>w.topic.endsWith('/config'));
  assert.equal(discovery.length,2); assert.ok(discovery.every(w=>w.options.retain && w.options.qos===0));
  const ui=JSON.parse(discovery.find(w=>w.topic.includes('/event/'))!.payload);
  const health=JSON.parse(discovery.find(w=>w.topic.includes('/binary_sensor/'))!.payload);
  assert.deepEqual(ui.event_types,['level_adjustment']); assert.equal(ui.name,'Wall (experimental)'); assert.equal(ui.availability_mode,'all'); assert.equal(ui.availability.length,2);
  assert.equal(health.availability_topic,f.connectOptions.will.topic); assert.ok(!health.availability);
  assert.ok(f.client.writes.some(w=>w.topic===health.state_topic && w.payload==='offline' && w.options.retain));
  f.publisher.setIplHealth(true); assert.equal(f.client.writes.at(-1)!.payload,'online');
});
test('observations never retain or replay across birth or reconnect, including repeated levels',t=>{
  const f=fixture(t); assert.equal(f.publisher.publishLevel('wall',event),false); f.client.connect();
  assert.equal(f.publisher.publishLevel('wall',event),true); assert.equal(f.publisher.publishLevel('wall',event),true);
  const observations=f.client.writes.filter(w=>w.topic.endsWith('/event')); assert.equal(observations.length,2);
  assert.deepEqual(observations[0].options,{retain:false,qos:0}); assert.deepEqual(JSON.parse(observations[0].payload),event);
  f.client.connected=false; f.client.emit('close'); assert.equal(f.publisher.publishLevel('wall',event),false);
  f.client.connect(); f.client.emit('message',f.config.ha_birth_topic,Buffer.from('online'));
  assert.equal(f.client.writes.filter(w=>w.topic.endsWith('/event')).length,2); assert.equal(f.client.subscriptions.length,2);
  assert.equal(f.publisher.publishLevel('unknown',event),false);
});
test('renames preserve identities; removed mappings clear only owned retained discovery',t=>{
  const first=fixture(t); first.client.connect();
  const original=first.client.writes.find(w=>w.topic.includes('/event/') && w.topic.endsWith('/config'))!;
  const second=fixture(t,{data_dir:first.config.data_dir,mappings:[{...first.config.mappings[0],name:'Renamed'}]}); second.client.connect();
  const renamed=second.client.writes.find(w=>w.topic===original.topic)!; assert.equal(JSON.parse(original.payload).unique_id,JSON.parse(renamed.payload).unique_id); assert.equal(JSON.parse(renamed.payload).name,'Renamed (experimental)');
  const third=fixture(t,{data_dir:first.config.data_dir,mappings:[]}); third.client.connect();
  assert.deepEqual(third.client.writes.filter(w=>w.payload===''),[{topic:original.topic,payload:'',options:{retain:true,qos:0}}]);
});
test('untrusted and corrupt inventory never delete unrelated topics',t=>{
  const f=fixture(t); f.client.connect();
  const inventory=join(f.config.data_dir,readdirSync(f.config.data_dir)[0]); const stored=JSON.parse(readFileSync(inventory,'utf8'));
  stored.topics.push('homeassistant/light/some_other_app/config'); writeFileSync(inventory,JSON.stringify(stored));
  const next=fixture(t,{data_dir:f.config.data_dir,mappings:[]}); next.client.connect(); assert.ok(next.client.writes.every(w=>w.payload!==''));
  writeFileSync(inventory,'{broken'); const corrupt=fixture(t,{data_dir:f.config.data_dir,mappings:[]}); corrupt.client.connect(); assert.ok(corrupt.client.writes.every(w=>w.payload!==''));
});
test('instance and namespace produce distinct event identity',t=>{
  const a=fixture(t), b=fixture(t,{instance_id:'second'}), c=fixture(t,{base_topic:'other/ipl'});
  for (const f of [a,b,c]) f.client.connect();
  assert.equal(new Set([a,b,c].map(f=>JSON.parse(f.client.writes.find(w=>w.topic.includes('/event/'))!.payload).unique_id)).size,3);
});
test('bounded in-flight writes and socket buffer drop without caching',t=>{
  const f=fixture(t,{}, {maxInflight:2,maxBufferedBytes:1024}); f.client.connect(); f.client.hold=true;
  assert.equal(f.publisher.publishLevel('wall',event),true); assert.equal(f.publisher.publishLevel('wall',event),true); assert.equal(f.publisher.publishLevel('wall',event),false);
  f.client.callbacks.shift()!(); f.client.stream.writableLength=1025; assert.equal(f.publisher.publishLevel('wall',event),false);
  f.client.stream.writableLength=0; f.client.connected=false; f.client.emit('close'); f.client.hold=false; f.client.connect();
  assert.equal(f.client.writes.filter(w=>w.topic.endsWith('/event')).length,2);
  assert.equal(f.publisher.diagnostics().droppedLevels,2);
});
test('slow write deadline resets socket and never replays pending observations',async t=>{
  const f=fixture(t,{}, {writeTimeoutMs:10}); f.client.connect(); f.client.hold=true;
  assert.equal(f.publisher.publishLevel('wall',event),true); await new Promise(r=>setTimeout(r,25));
  assert.equal(f.client.destroyed,1); assert.equal(f.publisher.publishLevel('wall',event),false);
  f.client.hold=false; f.client.connect(); f.client.callbacks.forEach(cb=>cb());
  assert.equal(f.client.writes.filter(w=>w.topic.endsWith('/event')).length,1); assert.equal(f.publisher.diagnostics().writeTimeouts,1);
});
test('debug is disabled by default, unretained, timestamped and rate bounded',t=>{
  const off=fixture(t); off.client.connect(); assert.equal(off.publisher.publishDebug(frame,'one'),false);
  let now=1_000; const on=fixture(t,{publish_debug:true},{now:()=>now,debugPerSecond:2}); on.client.connect();
  assert.equal(on.publisher.publishDebug(frame,'two'),true); assert.equal(on.publisher.publishDebug(frame,'two'),true); assert.equal(on.publisher.publishDebug(frame,'two'),false);
  const write=on.client.writes.find(w=>w.topic.endsWith('/debug'))!; assert.deepEqual(write.options,{retain:false,qos:0});
  const payload=JSON.parse(write.payload); assert.equal(payload.raw_body_hex,'abcd'); assert.equal(payload.session_id,'two'); assert.equal(payload.received_at,new Date(now).toISOString()); assert.equal(payload.senderId,2);
  now+=1000; assert.equal(on.publisher.publishDebug(frame,'two'),true);
});
test('publish errors log categories without arbitrary credential-bearing messages; bounded stop',async t=>{
  const f=fixture(t,{}, {stopTimeoutMs:10}); f.client.connect(); f.client.emit('error',new Error('secret-token'));
  await f.publisher.stop(); assert.equal(f.client.writes.at(-1)!.payload,'offline'); assert.equal(f.publisher.publishLevel('wall',event),false); assert.equal(f.client.ended,1);
  assert.ok(f.logs.some(line=>line.includes('connection error'))); assert.ok(f.logs.every(line=>!line.includes('secret-token')));
});
test('oversized debug and adjacent write-buffer growth are dropped before send',t=>{
  const f=fixture(t,{publish_debug:true},{maxBufferedBytes:1024}); f.client.connect();
  assert.equal(f.publisher.publishDebug({...frame,body:Buffer.alloc(1024)},'one'),false);
  f.client.stream.writableLength=900;
  assert.equal(f.publisher.publishLevel('wall',event),false);
  assert.equal(f.client.writes.filter(w=>w.topic.endsWith('/debug') || w.topic.endsWith('/event')).length,0);
});
test('hung graceful shutdown force-closes once at the configured bound',async t=>{
  const f=fixture(t,{}, {stopTimeoutMs:10}); f.client.connect();
  f.client.end=()=>{f.client.ended++;};
  const first=f.publisher.stop(); assert.equal(f.publisher.stop(),first); await first;
  assert.equal(f.client.ended,1); assert.equal(f.client.destroyed,1); assert.equal(f.publisher.publishLevel('wall',event),false);
});
test('inventory survives interrupted removal until a reconnect can finish cleanup',t=>{
  const first=fixture(t); first.client.connect();
  const topic=first.client.writes.find(w=>w.topic.includes('/event/') && w.topic.endsWith('/config'))!.topic;
  const second=fixture(t,{data_dir:first.config.data_dir,mappings:[]}); second.client.hold=true; second.client.connect();
  second.client.connected=false; second.client.emit('close');
  const third=fixture(t,{data_dir:first.config.data_dir,mappings:[]}); third.client.connect();
  assert.ok(third.client.writes.some(w=>w.topic===topic && w.payload===''));
});
test('retained discovery waits for transient write-buffer space and health uses current state',async t=>{
  const f=fixture(t,{}, {maxBufferedBytes:1024}); f.client.stream.writableLength=900; f.client.connect();
  assert.equal(f.client.writes.length,0); f.publisher.setIplHealth(true);
  f.client.stream.writableLength=0; await new Promise(r=>setTimeout(r,35));
  assert.equal(f.client.writes.filter(w=>w.topic.endsWith('/config')).length,2);
  assert.equal(f.client.writes.at(-1)!.payload,'online');
});
test('synchronous publication failures return false and expose safe diagnostic counters',t=>{
  const f=fixture(t); f.client.connect(); f.client.publish=()=>{throw Error('secret');};
  assert.equal(f.publisher.publishLevel('wall',event),false); assert.equal(f.publisher.diagnostics().publishErrors,1); assert.equal(f.publisher.diagnostics().droppedLevels,1);
});
test('shutdown deadline destroys a real MQTT.js stalled Duplex and cancels reconnect',async t=>{
  const f=fixture(t);
  const stream=new Duplex({writableHighWaterMark:1,read(){},write(_chunk,_encoding,_callback){ /* Deliberately never completes. */ }});
  let client:MqttClient|undefined;
  const publisher=createPublisher(f.config,{url:'mqtt://synthetic.invalid'},()=>{}, {
    stopTimeoutMs:10,
    clientFactory:(_url,options)=>{
      client=new MqttClient(()=>stream,{...options,keepalive:0}); return client;
    },
  });
  t.after(()=>stream.destroy());
  const connected=new Promise<void>((resolve,reject)=>{client!.once('connect',()=>resolve());client!.once('error',reject);});
  stream.push(Buffer.from([0x20,0x02,0x00,0x00])); // Synthetic CONNACK, with no broker or network.
  await connected;
  const closed=once(stream,'close');
  const stopping=publisher.stop(); assert.equal(publisher.stop(),stopping); await stopping;
  assert.equal(stream.destroyed,true); await closed;
  assert.equal(publisher.publishLevel('wall',event),false);
  assert.equal(Reflect.get(client!,'reconnectTimer') == null,true);
  assert.equal(client!.options.reconnectPeriod,0);
});
for (const mode of ['silent-close','stalled-destroy'] as const) {
  test(`real MQTT.js shutdown remains finite with ${mode}`,async t=>{
    const f=fixture(t);
    const stream=new Duplex({
      writableHighWaterMark:1,emitClose:mode!=='silent-close',read(){},write(_chunk,_encoding,_callback){},
      ...(mode==='stalled-destroy' ? {destroy(_error:Error|null,_callback:(error:Error|null)=>void){}} : {}),
    });
    let client:MqttClient|undefined;
    const logs:string[]=[];
    const publisher=createPublisher(f.config,{url:'mqtt://synthetic.invalid'},line=>logs.push(line), {
      stopTimeoutMs:10,
      clientFactory:(_url,options)=>{client=new MqttClient(()=>stream,{...options,keepalive:0});return client;},
    });
    const connected=new Promise<void>(resolve=>client!.once('connect',()=>resolve()));
    stream.push(Buffer.from([0x20,0x02,0x00,0x00])); await connected;
    const listeners=stream.listenerCount('close');
    const stopped=publisher.stop();
    let guardTimer:ReturnType<typeof setTimeout>|undefined;
    const outcome=await Promise.race([stopped.then(()=>true),new Promise<false>(resolve=>{guardTimer=setTimeout(()=>resolve(false),350);})]);
    if (guardTimer) clearTimeout(guardTimer);
    assert.equal(outcome,true,mode); assert.equal(stream.destroyed,true,mode);
    assert.equal(stream.listenerCount('close'),listeners,mode);
    assert.ok(logs.includes('[mqtt] shutdown stream close timed out'),mode);
    assert.equal(publisher.publishLevel('wall',event),false,mode);
  });
}
