import { randomUUID } from 'node:crypto';
import type { AppConfig, Broker, Publisher, LevelEvent, ObservationEvent, ObservedObject } from './contracts.js';
import type { ExplorerCategory, ExplorerEvent, ExplorerObject, ExplorerSnapshot } from './explorer-types.js';
import { createNameSnapshot, type NameSnapshot } from './naming.js';
import { describeObject } from './observations.js';
import {startApp, type RuntimeDependencies} from './runtime.js';

const DIAGNOSTICS = new Set(['droppedLevels','droppedDebug','droppedObservations','writeTimeouts','publishErrors']);
function category(type:string):ExplorerCategory {
  if(type==='occupancy_report')return 'occupancy';
  if(type==='scene_selection_report'||type==='area_lighting_report')return 'scenes';
  if(type==='shade_level_report')return 'shades';
  if(type==='level_adjustment'||type==='ui_level_report'||type.startsWith('button_'))return 'controls';
  return 'loads';
}
/** Copy only the decoded public fields, never accidental config/errors/raw frames. */
function cleanPayload(input:LevelEvent|ObservationEvent):LevelEvent|ObservationEvent|null {
  if(!['ui_level_report','ipl_event_report','runtime_property_report','ipl_command_observation'].includes(input.source_kind))return null;
  if(input.event_type==='level_adjustment'&&(!('device_id' in input)||!('ui_object_id' in input)||input.source_kind!=='ui_level_report'))return null;
  if('level' in input&&(typeof input.level!=='number'||input.level<0||input.level>100))return null;
  if('wire_value' in input&&(typeof input.wire_value!=='number'||input.wire_value<0||input.wire_value>0xfeff))return null;
  if(typeof input.received_at!=='string'||input.received_at.length>40||!Number.isFinite(Date.parse(input.received_at))||typeof input.session_id!=='string'||input.session_id.length>128)return null;
  const result:Record<string,unknown>={event_type:input.event_type,source_kind:input.source_kind,received_at:input.received_at,session_id:input.session_id};
  const numeric=['device_id','ui_object_id','system_id','object_type','object_id','operation_id','property_number','level','wire_value','status','selection','state','originator_feature','fade_quarters','delay_quarters'];
  for(const field of numeric)if(field in input) {
    const value=(input as unknown as Record<string,unknown>)[field];if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)return null;result[field]=value;
  }
  if('status_name' in input && ['unknown','occupied','unoccupied','disabled'].includes(input.status_name!))result.status_name=input.status_name;
  if('trailing_hex' in input && typeof input.trailing_hex==='string'&&/^[a-f0-9]{0,4}$/.test(input.trailing_hex))result.trailing_hex=input.trailing_hex;
  return result as unknown as LevelEvent|ObservationEvent;
}
export interface Explorer {
  readonly names:NameSnapshot;
  registerAuto(object:ObservedObject):void;
  setManualSystem(mappingId:string,systemId:number):void;
  report(key:string,payload:LevelEvent|ObservationEvent,mqttAccepted:boolean):void;
  setHealth(kind:'mqtt'|'ipl',value:boolean):void;
  setSession(sessionId:string):void;
  setDiagnostics(values:Record<string,number>):void;
  snapshot(after?:number):ExplorerSnapshot;
  stop():void;
}
export function createExplorer(config:AppConfig,options:{historyLimit?:number;names?:NameSnapshot;log?:(message:string)=>void}={}):Explorer {
  const historyLimit=options.historyLimit??1000;
  if(!Number.isSafeInteger(historyLimit)||historyLimit<1||historyLimit>1000)throw Error('Invalid explorer history limit');
  const names=options.names??createNameSnapshot(config,options.log);
  const objects=new Map<string,ExplorerObject>(), manualSystems=new Map<string,Set<number>>();
  for(const mapping of config.mappings.slice(0,256))objects.set(`manual:${mapping.id}`,{
    key:`manual:${mapping.id}`,name:mapping.name,room:null,named:true,system_id:null,object_type:9,object_id:mapping.ui_object_id,device_id:mapping.device_id,
    event_types:['level_adjustment'],categories:['controls'],mqtt_topic:`${config.base_topic}/${config.instance_id}/${mapping.id}/event`,
  });
  const instance=randomUUID(),startedAt=new Date().toISOString(),events:ExplorerEvent[]=[];
  const health:ExplorerSnapshot['health']={ipl:false,mqtt:false,session_id:null};
  let diagnostics:Record<string,number>={},sequence=0,stopped=false,autoCount=0;
  return {
    names,
    registerAuto(object) {
      if(stopped)return;const descriptor=describeObject(object);if(!descriptor||objects.has(descriptor.id)||autoCount>=256)return;
      const resolved=names.resolve(object);objects.set(descriptor.id,{key:descriptor.id,...resolved,...object,event_types:descriptor.eventTypes,
        categories:[...new Set(descriptor.eventTypes.map(category))],mqtt_topic:`${config.base_topic}/${config.instance_id}/auto/${descriptor.id}/event`});autoCount++;
    },
    setManualSystem(id,system) {
      if(stopped||!Number.isInteger(system)||system<0||system>65535)return;const object=objects.get(`manual:${id}`);if(!object)return;
      let systems=manualSystems.get(id);if(!systems){systems=new Set();manualSystems.set(id,systems);}
      // Two different verified systems are enough to prove ambiguity; bound this set.
      if(systems.size<2)systems.add(system);
      object.system_id=systems.size===1?[...systems][0]:null;
      object.room=object.system_id===null?null:names.resolve({system_id:object.system_id,object_type:9,object_id:object.object_id}).room;
    },
    report(key,input,mqttAccepted) {
      if(stopped||sequence===Number.MAX_SAFE_INTEGER)return;const object=objects.get(key);if(!object||!object.event_types.includes(input.event_type))return;
      if('system_id' in input && (input.system_id!==object.system_id||input.object_type!==object.object_type||input.object_id!==object.object_id))return;
      if(input.event_type==='level_adjustment'&&('ui_object_id' in input)&&(input.ui_object_id!==object.object_id||input.device_id!==object.device_id))return;
      const payload=cleanPayload(input);if(!payload)return;
      const event:ExplorerEvent={sequence:++sequence,object_key:key,category:category(payload.event_type),payload,mqtt_accepted:mqttAccepted===true};
      events.push(event);if(events.length>historyLimit)events.shift();object.latest=event;health.session_id=payload.session_id;
    },
    setHealth(kind,value){if(!stopped)health[kind]=value===true;},
    setSession(session){if(!stopped&&typeof session==='string'&&session.length<=128)health.session_id=session;},
    setDiagnostics(values){if(stopped)return;diagnostics={};for(const [key,value] of Object.entries(values))if(DIAGNOSTICS.has(key)&&Number.isSafeInteger(value)&&value>=0)diagnostics[key]=value;},
    snapshot(after) {
      if(after!==undefined&&(!Number.isSafeInteger(after)||after<0))throw Error('Invalid explorer cursor');
      const oldest=events[0]?.sequence??0;
      return structuredClone({version:1,app_version:'0.4.0',instance,started_at:startedAt,oldest_sequence:oldest,last_sequence:sequence,history_limit:historyLimit,
        history_truncated:after!==undefined&&(after>sequence||(oldest>0&&after<oldest-1)),health,diagnostics,objects:[...objects.values()],events:after===undefined||after>sequence?events:events.filter(event=>event.sequence>after)});
    },
    stop(){stopped=true;health.ipl=false;health.mqtt=false;},
  };
}

