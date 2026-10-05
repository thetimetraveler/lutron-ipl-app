import {constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync} from 'node:fs';
import {isAbsolute, join} from 'node:path';
import {describeObject, validateObservedObject} from './observations.js';
import type {AppConfig, ObjectName, ObservedObject} from './contracts.js';

const MAX_BYTES = 1024 * 1024, MAX_NAMES = 4096;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 160 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const nameKey = ({system_id,object_type,object_id}: ObservedObject) => describeObject({system_id,object_type,object_id})!.id;

/** Names never supply MQTT identities, topics, event types or device grouping. */
export function parseObjectNames(input: unknown, allowArea = false): ObjectName[] {
  if (!Array.isArray(input) || input.length > MAX_NAMES) throw new Error('Invalid object names');
  const seen = new Set<string>();
  return input.map(value => {
    if (!record(value) || Object.keys(value).some(k => !['system_id','object_type','object_id','name',...(allowArea ? ['area_name'] : [])].includes(k))) throw new Error('Invalid object names');
    const object = validateObservedObject({system_id:value.system_id, object_type:value.object_type, object_id:value.object_id});
    if (!object || !label(value.name) || (value.area_name !== undefined && !label(value.area_name))) throw new Error('Invalid object names');
    const id = describeObject(object)!.id;
    if (seen.has(id)) throw new Error('Duplicate object names');
    seen.add(id);
    return {...object,name:value.name.trim(),...(value.area_name === undefined ? {} : {area_name:(value.area_name as string).trim()})};
  });
}

function readNames(root: string, filename: string): ObjectName[] {
  // Follow the configured mount root, but no symlinks beneath it, and bound reads
  // before JSON parsing. File growth is bounded by a second max+1 check.
  if (!filename || isAbsolute(filename) || filename.includes('\\') || filename.includes('\0')) throw new Error('Invalid metadata file');
  const parts=filename.split('/');
  if (parts.some(p=>!p || p==='.' || p==='..')) throw new Error('Invalid metadata file');
  let path=realpathSync(root);
  for (let i=0;i<parts.length;i++) {
    path=join(path,parts[i]);const stat=lstatSync(path);
    if (stat.isSymbolicLink() || (i<parts.length-1 ? !stat.isDirectory() : !stat.isFile())) throw new Error('Invalid metadata file');
  }
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let input: unknown;
  try {
    const stat=fstatSync(fd);
    if (!stat.isFile() || stat.size>MAX_BYTES) throw new Error('Invalid metadata file');
    const bytes=Buffer.alloc(MAX_BYTES+1);let size=0, count=0;
    do {count=readSync(fd,bytes,size,bytes.length-size,null);size+=count;} while(count && size<bytes.length);
    if(size>MAX_BYTES) throw new Error('Invalid metadata file');
    input=JSON.parse(bytes.subarray(0,size).toString('utf8'));
  } finally {closeSync(fd);}
  if (!record(input) || input.version!==1 || Object.keys(input).some(k=>!['version','objects','generated_at','source'].includes(k)) ||
    (input.source!==undefined && input.source!=='designer') ||
    (input.generated_at!==undefined && (typeof input.generated_at!=='string' || input.generated_at.length>40 || !Number.isFinite(Date.parse(input.generated_at))))) throw new Error('Invalid metadata file');
  return parseObjectNames(input.objects,true);
}

export interface ResolvedObjectName { name: string; room: string | null; named: boolean }
export interface NameSnapshot {
  resolve(object: ObservedObject): ResolvedObjectName;
}

/** One validated, private snapshot supplies both MQTT labels and explorer rooms. */
export function createNameSnapshot(config: AppConfig, log: (message:string)=>void = ()=>{}): NameSnapshot {
  const names=new Map<string,ResolvedObjectName>();
  if(config.metadata_file) {
    try {
      const objects=readNames(config.credential_dir,config.metadata_file);
      for(const object of objects) names.set(nameKey(object),{
        name:object.area_name ? `${object.area_name} / ${object.name}` : object.name,
        room:object.area_name??null,named:true,
      });
      log(`[naming] imported ${objects.length} object names; snapshot loaded at startup`);
    } catch {log('[naming] metadata unavailable or invalid; using overrides and generic names');}
  }
  for(const object of parseObjectNames(config.name_overrides??[])) {
    const id=nameKey(object);
    names.set(id,{name:object.name,room:names.get(id)?.room??null,named:true});
  }
  return {resolve(object) {
    const descriptor=describeObject(object);if(!descriptor) throw new Error('Invalid named object');
    return {...(names.get(descriptor.id)??{name:descriptor.name,room:null,named:false})};
  }};
}

/** Compatible display-name-only API. */
export function createNameResolver(config: AppConfig, log: (message:string)=>void = ()=>{}): (object:ObservedObject)=>string {
  const snapshot=createNameSnapshot(config,log);
  return object=>snapshot.resolve(object).name;
}
