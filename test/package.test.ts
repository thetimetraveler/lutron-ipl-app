import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const manifest = () => parse(read('app/manifest.yaml'));
const stagedFiles = ['.lutron-ipl-package.json', 'CHANGELOG.md', 'DOCS.md', 'Dockerfile', 'README.md', 'THIRD_PARTY.md', 'config.yaml', 'dist/main.js', 'examples/automation.yaml', 'examples/options.json', 'package-lock.json', 'package.json', 'run.sh'];
function files(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]).sort();
}
function fixture(): { dir: string; repo: string } {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'ipl-package-test-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  for (const path of ['app', 'examples', 'scripts/stage.mjs', 'THIRD_PARTY.md', 'package.json']) cpSync(join(root, path), join(repo, path), { recursive: true });
  mkdirSync(join(repo, 'dist'));
  writeFileSync(join(repo, 'dist/main.js'), "import { existsSync } from 'node:fs'; console.log(existsSync('package.json') ? 'standalone-runtime-ok' : 'missing');\n");
  for (const path of ['config', 'certificates', 'captures', 'node_modules', '.git']) {
    mkdirSync(join(repo, path));
    writeFileSync(join(repo, path, 'secret.pem'), 'PACKAGE_SECRET_SENTINEL');
  }
  writeFileSync(join(repo, 'dist/private.pem'), 'PACKAGE_SECRET_SENTINEL');
  writeFileSync(join(repo, '.env'), 'PACKAGE_SECRET_SENTINEL');
  return { dir, repo };
}
function stage(repo: string, destination?: string) {
  return spawnSync(process.execPath, [join(repo, 'scripts/stage.mjs'), ...(destination ? [destination] : [])], { cwd: tmpdir(), encoding: 'utf8' });
}

test('HA manifest exactly exposes the flat options and nested mapping contract', () => {
  const config = manifest();
  const expected = ['processor_host', 'processor_port', 'client_cert', 'client_key', 'ca_cert', 'expected_server_name', 'expected_server_ip', 'mqtt_url', 'mqtt_username', 'mqtt_password', 'instance_id', 'base_topic', 'discovery_prefix', 'ha_birth_topic', 'publish_debug', 'auto_discover', 'max_discovered_objects', 'mappings', 'metadata_file','name_overrides'].sort();
  assert.deepEqual(Object.keys(config.options).sort(), expected);
  assert.deepEqual(Object.keys(config.schema).sort(), expected);
  assert.equal(config.options.auto_discover, false);
  assert.equal(config.options.max_discovered_objects, 128);
  assert.equal(config.schema.auto_discover, 'bool');
  assert.equal(config.schema.max_discovered_objects, 'int(1,256)');
  assert.deepEqual(config.options.mappings, []);
  assert.deepEqual(config.schema.mappings, [{ id: 'match(^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$)', name: 'str(1,160)', device_id: 'int(1,4294967295)', ui_object_id: 'int(1,4294967295)' }]);
  assert.equal(config.schema.mqtt_password, 'password');
  assert.equal(config.schema.processor_port, 'int(1,65535)');
  assert.equal(config.options.processor_port, 8902);
  assert.equal(config.version, JSON.parse(read('package.json')).version);
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(config.version, lock.version);
  assert.equal(config.version, lock.packages[''].version);
  assert.match(read('app/Dockerfile'), new RegExp(`^ARG BUILD_VERSION=${config.version.replaceAll('.', '\\.')}$`, 'm'));
  assert.deepEqual(Object.keys(JSON.parse(read('examples/options.json'))).sort(), expected);
});

test('HA app uses read-only credentials, optional MQTT discovery, and ordinary networking', () => {
  const config = manifest();
  assert.equal(config.slug, 'lutron-ipl');
  assert.deepEqual(config.arch, ['aarch64', 'amd64']);
  assert.deepEqual(config.map, [{ type: 'addon_config', read_only: true, path: '/config' }]);
  assert.deepEqual(config.services, ['mqtt:want']);
  assert.equal(config.hassio_api, true);
  assert.equal(config.hassio_role, 'default');
  assert.equal(config.stage, 'experimental');
  for (const key of ['host_network', 'host_pid', 'docker_api', 'full_access', 'usb', 'uart', 'gpio', 'homeassistant_api']) assert.ok(!config[key], `${key} must not be enabled`);
  assert.equal(config.privileged, undefined);
  assert.equal(config.devices, undefined);
  assert.equal(config.ingress, true);
  assert.equal(config.ingress_port, 8099);
  assert.equal(config.panel_title, 'IPL Events');
  assert.equal(config.ports, undefined, 'Ingress must not publish a host port');
});

