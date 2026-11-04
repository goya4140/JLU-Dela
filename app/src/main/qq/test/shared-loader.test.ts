import { join } from 'node:path';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'vite';
import { describe, expect, it, vi } from 'vitest';

const bundle = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    lib: { entry: join(import.meta.dirname, '../shared-loader.ts'), formats: ['cjs'] },
    rolldownOptions: { external: /^node:/ },
  },
});
const output = (Array.isArray(bundle) ? bundle[0]! : bundle) as { output: { code: string }[] };
const code = output.output[0]!.code;
const resources = path.resolve('/Applications/QQ.app/Contents/Resources');
const nativeEntry = join(resources, 'app/application.asar/app_launcher/index.js');
const config = {
  originalMain: './application.asar/app_launcher/index.js',
  bridge: '/bridge',
  workdir: '/bridge/data',
};

function launch(bootstrap: unknown, bridgeFails = false) {
  const load = vi.fn((entry: string) => {
    if (entry === join(config.bridge, 'napcat.cjs') && bridgeFails)
      throw new Error('bridge unavailable');
  });
  const context = {
    exports: {},
    __filename: '/bridge/loader.cjs',
    __dirname: '/bridge',
    process: { resourcesPath: resources, env: {} },
    console: { error: vi.fn() },
    launcher: { installPathPkgJson: { main: 'loader.cjs' } },
    setImmediate: (callback: () => void) => callback(),
    require: (name: string) => {
      if (name === 'node:path') return path;
      if (name === 'node:module') return { createRequire: () => load };
      if (name === 'node:fs')
        return {
          readFileSync: () => {
            if (bootstrap === null) throw new Error('bootstrap missing');
            return typeof bootstrap === 'string' ? bootstrap : JSON.stringify(bootstrap);
          },
        };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  runInNewContext(code, context);
  return { load, context };
}

describe('QQ native startup', () => {
  it('loads the bridge and original QQ in the same process', () => {
    const { load, context } = launch(config);
    expect(load.mock.calls).toEqual([[join(config.bridge, 'napcat.cjs')], [nativeEntry]]);
    expect(context.launcher.installPathPkgJson.main).toBe(
      './application.asar/app_launcher/index.js',
    );
  });

  it.each([null, '{invalid', { ...config, originalMain: '../../other/loader.cjs' }])(
    'starts native QQ when shared bootstrap is missing, corrupt, or points to another loader: %j',
    (bootstrap) => {
      const { load, context } = launch(bootstrap);
      expect(load.mock.calls).toEqual([[nativeEntry]]);
      expect(context.console.error).toHaveBeenCalledOnce();
    },
  );

  it('starts native QQ when the bridge throws', () => {
    const { load } = launch(config, true);
    expect(load.mock.calls.at(-1)).toEqual([nativeEntry]);
  });
});
