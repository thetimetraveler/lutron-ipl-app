/** Convert a curated SELECT-only Designer name export into a private app snapshot. */
import {constants,closeSync,fstatSync,openSync,readSync,writeFileSync} from 'node:fs';
import {parseObjectNames} from '../src/naming.js';

function main() {
  const args=process.argv.slice(2), flags=new Map<string,string>();
  for(let i=0;i<args.length;i+=2) {
    if(!['--input','--output','--system-id'].includes(args[i]) || !args[i+1] || flags.has(args[i])) throw new Error('Use --input ROWS_JSON --output NEW_METADATA_JSON --system-id VERIFIED_ID');
    flags.set(args[i],args[i+1]);
  }
  if(flags.size!==3 || !/^\d{1,5}$/.test(flags.get('--system-id')!) || Number(flags.get('--system-id'))>65535) throw new Error('An explicit verified system ID is required');
  const max=1024*1024, fd=openSync(flags.get('--input')!,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let rows: unknown;
  try {
    const stat=fstatSync(fd);if(!stat.isFile()||stat.size>max) throw new Error('Invalid Designer export');
    const bytes=Buffer.alloc(max+1);let size=0,count=0;
    do {count=readSync(fd,bytes,size,bytes.length-size,null);size+=count;} while(count&&size<bytes.length);
    if(size>max) throw new Error('Invalid Designer export');
    rows=JSON.parse(bytes.subarray(0,size).toString('utf8'));
  } finally {closeSync(fd);}
  if(!Array.isArray(rows)||rows.length>4096) throw new Error('Invalid Designer export');
  const system_id=Number(flags.get('--system-id'));
  const objects=parseObjectNames(rows.map(row=>{
    if(!row || typeof row!=='object' || Array.isArray(row) || Object.keys(row).some(k=>!['object_id','object_type','name','area_name'].includes(k))) throw new Error('Invalid Designer export');
    return {...row,system_id};
  }),true);
  const contents=JSON.stringify({version:1,source:'designer',generated_at:new Date().toISOString(),objects},null,2)+'\n';
  if(Buffer.byteLength(contents)>max) throw new Error('Metadata exceeds app size limit');
  writeFileSync(flags.get('--output')!,contents,{flag:'wx',mode:0o600});
  console.log(`Created private snapshot with ${objects.length} object names; verify project and system binding before importing.`);
}
try {main();} catch {console.error('Name export failed: check curated rows, explicit system ID, and a fresh output path. No output is overwritten.');process.exitCode=1;}
