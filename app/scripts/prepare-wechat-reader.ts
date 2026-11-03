import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const commit = 'fb6a42c34160d2ffa66ed5f114f8d8cdabe7f5f9';
const directory = resolve('.build/wechat-reader');
await mkdir(directory, { recursive: true, mode: 0o700 });
for (const [file, expected] of [
  ['projects/rion-wechat-reader/rion_wechat_reader.py', '158e794ba109b2bdf9dd585954bb77724bd9dfb7'],
  ['LICENSE', 'be3f7b28e564e7dd05eaf59d64adba1a4065ac0e'],
]) {
  const response = await fetch(
    `https://raw.githubusercontent.com/Rion-Wu-tech/wechat-intelligence-hub/${commit}/${file}`,
  );
  if (!response.ok) throw new Error('微信 Reader 下载失败');
  const body = Buffer.from(await response.arrayBuffer());
  const sha = createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
  if (sha !== expected) throw new Error('微信 Reader 源码校验失败');
  await writeFile(join(directory, file.split('/').at(-1)!), body);
}
execFileSync('uv', ['venv', '--allow-existing', '--python', '3.12', join(directory, 'venv')], {
  stdio: 'inherit',
});
execFileSync(
  'uv',
  [
    'pip',
    'install',
    '--python',
    join(directory, 'venv/bin/python'),
    '--only-binary',
    ':all:',
    'sqlcipher3==0.6.2',
    'zstandard==0.25.0',
  ],
  { stdio: 'inherit' },
);
execFileSync(
  join(directory, 'venv/bin/python'),
  [join(directory, 'rion_wechat_reader.py'), 'self-test', '--require-sqlcipher'],
  { stdio: 'inherit' },
);
await writeFile(
  join(directory, 'source.json'),
  JSON.stringify({ repository: 'Rion-Wu-tech/wechat-intelligence-hub', commit }),
);
console.log('微信只读 Reader 已准备；未获取密钥，未修改或重启微信。');
