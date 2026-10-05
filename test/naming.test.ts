import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseOptions} from '../src/config.js';

const key = {system_id:7, object_type:15, object_id:9001};
const snapshot = (objects: unknown[]) => ({version:1, generated_at:'2026-10-05T00:00:00Z', source:'designer', objects});

test('resolver uses overrides, imported room names and generic fallback without cross-system matches', async t => {
  const {createNameResolver} = await import('../src/naming.js');
  const dir=mkdtempSync(join(tmpdir(),'ipl-names-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  writeFileSync(join(dir,'names.json'),JSON.stringify(snapshot([{...key,name:'Ceiling',area_name:'Kitchen'}])));
  const config=parseOptions({processor_host:'fixture.invalid',metadata_file:'names.json'}, {credentialDir:dir});
  const resolve=createNameResolver(config);
  assert.equal(resolve(key),'Kitchen / Ceiling');
  assert.equal(resolve({...key,system_id:8}),'IPL Zone 9001 (System 8)');
  assert.equal(resolve({...key,object_type:9}),'IPL UI 9001 (System 7)');
  assert.equal(createNameResolver({...config,name_overrides:[{...key,name:'My ceiling'}]})(key),'My ceiling');
});

test('invalid or unsafe imports fall back to generic naming with static errors', async t => {
  const {createNameResolver} = await import('../src/naming.js');
  const dir=mkdtempSync(join(tmpdir(),'ipl-names-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const config=parseOptions({processor_host:'fixture.invalid',metadata_file:'names.json'}, {credentialDir:dir});
  for (const contents of [
    '{SECRET', JSON.stringify({...snapshot([]),version:2}),
    JSON.stringify(snapshot([{...key,name:'SECRET\nline'}])),
    JSON.stringify(snapshot([{...key,name:'One'},{...key,name:'Two'}])),
    JSON.stringify(snapshot([{...key,name:'One',state_topic:'SECRET'}])),
    JSON.stringify(snapshot(Array.from({length:4097},(_,i)=>({...key,object_id:i+1,name:'One'})))),
    ' '.repeat(1024*1024+1),
  ]) {
    writeFileSync(join(dir,'names.json'),contents);const logs:string[]=[];
    assert.equal(createNameResolver(config, m=>logs.push(m))(key),'IPL Zone 9001 (System 7)');
    assert.ok(logs.length>0);assert.ok(logs.every(m=>!m.includes('SECRET')));
  }
  rmSync(join(dir,'names.json'));symlinkSync('/etc/hosts',join(dir,'names.json'));
  assert.equal(createNameResolver(config)(key),'IPL Zone 9001 (System 7)');
  mkdirSync(join(dir,'folder'));symlinkSync(join(dir,'folder'),join(dir,'alias'));
  writeFileSync(join(dir,'folder','names.json'),JSON.stringify(snapshot([{...key,name:'Unsafe'}])));
  assert.equal(createNameResolver({...config,metadata_file:'alias/names.json'})(key),'IPL Zone 9001 (System 7)');
});
