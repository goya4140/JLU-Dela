import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

assert.equal(process.platform, 'win32', 'Run Windows package verification on Windows');
assert.equal(process.arch, 'x64', 'The Windows release targets x64');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] || join(root, 'dist'));
const bundle = join(output, 'win-unpacked');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const installer = join(output, `JLU-Dela-${version}-win-x64-setup.exe`);
assert.ok(existsSync(installer), 'Missing NSIS installer');
for (const tool of ['rg', 'fd']) {
  const executable = join(bundle, 'resources/bin', `${tool}.exe`);
  assert.deepEqual(readFileSync(executable), readFileSync(join(root, 'vendor/bin', `${tool}.exe`)));
  execFileSync(executable, ['--version'], { timeout: 5000, stdio: 'inherit' });
}
for (const executable of ['mingit/usr/bin/bash.exe', 'openssh/ssh.exe'])
  assert.ok(existsSync(join(bundle, 'resources', executable)), `Missing ${executable}`);
execFileSync(join(bundle, 'JLU-Dela.exe'), ['--smoke-test'], {
  timeout: 60000,
  stdio: 'inherit',
});
const directory = mkdtempSync(join(tmpdir(), 'jlu-installed-'));
execFileSync(installer, ['/S', `/D=${directory}`], { timeout: 120000, stdio: 'inherit' });
assert.deepEqual(
  readFileSync(join(directory, 'resources/app.asar')),
  readFileSync(join(bundle, 'resources/app.asar')),
  'Installed app code differs from the verified directory package',
);
execFileSync(join(directory, 'JLU-Dela.exe'), ['--smoke-test'], {
  timeout: 60000,
  stdio: 'inherit',
});
const uninstaller = readdirSync(directory).find(
  (name) => name.startsWith('Uninstall') && name.endsWith('.exe'),
);
assert.ok(uninstaller, 'Missing uninstaller');
execFileSync(join(directory, uninstaller), ['/S'], { timeout: 60000, stdio: 'inherit' });
for (let attempt = 0; attempt < 100 && existsSync(join(directory, 'JLU-Dela.exe')); attempt++)
  await new Promise((resolve) => setTimeout(resolve, 200));
assert.ok(!existsSync(join(directory, 'JLU-Dela.exe')), 'Uninstall did not remove the app');
console.log(
  'Windows package verified: tools, directory app launch, NSIS install, installed app launch and uninstall. Isolated synthetic smoke profiles only.',
);
