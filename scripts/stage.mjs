import { chmodSync, copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync, constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputFiles = [
  ['app/manifest.yaml', 'config.yaml'],
  ['app/Dockerfile', 'Dockerfile'],
  ['app/run.sh', 'run.sh'],
  ['app/README.md', 'README.md'],
  ['app/DOCS.md', 'DOCS.md'],
  ['app/CHANGELOG.md', 'CHANGELOG.md'],
  ['dist/main.js', 'dist/main.js'],
  ['THIRD_PARTY.md', 'THIRD_PARTY.md'],
  ['examples/options.json', 'examples/options.json'],
  ['examples/automation.yaml', 'examples/automation.yaml'],
];

// Validate every component: packaging must never follow a source symlink.
function regularSource(path) {
  const parts = path.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const stat = lstatSync(join(root, ...parts.slice(0, i)));
    if (stat.isSymbolicLink() || (i < parts.length ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error(`Unsafe package input: ${path}`);
    }
  }
}
function ensureSafeAncestors(target) {
  const parent = dirname(target);
  if (parent === target) throw new Error('Refusing filesystem root as package destination');
  const parts = parent.split('/').filter(Boolean);
  let cursor = '/';
  for (const part of parts) {
    cursor = join(cursor, part);
    try {
      const stat = lstatSync(cursor);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe destination ancestor: ${cursor}`);
    } catch (error) {
      if (error.code === 'ENOENT') mkdirSync(cursor);
      else throw error;
    }
  }
}

try {
  if (process.argv.length > 3) throw new Error('Usage: node scripts/stage.mjs [fresh-destination]');
  const target = process.argv[2] ? resolve(process.argv[2]) : join(root, 'build/lutron-ipl');
  if (/^\/(?:addons|addon_configs)(?:\/|$)/.test(target)) throw new Error('Refusing a live HA path; stage locally, then transfer manually');
  const fromRoot = relative(root, target);
  const outsideRoot = fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
  if (!fromRoot || (!outsideRoot && !fromRoot.startsWith(`build${sep}`))) {
    throw new Error('Inside the repository, stage only into a fresh build/ subdirectory');
  }
  for (const [source] of inputFiles) regularSource(source);
  regularSource('package.json');
  const packageInfo = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const runtime = { name: 'lutron-ipl-app-runtime', version: packageInfo.version, private: true, type: 'module', dependencies: {} };
  ensureSafeAncestors(target);
  // Exclusive directory creation deliberately refuses ALL existing paths,
  // including packages with our marker. There is no recursive overwrite/delete.
  mkdirSync(target);
  for (const [source, destination] of inputFiles) {
    const output = join(target, destination);
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(join(root, source), output, constants.COPYFILE_EXCL);
  }
  chmodSync(join(target, 'run.sh'), 0o755);
  const json = value => `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(join(target, 'package.json'), json(runtime), { flag: 'wx' });
  writeFileSync(join(target, 'package-lock.json'), json({ name: runtime.name, version: runtime.version, lockfileVersion: 3, requires: true, packages: { '': { name: runtime.name, version: runtime.version, dependencies: {} } } }), { flag: 'wx' });
  writeFileSync(join(target, '.lutron-ipl-package.json'), json({ name: 'lutron-ipl', format: 1 }), { flag: 'wx' });
  console.log(`Staged ${target}; transfer manually to /addons/lutron-ipl. Credentials are not included.`);
} catch (error) {
  console.error(`Staging failed: ${error.code === 'EEXIST' ? 'destination already exists; choose a fresh directory' : error.message}`);
  process.exitCode = 1;
}
