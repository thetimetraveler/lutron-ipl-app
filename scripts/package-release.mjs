import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, constants, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'lutron-ipl');
const allowlist = ['.lutron-ipl-package.json', 'CHANGELOG.md', 'DOCS.md', 'Dockerfile', 'README.md', 'THIRD_PARTY.md', 'config.yaml', 'dist/main.js', 'examples/automation.yaml', 'examples/options.json', 'package-lock.json', 'package.json', 'run.sh'];

function inventory(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Refusing symlink in staged release');
    if (entry.isDirectory()) return inventory(join(directory, entry.name), `${prefix}${entry.name}/`);
    if (!entry.isFile()) throw new Error('Refusing nonregular staged release input');
    return [`${prefix}${entry.name}`];
  }).sort();
}

try {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/package-release.mjs');
  // Refuse owned and unowned folders, extras, and symlinks equally. No automatic
  // recursive deletion/overwrite is allowed for the tracked public release.
  try { lstatSync(output); throw new Error('lutron-ipl already exists; review and move the previous release before rebuilding'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const build = join(root, 'build');
  try {
    const stat = lstatSync(build);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe build directory');
  } catch (error) { if (error.code === 'ENOENT') mkdirSync(build); else throw error; }
  const fresh = mkdtempSync(join(build, '.release-'));
  const staged = join(fresh, 'lutron-ipl');
  const result = spawnSync(process.execPath, [join(root, 'scripts/stage.mjs'), staged], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Staging failed');
  if (JSON.stringify(inventory(staged)) !== JSON.stringify([...allowlist].sort())) throw new Error('Staged release inventory differs from allowlist');
  const marker = JSON.parse(readFileSync(join(staged, '.lutron-ipl-package.json'), 'utf8'));
  if (marker.name !== 'lutron-ipl' || marker.format !== 1) throw new Error('Invalid staged package marker');
  mkdirSync(output);
  for (const path of allowlist) {
    mkdirSync(dirname(join(output, path)), { recursive: true });
    copyFileSync(join(staged, path), join(output, path), constants.COPYFILE_EXCL);
  }
  chmodSync(join(output, 'run.sh'), 0o755);
  console.log('Created install-ready lutron-ipl/ from a fresh allowlisted stage. Review before committing/publishing.');
  console.log(`Staging source retained for inspection: ${staged}`);
} catch (error) {
  console.error(`Release packaging failed: ${error.message}`);
  process.exitCode = 1;
}
