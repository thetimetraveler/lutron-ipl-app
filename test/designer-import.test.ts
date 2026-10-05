import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, readFileSync, writeFileSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('Designer import binds an explicit system, excludes secrets and refuses overwrite', t=>{
  const dir=mkdtempSync(join(tmpdir(),'ipl-import-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const input=join(dir,'rows.json'), output=join(dir,'metadata.json');
  const run=(system='7')=>spawnSync(process.execPath,['--import','tsx','tools/import-designer-names.ts','--input',input,'--output',output,'--system-id',system],{encoding:'utf8'});
  writeFileSync(input,JSON.stringify([{object_id:9001,object_type:15,name:'Ceiling',area_name:'Kitchen'}]));
  let result=run();assert.equal(result.status,0,result.stderr);
  const snapshot=JSON.parse(readFileSync(output,'utf8'));
  assert.equal(snapshot.version,1);assert.equal(snapshot.source,'designer');
  assert.deepEqual(snapshot.objects,[{system_id:7,object_type:15,object_id:9001,name:'Ceiling',area_name:'Kitchen'}]);
  assert.equal(statSync(output).mode & 0o777,0o600);
  result=run();assert.notEqual(result.status,0);assert.deepEqual(JSON.parse(readFileSync(output,'utf8')),snapshot);
  rmSync(output);
  for(const rows of [
    [{object_id:9001,object_type:15,name:'Ceiling',NetworkMasterKey:'SECRET'}],
    [{object_id:9001,object_type:15,name:'Ceiling'},{object_id:9001,object_type:15,name:'Other'}],
  ]) {writeFileSync(input,JSON.stringify(rows));result=run();assert.notEqual(result.status,0);assert.ok(!result.stderr.includes('SECRET'));}
  writeFileSync(input,'[]');assert.notEqual(run('65536').status,0);
});
