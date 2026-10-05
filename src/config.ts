import { X509Certificate, createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { isIP } from "node:net";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { AppConfig, UiMapping } from "./contracts.js";
import {parseObjectNames} from './naming.js';

const fields = new Set([
  "processor_host", "processor_port", "client_cert", "client_key", "ca_cert",
  "expected_server_name", "expected_server_ip", "mqtt_url", "mqtt_username", "mqtt_password",
  "instance_id", "base_topic", "discovery_prefix", "ha_birth_topic", "publish_debug", "mappings", "auto_discover", "max_discovered_objects", "metadata_file", "name_overrides",
]);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const topicPattern = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(input: Record<string, unknown>, field: string, fallback: string): string {
  const value = input[field] ?? fallback;
  if (typeof value !== "string" || value.length > 4096 || value.includes("\0")) {
    throw new Error(`Invalid option: ${field}`);
  }
  return value;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid option: ${field}`);
  }
  return value;
}

function validHost(host: string): boolean {
  return isIP(host) !== 0 || (host.length <= 253 && host.split(".").every(label =>
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)));
}

function fileOption(input: Record<string, unknown>, field: string, fallback: string): string {
  const value = text(input, field, fallback);
  if (!value || isAbsolute(value) || value.includes("\\") || value.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`Invalid credential path: ${field}`);
  }
  return value;
}

export function parseOptions(input: unknown, environment: { credentialDir?: string; dataDir?: string } = {}): AppConfig {
  if (!object(input) || Object.keys(input).some(field => !fields.has(field))) throw new Error("Invalid IPL options");
  const host = text(input, "processor_host", "");
  if (!validHost(host)) throw new Error("Invalid option: processor_host");
  const expectedName = text(input, "expected_server_name", "");
  const expectedIp = text(input, "expected_server_ip", "");
  if (expectedName && (!validHost(expectedName) || isIP(expectedName))) throw new Error("Invalid option: expected_server_name");
  if (expectedIp && !isIP(expectedIp)) throw new Error("Invalid option: expected_server_ip");
  if (expectedName && expectedIp) throw new Error("Choose one expected certificate identity");
  const mqttUrl = text(input, "mqtt_url", "");
  if (mqttUrl) {
    let url: URL;
    try { url = new URL(mqttUrl); } catch { throw new Error("Invalid option: mqtt_url"); }
    if (!["mqtt:", "mqtts:"].includes(url.protocol) || !url.hostname || url.username || url.password ||
      url.search || url.hash || (url.pathname && url.pathname !== "/")) throw new Error("Invalid option: mqtt_url");
    if (url.port) integer(Number(url.port), "mqtt_url port", 1, 65535);
  }
  const instance = text(input, "instance_id", "default");
  if (!idPattern.test(instance)) throw new Error("Invalid option: instance_id");
  const topics = { base_topic: text(input,"base_topic","lutron_ipl"),
    discovery_prefix: text(input,"discovery_prefix","homeassistant"), ha_birth_topic: text(input,"ha_birth_topic","homeassistant/status") };
  for (const [field,value] of Object.entries(topics)) if (!topicPattern.test(value)) throw new Error(`Invalid option: ${field}`);
  const debug = input.publish_debug ?? false;
  if (typeof debug !== "boolean") throw new Error("Invalid option: publish_debug");
  const autoDiscover = input.auto_discover ?? false;
  if (typeof autoDiscover !== "boolean") throw new Error("Invalid option: auto_discover");
  const maxObjects = integer(input.max_discovered_objects ?? 128,"max_discovered_objects",1,256);
  const metadataFile=text(input,'metadata_file','');
  if (metadataFile) fileOption(input,'metadata_file','');
  const nameOverrides=parseObjectNames(input.name_overrides??[]);
  const rawMappings = input.mappings ?? [];
  if (!Array.isArray(rawMappings) || rawMappings.length > 256) throw new Error("Invalid option: mappings");
  const ids = new Set<string>(), objects = new Set<number>();
  const mappings: UiMapping[] = rawMappings.map(value => {
    if (!object(value) || Object.keys(value).some(key=>!["id","name","device_id","ui_object_id"].includes(key))) throw new Error("Invalid UI mapping");
    const id = text(value,"id",""), name=text(value,"name","");
    if (!idPattern.test(id) || ids.has(id) || !name.trim() || name.length > 160) throw new Error("Invalid or duplicate UI mapping identity");
    const ui = integer(value.ui_object_id,"ui_object_id",1,0xffffffff);
    if (objects.has(ui)) throw new Error("Duplicate UI object mapping");
    ids.add(id); objects.add(ui);
    return { id, name, device_id: integer(value.device_id,"device_id",1,0xffffffff), ui_object_id: ui };
  });
  return {
    processor_host: host, processor_port: integer(input.processor_port ?? 8902,"processor_port",1,65535),
    credential_dir: resolve(environment.credentialDir ?? "/config"), data_dir: resolve(environment.dataDir ?? "/data"),
    client_cert: fileOption(input,"client_cert","ipl_client_cert.pem"), client_key: fileOption(input,"client_key","ipl_client_key.pem"),
    ca_cert: fileOption(input,"ca_cert","processor_ca.pem"), expected_server_name: expectedName, expected_server_ip: expectedIp,
    mqtt_url: mqttUrl, mqtt_username: text(input,"mqtt_username",""), mqtt_password: text(input,"mqtt_password",""),
    instance_id: instance, ...topics, publish_debug: debug, mappings, auto_discover: autoDiscover, max_discovered_objects: maxObjects,
    metadata_file:metadataFile, name_overrides:nameOverrides,
  };
}

export function readOptionsFile(file: string, environment: { credentialDir?: string; dataDir?: string } = {}): AppConfig {
  let input: unknown;
  try { input = JSON.parse(readFileSync(file,"utf8")); } catch { throw new Error("Unable to read valid IPL options JSON"); }
  return parseOptions(input, environment);
}

function credentialFile(root: string, name: string): string {
  let base: string, file: string;
  try { base = realpathSync(root); file = realpathSync(join(base,name)); }
  catch { throw new Error("Missing or unreadable credential file"); }
  const rel=relative(base,file);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Credential file escapes configured directory");
  return file;
}

function certificates(file: string, now: Date): X509Certificate[] {
  let certs: X509Certificate[];
  try {
    const pem=readFileSync(file,"utf8");
    const blocks=pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!blocks?.length) throw new Error();
    certs=blocks.map(block=>new X509Certificate(block));
  } catch { throw new Error("Invalid credential certificate PEM"); }
  for (const cert of certs) {
    if (new Date(cert.validTo).getTime() < now.getTime()) throw new Error("Credential certificate expired; replace it before starting");
    if (new Date(cert.validFrom).getTime() > now.getTime()) throw new Error("Credential certificate is not yet valid; check clock and credentials");
  }
  return certs;
}

export function validateCredentials(config: AppConfig, now = new Date()): { cert: string; key: string; ca: string } {
  const cert=credentialFile(config.credential_dir,config.client_cert);
  const key=credentialFile(config.credential_dir,config.client_key);
  const ca=credentialFile(config.credential_dir,config.ca_cert);
  const client=certificates(cert,now)[0]; certificates(ca,now);
  let keyPublic: Buffer;
  try { keyPublic=createPublicKey(createPrivateKey(readFileSync(key))).export({ type:"spki",format:"der" }); }
  catch { throw new Error("Invalid or encrypted client private key PEM"); }
  const certPublic=client.publicKey.export({ type:"spki",format:"der" });
  if (!keyPublic.equals(certPublic)) throw new Error("Client certificate and private key do not match");
  return { cert,key,ca };
}
