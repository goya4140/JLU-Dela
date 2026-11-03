import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve('.');
const preview = join(root, '.build/wechat-preview');
mkdirSync(preview, { recursive: true });
(app as typeof app & { setAppPath(path: string): void }).setAppPath(root);
app.setPath('appData', preview);
for (const name of ['home', 'documents'] as const) {
  const directory = join(preview, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
console.log(`WeChat mirror preview uses an isolated profile: ${preview}`);
const require = createRequire(join(root, 'package.json'));
require(join(root, 'out/main/index.cjs'));
