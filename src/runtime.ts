import type { AppConfig, Broker, IplFrame, LevelEvent, ObservationEvent, Publisher, TransportOptions, UiMapping } from "./contracts.js";

export interface RuntimeDependencies {
  resolveBroker(config:AppConfig):Promise<Broker|null>;
  createPublisher(config:AppConfig,broker:Broker,log?:(message:string)=>void):Publisher;
  startTransport(options:TransportOptions):{stop():Promise<void>};
  levelEvent(frame:IplFrame,mappings:UiMapping[],sessionId:string):{mappingId:string;event:LevelEvent}|null;
  decodeObservation?(frame:IplFrame,sessionId:string):ObservationEvent|null;
  log(message:string):void;
  setTimer?(callback:()=>void,delay:number):unknown;
  clearTimer?(timer:unknown):void;
}

export function startApp(config:AppConfig, credentials:{cert:string;key:string;ca:string}, deps:RuntimeDependencies):{
  ready:Promise<void>;stop():Promise<void>;
} {
  const setTimer=deps.setTimer??((callback,delay)=>setTimeout(callback,delay));
  const clearTimer=deps.clearTimer??(timer=>clearTimeout(timer as NodeJS.Timeout));
  let stopped=false, timer:unknown, publisher:Publisher|undefined, transport:{stop():Promise<void>}|undefined;
  let stopPromise:Promise<void>|undefined;
  const retry=()=>{
    if(stopped) return;
    timer=setTimer(()=>{timer=undefined;void connect();},30000);
  };
  async function connect():Promise<void> {
    let broker:Broker|null;
    try { broker=await deps.resolveBroker(config); }
    catch { if(!stopped){deps.log("MQTT service lookup failed; retrying in 30 seconds");retry();} return; }
    if(stopped) return;
    if(!broker){deps.log("No MQTT service available; offline, retrying in 30 seconds");retry();return;}
    try {
      publisher=deps.createPublisher(config,broker,deps.log);
      publisher.setIplHealth(false);
      transport=deps.startTransport({host:config.processor_host,port:config.processor_port,...credentials,
        expectedName:config.expected_server_name||undefined, expectedIp:config.expected_server_ip||undefined,
        log:deps.log,onHealth:healthy=>{if(!stopped) publisher?.setIplHealth(healthy);},
        onFrame:(frame,sessionId)=>{
          if(stopped||!publisher) return;
          const event=deps.levelEvent(frame,config.mappings,sessionId);
          if(event) publisher.publishLevel(event.mappingId,event.event);
          if(config.auto_discover && deps.decodeObservation && publisher.publishObservation) {
            const observation=deps.decodeObservation(frame,sessionId);
            if(observation) publisher.publishObservation(observation);
          }
          if(config.publish_debug) publisher.publishDebug(frame,sessionId);
        }});
      deps.log("IPL observer started; UI reports are experimental telemetry");
    } catch {
      deps.log("Unable to start observer resources; retrying in 30 seconds");
      await Promise.allSettled([transport?.stop(),publisher?.stop()].filter((job):job is Promise<void>=>!!job));
      transport=undefined;publisher=undefined;retry();
    }
  }
  const ready=connect();
  return {ready,stop(){
    if(stopPromise) return stopPromise;
    stopped=true;if(timer!==undefined){clearTimer(timer);timer=undefined;}
    stopPromise=Promise.allSettled([transport?.stop(),publisher?.stop()].filter((job):job is Promise<void>=>!!job)).then(()=>{});
    return stopPromise;
  }};
}