/** Bind first so Supervisor can open the explorer while broker discovery retries. */
export async function startExplorerApp(config:AppConfig,credentials:{cert:string;key:string;ca:string},deps:Omit<RuntimeDependencies,'createPublisher'>&{
  startServer(explorer:Explorer):Promise<{stop():Promise<void>}>;
  createPublisher(config:AppConfig,broker:Broker,log:((message:string)=>void)|undefined,explorer:Explorer):Publisher;
}):Promise<{ready:Promise<void>;stop():Promise<void>;explorer:Explorer}> {
  const explorer=createExplorer(config,{log:deps.log});
  let server:{stop():Promise<void>};
  try {server=await deps.startServer(explorer);} catch(error){explorer.stop();throw error;}
  const display=(run:()=>void)=>{try {run();} catch {/* Display cannot interrupt observation. */}};
  let app:ReturnType<typeof startApp>;
  try {
    app=startApp(config,credentials,{...deps,
      createPublisher:(configuration,broker,log)=>deps.createPublisher(configuration,broker,log,explorer),
      levelEvent:(frame,mappings,session)=>{
        const result=deps.levelEvent(frame,mappings,session);
        if(result)display(()=>explorer.setManualSystem(result.mappingId,frame.systemId));return result;
      },
      startTransport:options=>deps.startTransport({...options,
        onHealth:healthy=>{display(()=>explorer.setHealth('ipl',healthy));options.onHealth(healthy);},
        onFrame:(frame,session)=>{display(()=>explorer.setSession(session));options.onFrame(frame,session);},
      }),
    });
  } catch(error){explorer.stop();await server.stop();throw error;}
  let stopPromise:Promise<void>|undefined;
  return {ready:app.ready,explorer,stop(){
    if(stopPromise)return stopPromise;
    explorer.stop();stopPromise=Promise.allSettled([app.stop(),server.stop()]).then(()=>{});return stopPromise;
  }};
}
