const { app } = require('electron');
const { resolve, join } = require('node:path');
const { mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const root = resolve(__dirname, '..');
app.setAppPath(root);
let connected = false;
const attachWindow = (_event, window) => {
  window.webContents.once('did-finish-load', () => {
    if (window.webContents.getURL() !== pathToFileURL(join(root, 'out/renderer/index.html')).href)
      return;
    app.off('browser-window-created', attachWindow);
    const { startWebHost } = require(join(root, 'out/web/host.cjs'));
    void startWebHost(window, join(root, 'out/renderer'))
      .then((service) => {
        connected = true;
        mkdirSync(join(root, '.build'), { recursive: true });
        writeFileSync(
          join(root, '.build/web-connection.json'),
          JSON.stringify({ url: service.url, origin: service.origin }),
          { mode: 0o600 },
        );
        console.log(
          `JLU Dela Web: ${service.origin}\n连接链接保存在 .build/web-connection.json，请在浏览器中打开其中的 url。`,
        );
        app.on('will-quit', () => {
          service.server.close();
          rmSync(join(root, '.build/web-connection.json'), { force: true });
        });
      })
      .catch((error) => {
        console.error(error);
        app.quit();
      });
  });
};
app.on('browser-window-created', attachWindow);
process.once('SIGTERM', () => app.quit());
process.once('SIGINT', () => app.quit());
app.on('will-quit', () => {
  if (!connected)
    console.error('网页服务未启动；如桌面 Dela 已在运行，请先退出，再运行 pnpm web。');
});
require(join(root, 'out/main/index.cjs'));
