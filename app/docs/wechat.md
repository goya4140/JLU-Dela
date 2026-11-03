# 微信窗口镜像（实验）

保持微信原客户端不变，让工作台显示用户选中的原生窗口。登录、回复、下载文件仍由原微信完成；Dela 不创建另一份微信登录，不修改安装包、签名或用户数据，不加载插件，也不读取消息数据库或登录密钥。

第一版是显示原型。点击侧栏「微信窗口」进入工作台标签，再点击「选择微信窗口」，通过 macOS 系统选择器选择微信的单个窗口。画面只在本机显示，没有录制、上传或交给 AI 的功能。选择整个屏幕会被拒绝。停止镜像、切换标签、离开工作台或隐藏 Dela 时释放画面流。

目前需要 macOS 15 或以上版本。该限制来自 Electron 的实验性系统选择器；不可用时拒绝自动选择其他来源。选择器由系统提供，Dela 不能自动核实所选窗口属于微信，需用户选对窗口。镜像跟随原窗口切换聊天，不能固定多个群；保持原微信窗口打开，最小化、关闭或系统休眠可能使画面暂停或结束。

这不等于消息级接入。群过滤、直接回复、聊天记录检索、自动总结、待办提取尚未实现。后续需要逐项验证系统允许的交互能力；不以修改微信或提取密钥作为默认方案。

## 验证

`pnpm smoke:wechat` 使用合成视频流验证工作台显示、拒绝整屏、取消选择、停止、隐藏及导航后的释放，并检查四档窗口宽度。不启动微信、不请求真实窗口授权，不代表真实微信镜像已验收。

构建后可用 `pnpm preview:wechat` 打开独立预览，或直接运行 `node scripts/run-ts-smoke.ts wechat-preview`。预览使用当前工作区 `.build/wechat-preview` 内的独立数据目录，不复用已安装 Dela 的资料和登录。首次按正常引导进入，可跳过校园和模型配置。

真实验证由用户在系统选择器中授权，只选微信窗口，并检查同步显示、切换聊天、停止、最小化及关闭后的行为。微信安装包的签名和内容应保持不变。当前分支不会自动替换已安装的 QQ 实验版。

依据：[Electron 桌面捕获](https://www.electronjs.org/docs/latest/api/desktop-capturer)、[系统选择器](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts)、[Apple ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)。
