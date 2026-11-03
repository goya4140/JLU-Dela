import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

function prepareMacosIcons(outputDirectory: string) {
  if (process.platform !== 'darwin') return;
  mkdirSync(outputDirectory, { recursive: true });
  // 与系统图标的可见底板对齐：1024 画布中主体占 824，四周各留 100 透明像素。
  for (const name of ['white', 'black']) {
    const filename = `JLU-Dela-${name}.png`;
    const destination = resolve(outputDirectory, filename);
    execFileSync(
      '/usr/bin/sips',
      ['-z', '824', '824', resolve('assets', filename), '--out', destination],
      { stdio: 'pipe' },
    );
    execFileSync('/usr/bin/sips', ['-p', '1024', '1024', destination, '--out', destination], {
      stdio: 'pipe',
    });
  }
}

export default defineConfig({
  envDir: false,
  plugins: [
    {
      name: 'macos-icons',
      buildStart() {
        this.addWatchFile(resolve('src/main/wechat/native/database.py'));
        this.addWatchFile(resolve('src/main/wechat/native/accessibility.swift'));
        if (process.platform === 'darwin')
          for (const name of ['white', 'black'])
            this.addWatchFile(resolve('assets', `JLU-Dela-${name}.png`));
      },
      writeBundle(output) {
        prepareMacosIcons(resolve(output.dir!, 'icons'));
        if (process.platform === 'darwin') {
          const directory = resolve(output.dir!, 'native');
          mkdirSync(directory, { recursive: true });
          copyFileSync(
            'src/main/wechat/native/database.py',
            resolve(directory, 'wechat-database.py'),
          );
          execFileSync(
            '/usr/bin/xcrun',
            [
              'swiftc',
              '-O',
              'src/main/wechat/native/accessibility.swift',
              '-o',
              resolve(directory, 'wechat-accessibility'),
            ],
            { stdio: 'pipe' },
          );
        }
      },
    },
  ],
  build: {
    target: 'node24',
    outDir: 'out/main',
    lib: {
      entry: { index: 'src/main/index.ts', 'qq-shared-loader': 'src/main/qq/shared-loader.ts' },
      formats: ['cjs'],
      fileName: (_format, name) => `${name}.cjs`,
    },
    rolldownOptions: {
      external: [
        'electron',
        'electron-updater',
        // Pi 运行时依赖：保持外部 require，
        // 打包时随 node_modules 收进 asar。正则同时覆盖子路径导入
        // （如 pi-ai/api/openai-completions）；rolldown 的字符串 external 不匹配子路径。
        /^@earendil-works\//,
        'openai',
        'typebox',
        'better-sqlite3',
        'node-pty',
        'imapflow',
        'nodemailer',
        ...builtinModules,
        /^node:/,
      ],
    },
  },
});