test('Docker runtime is pinned Node22, explicitly installs OpenSSL, and starts built JS without npm', () => {
  const docker = read('app/Dockerfile');
  assert.match(docker, /^FROM node:22\.\d+\.\d+-bookworm-slim(?:@sha256:[a-f0-9]{64})?$/m);
  assert.match(docker, /apt-get install[^\n]*openssl/);
  for (const label of ['io.hass.version', 'io.hass.type', 'io.hass.arch']) assert.ok(docker.includes(label));
  assert.match(docker, /io\.hass\.type="app"/);
  assert.match(docker, /COPY dist\/main\.js/);
  assert.ok(!/\b(?:npm|npx)\b/.test(docker + read('app/run.sh')));
  assert.match(read('app/run.sh'), /exec node \/app\/dist\/main\.js/);
  assert.ok(statSync(join(root, 'app/run.sh')).mode & 0o111);
  execFileSync('/bin/sh', ['-n', join(root, 'app/run.sh')]);
});

test('staging creates a standalone allowlisted context and excludes secrets and checkout dependencies', () => {
  const { dir, repo } = fixture();
  try {
    const target = join(dir, 'independent-context');
    const result = stage(repo, target);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(files(target), stagedFiles.sort());
    for (const path of files(target)) assert.ok(!readFileSync(join(target, path), 'utf8').includes('PACKAGE_SECRET_SENTINEL'));
    assert.deepEqual(JSON.parse(readFileSync(join(target, '.lutron-ipl-package.json'), 'utf8')), { name: 'lutron-ipl', format: 1 });
    const runtime = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    assert.equal(runtime.type, 'module');
    assert.deepEqual(runtime.dependencies, {});
    assert.deepEqual(JSON.parse(readFileSync(join(target, 'package-lock.json'), 'utf8')).packages[''].dependencies, {});
    assert.ok(statSync(join(target, 'run.sh')).mode & 0o111);
    assert.equal(execFileSync(process.execPath, ['dist/main.js'], { cwd: target, encoding: 'utf8' }).trim(), 'standalone-runtime-ok');
    // The default is rooted at the repository, independent of the caller's cwd.
    assert.equal(stage(repo).status, 0);
    assert.ok(existsSync(join(repo, 'build/lutron-ipl/config.yaml')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('staging refuses existing, symlinked, or incomplete contexts without recursive overwrite', () => {
  const { dir, repo } = fixture();
  try {
    const existing = join(dir, 'keep');
    mkdirSync(existing);
    writeFileSync(join(existing, 'keep.txt'), 'keep');
    assert.notEqual(stage(repo, existing).status, 0);
    assert.deepEqual(files(existing), ['keep.txt']);
    const link = join(dir, 'link');
    symlinkSync(existing, link);
    assert.notEqual(stage(repo, link).status, 0);
    const owned = join(dir, 'owned');
    assert.equal(stage(repo, owned).status, 0);
    assert.notEqual(stage(repo, owned).status, 0, 'even an owned package requires a fresh destination');
    rmSync(join(repo, 'dist/main.js'));
    const absent = join(dir, 'absent');
    assert.notEqual(stage(repo, absent).status, 0);
    assert.ok(!existsSync(absent));
    symlinkSync(join(existing, 'keep.txt'), join(repo, 'dist/main.js'));
    assert.notEqual(stage(repo, absent).status, 0, 'do not follow a symlink while packaging');
    assert.ok(!existsSync(absent));
    assert.equal(readFileSync(join(existing, 'keep.txt'), 'utf8'), 'keep');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('staging refuses a dependency-directory symlink before creating a package', () => {
  const { dir, repo } = fixture();
  try {
    const dependencies = join(dir, 'shared-node-modules');
    mkdirSync(dependencies);
    writeFileSync(join(dependencies, 'keep.txt'), 'shared dependencies');
    rmSync(join(repo, 'node_modules'), { recursive: true });
    symlinkSync(dependencies, join(repo, 'node_modules'));
    const target = join(dir, 'release');
    const result = stage(repo, target);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /node_modules.*npm ci/);
    assert.ok(!existsSync(target));
    assert.equal(readFileSync(join(dependencies, 'keep.txt'), 'utf8'), 'shared dependencies');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('repository child names beginning with two dots do not bypass build-only staging', () => {
  const { dir, repo } = fixture();
  try {
    const target = join(repo, '..not-build');
    assert.notEqual(stage(repo, target).status, 0);
    assert.ok(!existsSync(target));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('automation is opt-in and guards state-event readiness before using its received level', () => {
  const example = parse(read('examples/automation.yaml'));
  assert.equal(example.initial_state, false);
  assert.equal(example.triggers[0].trigger, 'state');
  const condition = example.conditions[0].value_template;
  for (const guard of ['trigger.from_state', 'trigger.to_state', 'unavailable', 'unknown', 'level_adjustment', 'ui_level_report']) assert.ok(condition.includes(guard));
  assert.match(example.actions[0].data.brightness_pct, /trigger\.to_state\.attributes\.level/);
});

test('GitHub repository metadata points to the public app store URL and has no duplicate source app', () => {
  const repository = parse(read('repository.yaml'));
  assert.equal(repository.url, 'https://github.com/thetimetraveler/lutron-ipl-app');
  assert.equal(repository.name, 'Lutron IPL Events');
  assert.equal(typeof repository.maintainer, 'string');
  assert.ok(!existsSync(join(root, 'app/config.yaml')), 'source template must not look like a second HA app');
  assert.ok(existsSync(join(root, 'app/manifest.yaml')));
});

test('release script creates one complete install-ready app and refuses existing or symlink destinations', () => {
  const { dir, repo } = fixture();
  try {
    cpSync(join(root, 'scripts/package-release.mjs'), join(repo, 'scripts/package-release.mjs'));
    const run = () => spawnSync(process.execPath, [join(repo, 'scripts/package-release.mjs')], { cwd: tmpdir(), encoding: 'utf8' });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const release = join(repo, 'lutron-ipl');
    assert.deepEqual(files(release), stagedFiles.sort());
    assert.ok(statSync(join(release, 'run.sh')).mode & 0o111);
    assert.equal(execFileSync(process.execPath, ['dist/main.js'], { cwd: release, encoding: 'utf8' }).trim(), 'standalone-runtime-ok');
    for (const path of files(release)) assert.ok(!readFileSync(join(release, path), 'utf8').includes('PACKAGE_SECRET_SENTINEL'));
    writeFileSync(join(release, 'extra.txt'), 'never overwrite me');
    assert.notEqual(run().status, 0);
    assert.equal(readFileSync(join(release, 'extra.txt'), 'utf8'), 'never overwrite me');
    rmSync(release, { recursive: true });
    const untouched = join(dir, 'untouched');
    mkdirSync(untouched);
    writeFileSync(join(untouched, 'keep.txt'), 'keep');
    symlinkSync(untouched, release);
    assert.notEqual(run().status, 0);
    assert.deepEqual(files(untouched), ['keep.txt']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('tracked App store release is complete, current, and starts from a detached context', () => {
  const release = join(root, 'lutron-ipl');
  assert.deepEqual(files(release), stagedFiles.sort());
  assert.equal(readFileSync(join(release, 'config.yaml'), 'utf8'), read('app/manifest.yaml'));
  for (const path of ['Dockerfile', 'run.sh', 'README.md', 'DOCS.md', 'CHANGELOG.md']) {
    assert.equal(readFileSync(join(release, path), 'utf8'), read(`app/${path}`), `${path} release is stale`);
  }
  assert.match(read('lutron-ipl/DOCS.md'), /\/app_configs\/<full-app-slug>/);
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'ipl-release-runtime-'));
  try {
    const detached = join(dir, 'app');
    cpSync(release, detached, { recursive: true });
    assert.ok(!existsSync(join(detached, 'node_modules')));
    assert.match(execFileSync(process.execPath, ['dist/main.js', '--help'], { cwd: detached, encoding: 'utf8' }), /Lutron IPL Events/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
