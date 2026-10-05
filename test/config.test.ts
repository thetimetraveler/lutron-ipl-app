import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, mkdirSync, realpathSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseOptions, validateCredentials, readOptionsFile } from "../src/config.js";

const mapping = { id: "control", name: "Example control", device_id: 101, ui_object_id: 102 };
const valid = { processor_host: "processor.example", mappings: [mapping] };

test("parses explicit host and secure mount defaults without embedding household identity", () => {
  const config = parseOptions(valid);
  assert.equal(config.processor_port, 8902);
  assert.equal(config.credential_dir, "/config");
  assert.equal(config.data_dir, "/data");
  assert.equal(config.publish_debug, false);
  assert.equal(config.base_topic, "lutron_ipl");
  assert.deepEqual(config.mappings, [mapping]);
  assert.equal(parseOptions({ processor_host: "2001:db8::1" }).processor_host, "2001:db8::1");
});

test("validates bounds, duplicate identity and option types without echoing values", () => {
  for (const input of [null, [], {}, { ...valid, processor_port: 0 }, { ...valid, processor_port: "8902" },
    { ...valid, publish_debug: "true" }, { ...valid, mappings: [mapping, mapping] },
    { ...valid, mappings: [{ ...mapping, id: "other" }, mapping] },
    { ...valid, mappings: [{ ...mapping, device_id: 1.5 }] },
    { ...valid, instance_id: "bad/#" }, { ...valid, base_topic: "bad/+" },
    { ...valid, client_key: "../secret-key.pem" }, { ...valid, client_cert: "/outside.pem" },
    { ...valid, processor_host: "-bad-argument" }, { ...valid, credential_dir: "/outside" },
    { ...valid, mqtt_url: "mqtt://user:SECRET@broker.example" },
    { ...valid, mqtt_url: "https://broker.example" },
    { ...valid, expected_server_name: "a.example", expected_server_ip: "192.0.2.1" }]) {
    assert.throws(() => parseOptions(input), (error: Error) => !error.message.includes("SECRET"));
  }
});

test("accepts a configured broker and optional certificate identity", () => {
  const config = parseOptions({ ...valid, mqtt_url: "mqtts://broker.example:8883", mqtt_password: "SECRET",
    expected_server_name: "processor.example", ha_birth_topic: "ha/lifecycle" }, { credentialDir: "/tmp/certs", dataDir: "/tmp/state" });
  assert.equal(config.mqtt_password, "SECRET");
  assert.equal(config.credential_dir, "/tmp/certs");
  assert.equal(config.ha_birth_topic, "ha/lifecycle");
});

let fixture: string;
before(() => {
  fixture = mkdtempSync(join(tmpdir(), "ipl-config-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(fixture,"ipl_client_key.pem"),
    "-out", join(fixture,"ipl_client_cert.pem"), "-subj", "/CN=local-test-only", "-days", "2"], { stdio: "ignore" });
  const cert = execFileSync("openssl", ["x509", "-in", join(fixture,"ipl_client_cert.pem"), "-outform", "PEM"]);
  writeFileSync(join(fixture,"processor_ca.pem"), cert);
});
after(() => rmSync(fixture, { recursive: true, force: true }));

test("validates generated PEM expiry and client key matching before a connection", () => {
  const config = parseOptions(valid, { credentialDir: fixture });
  const paths = validateCredentials(config);
  assert.equal(paths.key, realpathSync(join(fixture,"ipl_client_key.pem")));
  assert.throws(() => validateCredentials(config, new Date(Date.now()+4*86400000)), /expired/i);
  assert.throws(() => validateCredentials(config, new Date(Date.now()-4*86400000)), /valid/i);
  execFileSync("openssl", ["genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", join(fixture,"wrong.pem")], { stdio: "ignore" });
  assert.throws(() => validateCredentials({ ...config, client_key: "wrong.pem" }), /match/i);
});

test("rejects symlink escapes, missing PEM and malformed certificates without exposing data", () => {
  const nested = join(fixture,"nested"); mkdirSync(nested);
  copyFileSync(join(fixture,"ipl_client_cert.pem"),join(nested,"ipl_client_cert.pem"));
  copyFileSync(join(fixture,"processor_ca.pem"),join(nested,"processor_ca.pem"));
  symlinkSync(join(fixture,"ipl_client_key.pem"), join(nested,"key.pem"));
  const config = parseOptions({ ...valid, client_key: "key.pem" }, { credentialDir: nested });
  assert.throws(() => validateCredentials(config), /escapes/i);
  writeFileSync(join(fixture,"bad.pem"), "SECRET-NOT-PEM");
  assert.throws(() => validateCredentials({ ...parseOptions(valid,{credentialDir:fixture}), client_cert: "bad.pem" }),
    (error:Error)=> !error.message.includes("SECRET-NOT-PEM"));
});

test("reads options file and gives static parse/read errors", () => {
  const file=join(fixture,"options.json"); writeFileSync(file,JSON.stringify(valid));
  assert.equal(readOptionsFile(file).processor_host,"processor.example");
  writeFileSync(file,'{"mqtt_password":"SECRET",');
  assert.throws(()=>readOptionsFile(file),(error:Error)=>!error.message.includes("SECRET"));
});
