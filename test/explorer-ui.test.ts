import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import YAML from 'yaml';
import { EXPLORER_HTML, EXPLORER_JS, EXPLORER_CSS } from '../src/explorer-ui.js';
import type { ExplorerSnapshot, ExplorerEvent, ExplorerObject } from '../src/explorer-types.js';

function client() {
  const context = vm.createContext({URLSearchParams, Date, JSON, Map, Set, console});
  new vm.Script(EXPLORER_JS + '\n;globalThis.api = {ExplorerModel, automationYaml, reportLabel, reportValue, semantic, matches, UNASSIGNED};').runInContext(context);
  return context.api;
}
const object: ExplorerObject = {key:'synthetic',name:'Example control',room:'Example room',named:true,system_id:1,object_type:9,object_id:10,event_types:['ui_level_report'],categories:['controls'],mqtt_topic:'example/auto/control/event'};
function event(sequence:number, session='one', level=30):ExplorerEvent {return {sequence,object_key:object.key,category:'controls',mqtt_accepted:true,payload:{system_id:1,object_type:9,object_id:10,event_type:'ui_level_report',source_kind:'runtime_property_report',operation_id:1,property_number:1,level,wire_value:3000,received_at:new Date(sequence*1000).toISOString(),session_id:session}};}
function snapshot(events:ExplorerEvent[], options:Partial<ExplorerSnapshot>={}):ExplorerSnapshot {return {version:1,app_version:'0.4.0',instance:'synthetic-instance',started_at:'2026-01-01T00:00:00Z',oldest_sequence:1,last_sequence:events.at(-1)?.sequence??0,history_limit:3,history_truncated:false,health:{ipl:true,mqtt:true,session_id:'one'},diagnostics:{},objects:[object],events,...options};}

