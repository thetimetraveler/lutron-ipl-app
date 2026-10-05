/** Local, read-only assets. No imports or external browser dependencies. */
export const EXPLORER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IPL Events</title><link rel="stylesheet" href="./style.css"><script defer src="./app.js"></script></head>
<body><a class="skip" href="#workspace">Skip to activity</a>
<header class="top"><div><h1>IPL Events</h1><p>Observe your lighting reports</p></div><div id="health" class="health" aria-live="polite">Connecting to explorer…</div></header>
<div class="shell"><aside class="rooms" aria-label="Rooms"><h2>Rooms</h2><nav id="room-list" aria-label="Room filters"></nav><label class="mobile-room" for="room-select">Room<select id="room-select"></select></label><p class="rail-note">Rooms come from imported metadata. Other objects appear in Unassigned.</p></aside>
<main id="workspace" tabindex="-1"><div class="toolbar"><div class="tabs" role="group" aria-label="Explorer view"><button id="activity-tab" aria-pressed="true">Activity</button><button id="objects-tab" aria-pressed="false">Objects</button></div><label class="search"><span class="sr-only">Search rooms, objects and reports</span><input id="search" type="search" placeholder="Search rooms, objects, reports" autocomplete="off"></label><button id="pause" aria-pressed="false">Pause display</button></div>
<div class="filters"><fieldset id="categories"><legend class="sr-only">Report categories</legend></fieldset><label><input id="changes" type="checkbox"> Changes only</label><label><input id="unnamed" type="checkbox"> Unnamed only</label></div>
<p id="context" class="context" role="status">Loading objects and recent reports…</p>
<div class="workarea"><section class="activity" aria-label="Explorer results"><div class="result-heading"><h2 id="view-title">Recent activity</h2><span id="result-count"></span></div><div class="table-scroll"><table id="results"><thead id="table-head"></thead><tbody id="rows"></tbody></table></div><div id="empty" class="empty" hidden></div><p class="footnote">Receipt times are observation times. Reports can repeat or arrive after reconnect; they do not verify a fresh physical action.</p></section>
<aside id="details" class="details" aria-label="Selected object details"><div class="details-heading"><h2>Object details</h2><button id="close-details" aria-label="Close object details" hidden>Close</button></div><div id="detail-body"><p class="hint">Select a report or object to inspect its identity, payload and MQTT trigger.</p></div></aside></div>
<footer><span id="version"></span><span>Read-only observer · History is temporary</span></footer></main></div></body></html>`;

export const EXPLORER_CSS = String.raw`
:root{color-scheme:light;--paper:#f7f9fc;--ink:#172e46;--muted:#52677b;--line:#d6e0eb;--blue:#215fa3;--blue-wash:#eaf2fc;--gold:#b5790c;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper)}
*{box-sizing:border-box}body{margin:0}h1,h2,p{margin:0}h1{font-size:26px;letter-spacing:-.6px;font-weight:650}h2{font-size:15px;font-weight:650}button,input,select,textarea{font:inherit;color:inherit}button{cursor:pointer;border:1px solid var(--line);background:white;border-radius:6px;padding:7px 11px;min-height:36px}button:hover{background:var(--blue-wash)}button[aria-pressed=true],button[aria-current=true]{color:var(--blue);background:var(--blue-wash);border-color:#91b5df}button:disabled{cursor:default;opacity:.65}:focus-visible{outline:3px solid var(--blue);outline-offset:3px}input[type=checkbox]{accent-color:var(--blue);width:16px;height:16px;vertical-align:middle;margin:0 6px 0 0}input[type=search],select{border:1px solid var(--line);border-radius:6px;background:white;padding:8px 10px;min-height:38px}.top{display:flex;align-items:center;justify-content:space-between;padding:22px 28px;gap:24px;border-bottom:1px solid var(--line);background:white}.top p{color:var(--muted);margin-top:2px}.health{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;font-size:12px}.health span{border:1px solid var(--line);padding:4px 9px;border-radius:20px}.health .online{border-color:#9cc6bc;color:#236253;background:#f0f8f5}.health .offline{color:#805219;border-color:#dcc393;background:#fff8ea}.shell{display:grid;grid-template-columns:216px minmax(0,1fr);min-height:calc(100vh - 101px)}.rooms{padding:24px 16px;border-right:1px solid var(--line)}.rooms h2{padding:0 10px;margin-bottom:12px}.rooms nav{display:flex;flex-direction:column;gap:4px}.rooms nav button{display:flex;justify-content:space-between;align-items:center;gap:8px;text-align:left;border-color:transparent;background:transparent}.rooms nav button[aria-current=true]{background:var(--blue-wash);color:var(--blue)}.room-count{font-size:12px;color:var(--muted)}.room-name{overflow-wrap:anywhere}.rail-note{margin:24px 10px 0;color:var(--muted);font-size:12px}.mobile-room{display:none}main{padding:24px;min-width:0}.toolbar{display:flex;align-items:center;gap:12px}.tabs{display:flex;border:1px solid var(--line);border-radius:7px;background:white;padding:3px;gap:3px}.tabs button{border-color:transparent}.search{flex:1}.search input{width:100%;max-width:520px}.filters{display:flex;align-items:center;flex-wrap:wrap;gap:12px 18px;margin:18px 0}.filters fieldset{border:0;padding:0;display:flex;flex-wrap:wrap;gap:5px;margin:0}.filters fieldset button{font-size:12px;padding:4px 9px;min-height:30px}.filters label{font-size:12px;white-space:nowrap}.context{font-size:12px;color:var(--muted);padding:10px 0 14px;min-height:42px}.context.warning{color:#805219}.workarea{display:grid;grid-template-columns:minmax(0,1fr) 350px;align-items:start;border:1px solid var(--line);border-radius:8px;background:white;overflow:hidden}.activity{min-width:0}.result-heading{padding:16px;display:flex;align-items:center;justify-content:space-between;gap:12px}.result-heading span{font-size:12px;color:var(--muted)}.table-scroll{overflow:auto;max-height:65vh}table{border-collapse:collapse;width:100%;font-size:12px}th{position:sticky;top:0;z-index:1;background:#f2f6fb;text-align:left;font-weight:600;color:var(--muted);padding:9px 12px;white-space:nowrap}td{padding:11px 12px;border-top:1px solid #e6edf4;vertical-align:top;overflow-wrap:anywhere}td.time{white-space:nowrap;color:var(--muted);font-variant-numeric:tabular-nums}tr.selectable{cursor:pointer}tr.selectable:hover{background:#f5f8fd}tr.selected{background:var(--blue-wash)}.object-name{min-width:120px;font-weight:600}.report{min-width:125px}.value{min-width:90px;white-space:nowrap}.level-track{display:block;width:64px;height:3px;background:#e6edf4;margin-top:6px;border-radius:3px;overflow:hidden}.level-track span{display:block;height:100%;background:var(--gold)}.publication{font-size:11px;white-space:nowrap}.accepted{color:#236253}.not-accepted{color:#805219}.session td{font-size:11px;background:#f7f9fc;color:var(--muted);padding:7px 12px}.footnote{font-size:12px;color:var(--muted);padding:16px;max-width:80ch;border-top:1px solid var(--line)}.empty{padding:40px 24px;color:var(--muted);max-width:70ch}.details{padding:16px;border-left:1px solid var(--line);min-width:0}.details-heading{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:18px}.details h3{font-size:14px;margin:18px 0 7px}.details p{font-size:12px;color:var(--muted)}.details .detail-name{font-size:18px;font-weight:650;color:var(--ink);overflow-wrap:anywhere}.details dl{display:grid;grid-template-columns:85px 1fr;gap:5px;font-size:12px;margin:14px 0}.details dt{color:var(--muted)}.details dd{margin:0;overflow-wrap:anywhere}.details pre,.topic{font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:10px}.details pre{max-height:240px;overflow:auto;margin:0}.details select{width:100%;font-size:12px;margin-bottom:8px}.details textarea{width:100%;resize:vertical;min-height:215px;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid var(--line);border-radius:4px;background:var(--paper);padding:10px}.copy-row{display:flex;gap:8px;align-items:center;margin:8px 0}.copy-row span{font-size:11px;color:var(--muted)}.hint{max-width:45ch}.details .copy-note{margin:8px 0}.detail-actions{display:flex;gap:8px;margin-top:8px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.skip{position:fixed;top:-60px;left:8px;z-index:10;background:white;padding:8px}.skip:focus{top:8px}footer{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:var(--muted);padding:16px 0}button,select,input{transition:background-color .12s} [hidden]{display:none!important}
@media(min-width:1450px){.workarea{grid-template-columns:minmax(0,1fr) 380px}}
@media(max-width:1150px){.workarea{grid-template-columns:minmax(0,1fr)}.details{border-left:0;border-top:1px solid var(--line)}.details:has(.hint){display:none}.detail-actions{max-width:350px}.details textarea{max-width:650px}}
@media(max-width:720px){.top{padding:16px;align-items:flex-start;gap:12px}.top h1{font-size:22px}.top p{font-size:12px}.health{max-width:180px;gap:4px}.health span{padding:3px 6px}.shell{display:block}.rooms{padding:12px 16px;border-right:0;border-bottom:1px solid var(--line)}.rooms h2,.rooms nav,.rail-note{display:none}.mobile-room{display:flex;align-items:center;gap:12px;font-size:12px}.mobile-room select{flex:1;min-width:0}main{padding:16px}.toolbar{flex-wrap:wrap;gap:8px}.search{order:3;flex-basis:100%}.search input{max-width:none}.toolbar>#pause{margin-left:auto}.filters{gap:12px;margin:14px 0}.filters fieldset{flex-basis:100%}.table-scroll{max-height:55vh}.details{padding:16px}.result-heading{padding:12px}.footnote{padding:12px}footer{flex-wrap:wrap}.context{padding-bottom:10px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;

export const EXPLORER_JS = String.raw`
'use strict';
const UNASSIGNED = Symbol('unassigned');
const CATEGORY_NAMES = {controls:'Controls',loads:'Loads',scenes:'Scenes',occupancy:'Occupancy',shades:'Shades'};
const REPORT_NAMES = {level_adjustment:'UI level adjustment',ui_level_report:'UI level',zone_level_report:'Zone level',load_level_report:'Load level',current_level_report:'Current level',shade_level_report:'Shade level',button_press_report:'Button press report',button_release_report:'Button release report',occupancy_report:'Occupancy',scene_selection_report:'Scene selection',area_lighting_report:'Area lighting state',go_to_level_observed:'Go to level observed'};
function reportLabel(type) { return Object.hasOwn(REPORT_NAMES,type) ? REPORT_NAMES[type] : String(type).replaceAll('_',' '); }
function reportValue(p) {
  if (typeof p.level === 'number') return p.level + '%';
  if (typeof p.selection === 'number') return 'Selection ' + p.selection;
  if (typeof p.state === 'number') return 'State ' + p.state;
  if (typeof p.status === 'number') return p.status_name ? p.status_name + ' (' + p.status + ')' : 'Status ' + p.status;
  return p.event_type === 'button_press_report' ? 'Press reported' : p.event_type === 'button_release_report' ? 'Release reported' : 'Report';
}
function semantic(type) {
  const common=' Receipt time does not verify a fresh physical action; repeated or cached reports may arrive after reconnect.';
  if(type==='go_to_level_observed') return 'A GoToLevel command was observed. It does not establish the original client, RF delivery, device execution or outcome.' + common;
  if(type==='scene_selection_report') return 'A numeric scene selection was reported. No scene name or original command source is inferred.' + common;
  if(type==='level_adjustment'||type==='ui_level_report') return 'Experimental UI level telemetry. It is not a verified touch start, release or fresh gesture.' + common;
  return 'A structured ' + reportLabel(type).toLowerCase() + ' was observed on the IPL stream. It does not identify the original command source.' + common;
}
function yamlScalar(value) { return JSON.stringify(String(value)).replace(/[\u0085\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')); }
function automationYaml(topic,type) {
  return '# Copy and review in Home Assistant. Nothing is installed by this explorer.\n# Reports do not establish physical-action freshness.\n' +
    'alias: "IPL report example"\ninitial_state: false\ntriggers:\n  - trigger: mqtt\n    topic: '+yamlScalar(topic)+'\n    payload: '+yamlScalar(type)+'\n    value_template: "{{ value_json.event_type }}"\nconditions: []\nactions: []\n# Optional action placeholder: add your own action after reviewing the report.\nmode: single\n';
}
function signature(p) { const stable={}; for(const key of Object.keys(p).sort()) if(key!=='received_at'&&key!=='session_id') stable[key]=p[key]; return JSON.stringify(stable); }
class ExplorerModel {
  constructor(){this.instance=null;this.cursor=0;this.events=[];this.objects=[];this.snapshot=null;this.signatures=new Map();this.lastSession=null;this.notice='';this.paused=false;this.frozen=null;}
  absorb(s){
    if(s.version!==1 || !Number.isSafeInteger(s.last_sequence) || !Array.isArray(s.events) || !Array.isArray(s.objects)) throw new Error('Unsupported snapshot');
    const reset=this.instance!==null && this.instance!==s.instance;
    if(reset || s.history_truncated){this.events=[];this.signatures.clear();this.lastSession=null;this.cursor=0;this.notice=reset?'App restarted. Temporary activity history has reset.':'History gap: older reports left the buffer. Showing available reports.';}
    this.instance=s.instance;
    this.events=this.events.slice(); // Never mutate the display snapshot held during pause.
    const seen=new Set(this.events.map(e=>e.sequence));
    for(const e of [...s.events].sort((a,b)=>a.sequence-b.sequence)){
      if(seen.has(e.sequence)||e.sequence<=this.cursor) continue;
      const key=e.object_key+'\u0000'+e.payload.event_type;
      const sig=signature(e.payload),previous=this.signatures.get(key);
      const changed=!previous || previous.session!==e.payload.session_id || previous.signature!==sig;
      const boundary=this.lastSession!==e.payload.session_id;
      this.signatures.set(key,{session:e.payload.session_id,signature:sig}); this.lastSession=e.payload.session_id;
      this.events.push({...e,changed,boundary});seen.add(e.sequence);
    }
    const limit=Math.max(1,Math.min(1000,Number.isSafeInteger(s.history_limit)?s.history_limit:1000));
    this.events=this.events.slice(-limit);this.objects=s.objects;this.cursor=s.last_sequence;this.snapshot=s;
    const keys=new Set(this.objects.map(o=>o.key));for(const key of this.signatures.keys())if(!keys.has(key.split('\u0000')[0]))this.signatures.delete(key);
  }
  current(){return {events:this.events,objects:this.objects,snapshot:this.snapshot,notice:this.notice};}
  display(){return this.paused?this.frozen:this.current();}
  pause(){this.frozen=this.current();this.paused=true;}
  resume(){this.paused=false;this.frozen=null;}
}
function matches(o,e,f){
  if(f.room!==null && (f.room===UNASSIGNED?o.room!==null:o.room!==f.room))return false;
  if(f.unnamed&&o.named)return false;
  if(e ? !f.categories.has(e.category) : !o.categories.some(c=>f.categories.has(c)))return false;
  const haystack=[o.name,o.room||'Unassigned',...(e?[e.payload.event_type,reportLabel(e.payload.event_type),reportValue(e.payload)]:o.event_types)].join(' ').toLocaleLowerCase();
  return !f.query || haystack.includes(f.query.toLocaleLowerCase());
}
if(typeof document!=='undefined'){
  const byId=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const model=new ExplorerModel();
  const filter={room:null,query:'',categories:new Set(Object.keys(CATEGORY_NAMES)),unnamed:false,changes:false};
  let view='activity',selectedKey=null,selectedSequence=null,selectedInstance=null,selectedType=null,failures=0,loading=true,inflight=false;
  let lastDetailEvent=null;
  function preserveFocus(fn){const key=document.activeElement&&document.activeElement.dataset.focusKey;fn();if(key)for(const n of document.querySelectorAll('[data-focus-key]'))if(n.dataset.focusKey===key){n.focus({preventScroll:true});break;}}
  function roomControls(objects){
    const groups=new Map();for(const o of objects)groups.set(o.room,(groups.get(o.room)||0)+1);
    const options=[{key:null,label:'All rooms',count:objects.length},...[...groups.keys()].filter(r=>r!==null).sort((a,b)=>a.localeCompare(b)).map(room=>({key:room,label:room,count:groups.get(room)})),{key:UNASSIGNED,label:'Unassigned',count:groups.get(null)||0}];
    if(!options.some(o=>o.key===filter.room))filter.room=null;
    const buttons=[],select=[];for(const [i,o]of options.entries()){
      const b=el('button');b.append(el('span',o.label,'room-name'),el('span',String(o.count),'room-count'));b.setAttribute('aria-current',String(filter.room===o.key));b.dataset.focusKey=o.key===null?'room:all':o.key===UNASSIGNED?'room:unassigned':'room:name:'+o.key;b.addEventListener('click',()=>{filter.room=o.key;render();});buttons.push(b);
      const option=el('option',o.label+' ('+o.count+')');option.value=String(i);option.selected=filter.room===o.key;select.push(option);
    }
    byId('room-list').replaceChildren(...buttons);byId('room-select').replaceChildren(...select);byId('room-select').onchange=e=>{filter.room=options[Number(e.target.value)].key;render();};
  }
  function select(o,e){selectedKey=o.key;selectedSequence=e?e.sequence:null;selectedInstance=model.display().snapshot.instance;selectedType=e?e.payload.event_type:null;render();}
  function renderRows(data){
    const objects=new Map(data.objects.map(o=>[o.key,o]));
    const items=view==='activity'?data.events.filter(e=>objects.has(e.object_key)&&matches(objects.get(e.object_key),e,filter)&&(!filter.changes||e.changed)).slice().reverse():data.objects.filter(o=>matches(o,null,filter)).slice().sort((a,b)=>(a.room||'Unassigned').localeCompare(b.room||'Unassigned')||a.name.localeCompare(b.name));
    const headers=view==='activity'?['Time','Room','Object','Report','Value','MQTT attempt']:['Room','Object','Supported reports','Latest value','MQTT attempt'];
    const head=el('tr');for(const h of headers){const th=el('th',h);th.scope='col';head.append(th);}byId('table-head').replaceChildren(head);
    const rows=[];for(const item of items){
      const o=view==='activity'?objects.get(item.object_key):item,e=view==='activity'?item:o.latest;
      const tr=el('tr',undefined,'selectable');tr.tabIndex=0;tr.setAttribute('role','button');tr.dataset.focusKey=view==='activity'?'event-'+e.sequence:'object-'+o.key;
      tr.setAttribute('aria-label',o.name+(e?', '+reportLabel(e.payload.event_type)+', '+reportValue(e.payload):', no recent report'));
      const selected=selectedKey===o.key&&(view==='objects'||selectedSequence===e.sequence&&selectedInstance===data.snapshot.instance);tr.classList.toggle('selected',selected);tr.setAttribute('aria-pressed',String(selected));
      tr.addEventListener('click',()=>select(o,view==='activity'?e:null));tr.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();select(o,view==='activity'?e:null);}});
      if(view==='activity'){const date=new Date(e.payload.received_at);const td=el('td',Number.isNaN(date.getTime())?e.payload.received_at:date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}),'time');td.title=e.payload.received_at;tr.append(td);}
      tr.append(el('td',o.room||'Unassigned'),el('td',o.name,'object-name'),el('td',view==='activity'?reportLabel(e.payload.event_type):o.event_types.map(reportLabel).join(', '),'report'));
      const value=el('td',e?reportValue(e.payload):'No recent report','value');if(e&&typeof e.payload.level==='number'){const track=el('span',undefined,'level-track'),fill=el('span');fill.style.width=Math.max(0,Math.min(100,e.payload.level))+'%';track.append(fill);value.append(track);}tr.append(value);
      const status=el('td',e?(e.mqtt_accepted?'Accepted':'Not accepted'):'No attempt','publication '+(e&&e.mqtt_accepted?'accepted':'not-accepted'));status.title='Publication attempt accepted by the MQTT publisher; this is not a delivery guarantee.';tr.append(status);rows.push(tr);
      if(view==='activity'&&e.boundary){const boundary=el('tr',undefined,'session'),td=el('td','Session context: '+e.payload.session_id+' · Reports may include initial or cached state.');td.colSpan=headers.length;boundary.append(td);rows.push(boundary);}
    }
    byId('rows').replaceChildren(...rows);byId('result-count').textContent=items.length+(view==='activity'?' reports':' objects');byId('view-title').textContent=view==='activity'?'Recent activity':'Known objects';
    const empty=byId('empty');empty.hidden=items.length!==0;
    empty.textContent=loading?'Loading objects and recent reports…':data.objects.length===0?'No known objects yet. Configured controls and admitted observed objects will appear here.':view==='activity'&&data.events.length===0?'No recent reports in this app session. Open Objects to inspect quiet or restored objects.':'No matches. Try another room, search or report category.';
  }
  function updatePayload(e,historical){
    byId('payload-heading').textContent=historical?'Selected structured payload':'Latest structured payload';
    byId('structured-payload').textContent=e?JSON.stringify(e.payload,null,2):historical?'Selected report left the temporary buffer. Show latest report to inspect current state.':'No recent structured payload in this app session.';
    byId('latest-report').hidden=!historical;
    byId('payload-provenance').textContent=e?(e.mqtt_accepted?'MQTT publication attempt accepted. Delivery is not confirmed.':'MQTT publication attempt not accepted. This report is visible only in temporary history.'):historical?'The selected report is no longer available in temporary history.':'This object is known without a recent report.';
  }
  function renderDetails(data){
    const o=data.objects.find(o=>o.key===selectedKey),body=byId('detail-body');byId('close-details').hidden=!o;
    if(!o){lastDetailEvent=null;body.replaceChildren(el('p','Select a report or object to inspect its identity, payload and MQTT trigger.','hint'));return;}
    const historical=selectedSequence!==null&&selectedInstance===data.snapshot.instance;
    const e=historical?data.events.find(e=>e.sequence===selectedSequence&&e.object_key===o.key):o.latest;
    const type=selectedType&&o.event_types.includes(selectedType)?selectedType:(e?e.payload.event_type:o.event_types[0]);
    // Leave a user's text selection, scroll position and keyboard focus intact between polls.
    const {latest:ignoredLatest,...identity}=o;
    const detailEventKey=JSON.stringify([identity,type]);if(lastDetailEvent===detailEventKey&&body.childNodes.length){updatePayload(e,historical);return;}lastDetailEvent=detailEventKey;
    const title=el('p',o.name,'detail-name'),room=el('p',o.room||'Unassigned');const dl=el('dl');
    for(const [label,value]of [['Object key',o.key],['System',o.system_id===null?'Unresolved':String(o.system_id)],['Object type',String(o.object_type)],['Object ID',String(o.object_id)],...(o.device_id===undefined?[]:[['Device ID',String(o.device_id)]]),['Name',o.named?'Configured or imported':'Generic fallback']])dl.append(el('dt',label),el('dd',value));
    const typesLabel=el('label','Supported report type');typesLabel.htmlFor='report-type';const types=el('select');types.id='report-type';for(const t of o.event_types){const opt=el('option',reportLabel(t)+' ('+t+')');opt.value=t;opt.selected=t===type;types.append(opt);}types.addEventListener('change',()=>{selectedType=types.value;lastDetailEvent=null;renderDetails(model.display());});
    const explanation=el('p',type?semantic(type):'No supported report types.');const topic=el('pre',o.mqtt_topic,'topic');topic.tabIndex=0;
    const payload=el('pre');payload.id='structured-payload';payload.tabIndex=0;
    const latestHeading=el('h3');latestHeading.id='payload-heading';
    const latestButton=el('button','Show latest report');latestButton.id='latest-report';latestButton.addEventListener('click',()=>{selectedSequence=null;lastDetailEvent=null;render();});
    const provenance=el('p');provenance.id='payload-provenance';
    const copyLabel=el('label','MQTT automation example');copyLabel.htmlFor='automation-yaml';const textarea=el('textarea');textarea.id='automation-yaml';textarea.readOnly=true;textarea.spellcheck=false;textarea.value=type?automationYaml(o.mqtt_topic,type):'';
    const note=el('p','event_type is a JSON field in the MQTT payload, not a Home Assistant event-bus type. This example is disabled and its action is a placeholder.','copy-note');
    const copy=el('button','Copy YAML');copy.disabled=!type;const feedback=el('span','');feedback.setAttribute('role','status');
    copy.addEventListener('click',async()=>{try{if(!navigator.clipboard||!navigator.clipboard.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(textarea.value);feedback.textContent='Copied YAML';}catch{textarea.focus();textarea.select();feedback.textContent='Clipboard unavailable. Text selected; copy it manually.';}});
    const copyrow=el('div',undefined,'copy-row');copyrow.append(copy,feedback);
    body.replaceChildren(title,room,dl,typesLabel,types,explanation,el('h3','MQTT topic'),topic,latestHeading,payload,latestButton,provenance,el('h3','Copy to Home Assistant'),copyLabel,textarea,note,copyrow);
    updatePayload(e,historical);
  }
  function render(){preserveFocus(()=>{
    const data=model.display();if(!data)return;roomControls(data.objects);renderRows(data);renderDetails(data);
    byId('activity-tab').setAttribute('aria-pressed',String(view==='activity'));byId('objects-tab').setAttribute('aria-pressed',String(view==='objects'));
    byId('changes').disabled=view==='objects';byId('pause').textContent=model.paused?'Resume display':'Pause display';byId('pause').setAttribute('aria-pressed',String(model.paused));
    const s=data.snapshot;const health=[];if(s){for(const [name,up]of [['IPL',s.health.ipl],['MQTT',s.health.mqtt]])health.push(el('span',name+(up?' connected':' offline'),up?'online':'offline'));byId('version').textContent='Version '+s.app_version;}
    health.push(el('span',model.paused?'Display paused':failures?'Explorer reconnecting':'Display live',failures?'offline':''));byId('health').replaceChildren(...health);
    const parts=[];if(model.paused)parts.push('Display paused. Collection continues in the background; resume to see available reports.');else if(failures)parts.push('Explorer connection unavailable. Retrying automatically; the last collected reports remain visible.');else if(s&&!s.health.ipl)parts.push('IPL is offline. Known objects and collected reports remain available.');
    if(data.notice)parts.push(data.notice);if(s&&s.health.session_id)parts.push('Current IPL session: '+s.health.session_id+'.');if(s)parts.push('Showing up to '+s.history_limit+' temporary reports. MQTT status records acceptance of an attempt, not delivery.');
    byId('context').textContent=parts.join(' ')||'Loading objects and recent reports…';byId('context').classList.toggle('warning',failures>0||!!data.notice);
  });}
  for(const [key,name]of Object.entries(CATEGORY_NAMES)){const b=el('button',name);b.setAttribute('aria-pressed','true');b.addEventListener('click',()=>{if(filter.categories.has(key))filter.categories.delete(key);else filter.categories.add(key);b.setAttribute('aria-pressed',String(filter.categories.has(key)));render();});byId('categories').append(b);}
  byId('search').addEventListener('input',e=>{filter.query=e.target.value.trim();render();});byId('unnamed').addEventListener('change',e=>{filter.unnamed=e.target.checked;render();});byId('changes').addEventListener('change',e=>{filter.changes=e.target.checked;render();});
  byId('activity-tab').addEventListener('click',()=>{view='activity';render();});byId('objects-tab').addEventListener('click',()=>{view='objects';selectedSequence=null;render();});
  byId('pause').addEventListener('click',()=>{if(model.paused)model.resume();else model.pause();render();});
  byId('close-details').addEventListener('click',()=>{selectedKey=null;selectedSequence=null;selectedType=null;lastDetailEvent=null;render();byId(view==='activity'?'activity-tab':'objects-tab').focus();});
  async function poll(){
    if(inflight)return;inflight=true;const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),8000);
    try{
      const options={cache:'no-store',signal:controller.signal};
      const response=await fetch('./api/snapshot?after='+model.cursor,options);
      if(!response.ok)throw new Error('Explorer unavailable');
      let snapshot=await response.json();
      // A prior instance's small cursor could hide the new instance's earliest rows.
      // Refetch its full ring sequentially within this poll's shared abort deadline.
      if(model.instance!==null&&snapshot.instance!==model.instance){
        const full=await fetch('./api/snapshot',options);
        if(!full.ok)throw new Error('Explorer unavailable');
        snapshot=await full.json();
      }
      model.absorb(snapshot);loading=false;failures=0;if(!model.paused)render();
    }
    catch{loading=false;failures++;if(!model.paused)render();}
    finally{clearTimeout(deadline);inflight=false;setTimeout(poll,Math.min(15000,1000*Math.pow(2,Math.min(failures,4))));}
  }
  render();poll();
}
`;
