import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExplorer, startExplorerApp } from '../src/explorer.js';
import type { AppConfig, LevelEvent, ObservationEvent } from '../src/contracts.js';
const config = {mappings:[{id:'wall',name:'Manual wall',device_id:5,ui_object_id:10}],base_topic:'test/ipl',instance_id:'fixture',credential_dir:'/nonexistent',metadata_file:'',name_overrides:[]} as unknown as AppConfig;
const level:LevelEvent={event_type:'level_adjustment',source_kind:'ui_level_report',device_id:5,ui_object_id:10,level:33,wire_value:3300,received_at:'2026-10-04T00:00:00Z',session_id:'one'};
const report:ObservationEvent={system_id:1,object_type:57,object_id:20,event_type:'button_press_report',source_kind:'ipl_event_report',operation_id:0,received_at:level.received_at,session_id:'one'};
test('bounded duplicate-preserving display history, cursors, clone isolation and reset',()=>{
 const explorer=createExplorer(config,{historyLimit:3}); explorer.report('manual:wall',level,false); explorer.report('manual:wall',level,true);
 explorer.report('manual:wall',level,true); explorer.report('manual:wall',level,false);
 const initial=explorer.snapshot(); assert.equal(initial.events.length,3);assert.equal(initial.oldest_sequence,2);assert.equal(initial.last_sequence,4);assert.equal(initial.history_limit,3);
 assert.equal(explorer.snapshot(1).history_truncated,false);assert.equal(explorer.snapshot(0).history_truncated,true);assert.deepEqual(explorer.snapshot(3).events.map(e=>e.sequence),[4]);assert.equal(explorer.snapshot(100).history_truncated,true);
 initial.events[0].payload.session_id='mutated';assert.equal(explorer.snapshot().events[0].payload.session_id,'one');
 assert.notEqual(createExplorer(config).snapshot().instance,initial.instance);explorer.stop();explorer.report('manual:wall',level,true);assert.equal(explorer.snapshot().last_sequence,4);
});
test('private metadata joins only exact admitted identities and override keeps structured room',t=>{
 const dir=mkdtempSync(join(tmpdir(),'explorer-name-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 writeFileSync(join(dir,'names.json'),JSON.stringify({version:1,objects:[{system_id:1,object_type:57,object_id:20,name:'Imported button',area_name:'Example room'},{system_id:1,object_type:9,object_id:10,name:'Imported UI',area_name:'Example room'},{system_id:1,object_type:57,object_id:21,name:'Silent metadata'}]}));
 const explorer=createExplorer({...config,credential_dir:dir,metadata_file:'names.json',name_overrides:[{system_id:1,object_type:57,object_id:20,name:'Exact override'}]});
 assert.equal(explorer.snapshot().objects.length,1);assert.equal(explorer.snapshot().objects[0].room,null);assert.equal(explorer.snapshot().objects[0].system_id,null);
 explorer.registerAuto({system_id:1,object_type:57,object_id:20}); explorer.registerAuto({system_id:2,object_type:57,object_id:20}); explorer.registerAuto({system_id:1,object_type:999,object_id:30});
 const objects=explorer.snapshot().objects;assert.equal(objects.length,3);assert.equal(objects[1].name,'Exact override');assert.equal(objects[1].room,'Example room');assert.equal(objects[1].named,true);assert.equal(objects[2].room,null);assert.equal(objects[2].named,false);
 explorer.setManualSystem('wall',1);assert.equal(explorer.snapshot().objects[0].name,'Manual wall');assert.equal(explorer.snapshot().objects[0].room,'Example room');
 explorer.setManualSystem('wall',2);assert.equal(explorer.snapshot().objects[0].system_id,null);assert.equal(explorer.snapshot().objects[0].room,null);
});
test('only supported registered reports enter display; payloads and diagnostics expose no extras',()=>{
 const explorer=createExplorer(config);explorer.report('auto_s1_t57_o20',report,false);assert.equal(explorer.snapshot().events.length,0);
 explorer.registerAuto({system_id:1,object_type:57,object_id:20});explorer.report('auto_s1_t57_o20',{...report,password:'secret'} as ObservationEvent,false);
 explorer.setDiagnostics({droppedLevels:2,password:'secret',NaN:NaN} as any);const snapshot=explorer.snapshot();assert.equal(snapshot.events.length,1);assert.equal(JSON.stringify(snapshot).includes('secret'),false);assert.deepEqual(snapshot.diagnostics,{droppedLevels:2});
 explorer.report('auto_s1_t57_o20',{...report,event_type:'unsupported'},true);assert.equal(explorer.snapshot().events.length,1);
 explorer.setHealth('ipl',true);explorer.setHealth('mqtt',true);assert.equal(explorer.snapshot().health.ipl,true);assert.equal(explorer.snapshot().health.mqtt,true);assert.equal(snapshot.events[0].mqtt_accepted,false);
});

test('web bind precedes broker lookup and stopped offline app closes its server/observer',async()=>{
 const order:string[]=[];let stopped=0;let resolveBroker:(value:null)=>void=()=>{};
 const app=await startExplorerApp(config,{cert:'synthetic',key:'synthetic',ca:'synthetic'},{
  startServer:async explorer=>{order.push('server');assert.equal(explorer.snapshot().objects.length,1);return {stop:async()=>{stopped++;}};},
  resolveBroker:async()=>{order.push('broker');return new Promise<null>(resolve=>resolveBroker=resolve);},
  createPublisher:()=>{throw Error('unexpected');},startTransport:()=>{throw Error('unexpected');},levelEvent:()=>null,log:()=>{},
 });assert.deepEqual(order,['server','broker']);await app.stop();resolveBroker(null);await app.ready;assert.equal(stopped,1);assert.equal(app.explorer.snapshot().health.ipl,false);
 let lookups=0;await assert.rejects(startExplorerApp(config,{cert:'x',key:'x',ca:'x'},{startServer:async()=>{throw Error('bind failed');},resolveBroker:async()=>{lookups++;return null;},createPublisher:()=>{throw Error('unexpected');},startTransport:()=>{throw Error('unexpected');},levelEvent:()=>null,log:()=>{}}),/bind/);assert.equal(lookups,0);
});

test('object registry remains bounded independently of unlimited metadata or caller admissions',()=>{
 const explorer=createExplorer(config);
 for(let i=1;i<=300;i++)explorer.registerAuto({system_id:1,object_type:57,object_id:i});
 assert.equal(explorer.snapshot().objects.length,257);assert.equal(explorer.snapshot().events.length,0);assert.equal(explorer.snapshot().history_limit,1000);
 assert.throws(()=>explorer.snapshot(-1),/cursor/);assert.throws(()=>explorer.snapshot(Number.MAX_SAFE_INTEGER+1),/cursor/);assert.throws(()=>createExplorer(config,{historyLimit:1001}),/limit/);
});