test('assets are local and generated client is syntactically valid',()=>{
  new vm.Script(EXPLORER_JS);
  assert.match(EXPLORER_HTML,/src="\.\/app.js"/); assert.match(EXPLORER_HTML,/href="\.\/style.css"/);
  assert.doesNotMatch(EXPLORER_HTML+EXPLORER_CSS,/https?:\/\//);
  assert.doesNotMatch(EXPLORER_JS,/innerHTML|insertAdjacentHTML|eval\(/);
  assert.match(EXPLORER_CSS,/prefers-reduced-motion/);
});
test('sequence cursor deduplicates transport responses while preserving repeated raw reports and history cap',()=>{
  const {ExplorerModel}=client(); const model=new ExplorerModel();
  model.absorb(snapshot([event(1),event(2)])); model.absorb(snapshot([event(2),event(3),event(4)]));
  assert.deepEqual(Array.from(model.events,(e:any)=>e.sequence),[2,3,4]); assert.equal(model.cursor,4);
  assert.equal(model.events[0].changed,false);
});
test('changes only ignores timestamp noise and sees a new session as new context',()=>{
  const {ExplorerModel}=client(); const model=new ExplorerModel();
  model.absorb(snapshot([event(1),event(2),event(3,'two')]));
  assert.deepEqual(Array.from(model.events,(e:any)=>e.changed),[true,false,true]);
  assert.equal(model.events[2].boundary,true);
});
test('pause freezes all displayed metadata and history while collection continues',()=>{
  const {ExplorerModel}=client(); const model=new ExplorerModel(); model.absorb(snapshot([event(1)])); model.pause();
  const before=model.display(); model.absorb(snapshot([event(2)],{objects:[{...object,name:'Renamed'}],health:{ipl:false,mqtt:false,session_id:null}}));
  assert.equal(model.display(),before); assert.deepEqual(Array.from(model.display().events,(e:any)=>e.sequence),[1]); assert.equal(model.cursor,2); assert.equal(model.display().objects[0].name,'Example control');
  model.resume(); assert.equal(model.display().events.length,2); assert.equal(model.display().objects[0].name,'Renamed');
});
test('instance resets and truncated cursors recover without mixing history',()=>{
  const {ExplorerModel}=client(); const model=new ExplorerModel(); model.absorb(snapshot([event(1),event(2)]));
  model.absorb(snapshot([event(8)],{oldest_sequence:8,history_truncated:true}));
  assert.deepEqual(Array.from(model.events,(e:any)=>e.sequence),[8]); assert.match(model.notice,/gap/i);
  model.absorb(snapshot([event(1,'new')],{instance:'new-instance'}));
  assert.deepEqual(Array.from(model.events,(e:any)=>e.sequence),[1]); assert.equal(model.cursor,1); assert.match(model.notice,/restart/i);
});
test('objects without recent reports remain filterable and exact rooms are never inferred',()=>{
  const {ExplorerModel,matches,UNASSIGNED}=client(); const model=new ExplorerModel(); model.absorb(snapshot([],{objects:[{...object,room:null}]}));
  assert.equal(model.display().objects.length,1);
  const filter={room:UNASSIGNED,query:'example',categories:new Set(['controls']),unnamed:false};
  assert.equal(matches(model.objects[0],null,filter),true); assert.equal(matches(object,null,filter),false);
  assert.equal(matches({...object,room:'__unassigned'},null,{...filter,room:'__unassigned'}),true);
  assert.equal(matches({...object,room:'__unassigned'},null,filter),false);
});
test('MQTT YAML quotes hostile values and matches the exact event_type JSON field with disabled action',()=>{
  const {automationYaml}=client(); const topic='example/"\n- action: dangerous\u2028topic'; const type='ui_report"\nanything';
  const yaml=automationYaml(topic,type); const parsed=YAML.parse(yaml);
  assert.equal(parsed.triggers[0].trigger,'mqtt'); assert.equal(parsed.triggers[0].topic,topic); assert.equal(parsed.triggers[0].payload,type);
  assert.equal(parsed.triggers[0].value_template,'{{ value_json.event_type }}'); assert.deepEqual(parsed.actions,[]); assert.equal(parsed.initial_state,false);
  assert.match(yaml,/placeholder/i); assert.doesNotMatch(yaml,/event_type:\s*ui_report/);
});
test('report copy explains observation limits and numeric scenes without freshness claims',()=>{
  const {reportLabel,reportValue,semantic}=client(); assert.equal(reportLabel('scene_selection_report'),'Scene selection');
  assert.equal(reportValue({event_type:'scene_selection_report',selection:42}),'Selection 42');
  assert.match(semantic('go_to_level_observed'),/execution/i); assert.match(semantic('ui_level_report'),/fresh/i);
});

/** Small offline DOM harness: no browser libraries, networking, or household data. */
class Element {
  tagName:string; id=''; className=''; dataset:Record<string,string>={}; attributes:Record<string,string>={}; children:Element[]=[];
  listeners:Record<string,((event:any)=>unknown)[]>={}; style:Record<string,string>={}; hidden=false; value=''; selected=false; checked=false; disabled=false; selectedText=false; text=''; title=''; tabIndex=0; onchange:((event:any)=>unknown)|null=null;
  constructor(tag:string,readonly owner:DocumentHarness){this.tagName=tag;}
  get childNodes(){return this.children;}
  get textContent():string{return this.text+this.children.map(n=>n.textContent).join('');}
  set textContent(text:string){this.text=String(text);this.children=[];}
  append(...nodes:Element[]){this.children.push(...nodes);}
  replaceChildren(...nodes:Element[]){this.text='';this.children=[...nodes];}
  setAttribute(key:string,value:string){this.attributes[key]=value;}
  addEventListener(name:string,callback:(event:any)=>unknown){(this.listeners[name]??=[]).push(callback);}
  async fire(name:string,values:Record<string,unknown>={}){for(const callback of this.listeners[name]??[])await callback({target:this,preventDefault(){},...values});}
  focus(){this.owner.activeElement=this;}
  select(){this.selectedText=true;}
  classList={toggle:(name:string,enabled:boolean)=>{const classes=new Set(this.className.split(' ').filter(Boolean));enabled?classes.add(name):classes.delete(name);this.className=[...classes].join(' ');}};
}
class DocumentHarness {
  elements:Element[]=[]; roots:Element[]=[]; activeElement:Element|null=null;
  constructor(){for(const match of EXPLORER_HTML.matchAll(/id="([^"]+)"/g)){const element=this.createElement('div');element.id=match[1];this.roots.push(element);}}
  createElement(tag:string){const element=new Element(tag,this);this.elements.push(element);return element;}
  liveElements(){const result=new Set<Element>();const visit=(node:Element)=>{result.add(node);for(const child of node.children)visit(child);};for(const root of this.roots)visit(root);return [...result];}
  getElementById(id:string){return this.liveElements().find(e=>e.id===id)??null;}
  querySelectorAll(){return this.liveElements().filter(e=>e.dataset.focusKey);}
}
function browserHarness(){
  const document=new DocumentHarness();const timers:{callback:()=>unknown,delay:number,active:boolean}[]=[];
  const requests:{url:string,resolve:(value:any)=>void,reject:(error:Error)=>void}[]=[];const pending:typeof requests=[];
  const context=vm.createContext({document,navigator:{},Date,JSON,Map,Set,URLSearchParams,AbortController,console,
    setTimeout(callback:()=>unknown,delay:number){timers.push({callback,delay,active:true});return timers.length-1;},
    clearTimeout(id:number){timers[id].active=false;},
    fetch(url:string){return new Promise((resolve,reject)=>{const request={url,resolve,reject};requests.push(request);pending.push(request);});},
  });
  new vm.Script(EXPLORER_JS).runInContext(context);
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  return {document,requests,pending,timers,flush,
    async respond(s:ExplorerSnapshot){pending.shift()!.resolve({ok:true,json:async()=>s});await flush();},
    async fail(){pending.shift()!.reject(new Error('offline'));await flush();},
    async tick(){const timer=timers.find(t=>t.active&&t.delay!==8000);assert.ok(timer,'poll retry is scheduled');timer.active=false;timer.callback();await flush();return timer.delay;},
    node(id:string){const node=document.getElementById(id);assert.ok(node,id);return node;},
  };
}
test('DOM renders imported markup as literal text and keeps clipboard fallback selected across polls',async()=>{
  const browser=browserHarness();const hostile={...object,name:'<img src=x onerror=alert(1)>',room:'__unassigned',mqtt_topic:'example/"\nanything'};
  await browser.respond(snapshot([event(1)],{objects:[{...hostile,latest:event(1)}]}));
  assert.match(browser.node('rows').textContent,/<img src=x onerror=alert\(1\)>/);
  assert.equal(browser.document.elements.some(e=>e.tagName==='img'),false);
  const row=browser.node('rows').children.find(e=>e.className.includes('selectable'))!;await row.fire('keydown',{key:'Enter'});
  const textarea=browser.node('automation-yaml');
  const copy=browser.document.elements.slice().reverse().find(e=>e.tagName==='button'&&e.textContent==='Copy YAML')!;await copy.fire('click');
  assert.equal(textarea.selectedText,true);assert.match(browser.node('detail-body').textContent,/copy it manually/);
  assert.equal(YAML.parse(textarea.value).triggers[0].topic,hostile.mqtt_topic);
  await browser.tick();await browser.respond(snapshot([event(2)],{objects:[{...hostile,latest:event(2)}]}));
  assert.equal(browser.node('automation-yaml'),textarea);assert.equal(browser.document.activeElement,textarea);
  assert.equal(browser.requests[1].url,'./api/snapshot?after=1');
});
test('DOM pause freezes rendered rows, details and health while polling advances then resumes',async()=>{
  const browser=browserHarness();await browser.respond(snapshot([event(1)],{objects:[{...object,latest:event(1)}]}));
  const row=browser.node('rows').children.find(e=>e.className.includes('selectable'))!;await row.fire('click');
  await browser.node('pause').fire('click');const rows=browser.node('rows').textContent,details=browser.node('detail-body').textContent,health=browser.node('health').textContent;
  await browser.tick();await browser.respond(snapshot([event(2,'two',90)],{objects:[{...object,name:'Updated',latest:event(2,'two',90)}],health:{ipl:false,mqtt:false,session_id:'two'}}));
  assert.equal(browser.node('rows').textContent,rows);assert.equal(browser.node('detail-body').textContent,details);assert.equal(browser.node('health').textContent,health);
  await browser.tick();assert.equal(browser.requests[2].url,'./api/snapshot?after=2');await browser.respond(snapshot([],{last_sequence:2,objects:[{...object,name:'Updated',latest:event(2,'two',90)}]}));
  await browser.node('pause').fire('click');assert.match(browser.node('rows').textContent,/Updated/);assert.match(browser.node('rows').textContent,/90%/);
});
test('DOM polling does not overlap and applies bounded failure backoff with visible recovery',async()=>{
  const browser=browserHarness();assert.equal(browser.requests.length,1);assert.equal(browser.timers.filter(t=>t.active&&t.delay!==8000).length,0);
  await browser.fail();assert.match(browser.node('context').textContent,/Retrying automatically/);assert.equal(await browser.tick(),2000);
  await browser.fail();assert.equal(await browser.tick(),4000);
  await browser.respond(snapshot([]));assert.match(browser.node('health').textContent,/Display live/);assert.equal(await browser.tick(),1000);
});

test('DOM restart refetches the full ring when the old cursor is lower than the new instance cursor',async()=>{
  const browser=browserHarness();await browser.respond(snapshot([event(1)]));await browser.tick();
  const fresh=[1,2,3,4,5].map(n=>event(n,'fresh-session',10+n));
  await browser.respond(snapshot(fresh.slice(1),{instance:'new-instance',last_sequence:5,history_limit:6}));
  assert.equal(browser.requests.length,3);assert.equal(browser.requests[2].url,'./api/snapshot');
  assert.equal(browser.pending.length,1);assert.equal(browser.timers.filter(t=>t.active&&t.delay!==8000).length,0);
  await browser.respond(snapshot(fresh,{instance:'new-instance',last_sequence:5,history_limit:6}));
  assert.equal(browser.node('rows').children.filter(e=>e.className.includes('selectable')).length,5);
  assert.match(browser.node('rows').textContent,/11%/);assert.match(browser.node('context').textContent,/App restarted/);
  await browser.tick();assert.equal(browser.requests[3].url,'./api/snapshot?after=5');
});

test('DOM Objects selection follows the latest report and preserves clipboard fallback as it updates',async()=>{
  const browser=browserHarness();await browser.respond(snapshot([event(1)],{objects:[{...object,latest:event(1)}]}));
  await browser.node('objects-tab').fire('click');await browser.node('rows').children[0].fire('click');
  const textarea=browser.node('automation-yaml');const copy=browser.document.elements.slice().reverse().find(e=>e.tagName==='button'&&e.textContent==='Copy YAML')!;
  await copy.fire('click');assert.equal(textarea.selectedText,true);
  await browser.tick();await browser.respond(snapshot([event(2,'one',90)],{objects:[{...object,latest:event(2,'one',90)}]}));
  assert.match(browser.node('detail-body').textContent,/"level": 90/);
  assert.equal(browser.node('automation-yaml'),textarea);assert.equal(browser.document.activeElement,textarea);assert.equal(textarea.selectedText,true);
  assert.match(browser.node('detail-body').textContent,/copy it manually/);
});
test('DOM evicted historical selection explains that the selected report left the buffer',async()=>{
  const browser=browserHarness();await browser.respond(snapshot([event(1)],{history_limit:1,objects:[{...object,latest:event(1)}]}));
  await browser.node('rows').children.find(e=>e.className.includes('selectable'))!.fire('click');
  await browser.tick();await browser.respond(snapshot([event(2,'one',90)],{history_limit:1,objects:[{...object,latest:event(2,'one',90)}]}));
  assert.match(browser.node('detail-body').textContent,/selected report left the temporary buffer/i);
  const latest=browser.document.elements.slice().reverse().find(e=>e.tagName==='button'&&e.textContent==='Show latest report')!;await latest.fire('click');
  assert.match(browser.node('detail-body').textContent,/"level": 90/);
});

test('DOM room keyboard focus follows the exact room when a preceding room is admitted',async()=>{
  const browser=browserHarness();await browser.respond(snapshot([]));
  const room=browser.node('room-list').children.find(e=>e.textContent.startsWith('Example room'))!;room.focus();
  await browser.tick();await browser.respond(snapshot([],{objects:[object,{...object,key:'another',name:'Another object',room:'Earlier room'}]}));
  assert.ok(browser.document.activeElement?.textContent.startsWith('Example room'));
  assert.ok(browser.node('room-list').children.includes(browser.document.activeElement!));
});
