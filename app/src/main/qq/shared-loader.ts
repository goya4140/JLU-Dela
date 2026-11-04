import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve, sep } from 'node:path';

const load = createRequire(__filename);
const archive = join(process.resourcesPath, 'app/application.asar');
let originalMain = './application.asar/app_launcher/index.js';
try {
  const config = JSON.parse(readFileSync(join(__dirname, 'bootstrap.json'), 'utf8')) as {
    originalMain: string;
    bridge: string;
    workdir: string;
  };
  const entry = resolve(process.resourcesPath, 'app', config.originalMain);
  if (!entry.startsWith(`${archive}${sep}`)) throw new Error('Invalid QQ native entry');
  originalMain = config.originalMain;
  process.env['NAPCAT_WORKDIR'] = config.workdir;
  process.env['NAPCAT_DISABLE_MULTI_PROCESS'] = '1';
  process.env['NAPCAT_DISABLE_PIPE'] = '1';
  load(join(config.bridge, 'napcat.cjs'));
} catch (error) {
  console.error('Dela QQ bridge failed to load; starting native QQ', error);
}
load(join(process.resourcesPath, 'app', originalMain));
setImmediate(() => {
  const launcher = (
    globalThis as typeof globalThis & {
      launcher?: { installPathPkgJson: { main: string } };
    }
  ).launcher;
  if (launcher) launcher.installPathPkgJson.main = originalMain;
});
