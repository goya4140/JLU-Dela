# Windows 安装、打包与测试

## 下载安装

面向 Windows 10 / 11 x64。下载 [安装程序](https://github.com/goya4140/JLU-Dela/releases/download/v0.1.0-alpha.9/JLU-Dela-0.1.0-alpha.9-win-x64-setup.exe)，运行并选择安装位置；首次启动按引导连接校园平台，模型配置可以跳过。

这是未签名开发预览，系统可能提示无法验证发布者。请先确认文件来自[本仓库 Release](https://github.com/goya4140/JLU-Dela/releases/tag/v0.1.0-alpha.9)，并核对同页 SHA256SUMS。不要关闭系统安全防护；如出现恶意软件或文件损坏提示，请保留提示并反馈。

升级前保存笔记、邮件草稿与作业网页中的填写内容，再退出旧版本。安装包与源码同页提供，尚不承诺自动更新。

面向需要在 Windows 上验证 JLU Dela 的维护者。macOS 侧流程见 [README](../README.md) 的「本地开发与验证」，本文只记录 Windows 特有的步骤、已知问题与验收清单。

## 环境

- Windows 10 / 11 x64
- Node.js 与 pnpm 按 [`.node-version`](../.node-version) 与 [`package.json`](../package.json)（当前 Node 24.22.1、pnpm 12.3.4）
- 首次打包会额外下载约 40 MB 的 MinGit 与 electron-builder 二进制，注意网络

```powershell
pnpm install --frozen-lockfile
pnpm prepare:runtime     # 下载 MinGit 到 .build\mingit（只需一次）
pnpm package:dir         # 产出 dist\win-unpacked\JLU-Dela.exe，可直接双击
pnpm package:dist        # 产出 dist\JLU-Dela-<版本>-win-x64-setup.exe（NSIS 安装包）
```

`package:dist` 会把约 600 MB 的产物压缩成约 170 MB，通常需要 3 到 5 分钟，属正常现象。

## 国内网络

两个下载源都可能超时：

| 下载内容                           | 处理                                                                 |
| ---------------------------------- | -------------------------------------------------------------------- |
| MinGit                             | `scripts/prepare-runtime.ts` 已优先使用 npmmirror，失败再回落 GitHub |
| electron-builder 二进制（NSIS 等） | 打包前设置镜像与关闭签名探测                                         |

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
pnpm package:dist
```

## 已知问题

- **未签名**：安装包没有代码签名，Windows 会提示「已保护你的电脑」，需从「更多信息」进入「仍要运行」。这是当前发布状态，不是缺陷。
- **首次打包偶发 `EPERM: operation not permitted, rename 'dist\win-unpacked.tmp'`**：杀毒或索引服务占用文件所致，删除 `dist` 后重跑即可。
- **`dist` 目录不提交**：已在 `.gitignore` 中忽略，安装包通过文件传输或 CI 产物分发。

## 已验证记录

2026-10-31，`0.1.0-alpha.7`，win-x64：

| 环节       | 做法                                              | 结果                                                     |
| ---------- | ------------------------------------------------- | -------------------------------------------------------- |
| 目录版启动 | `dist\win-unpacked\JLU-Dela.exe --smoke-test`     | 通过：SQLite、渲染层、预加载隔离、Agent 运行时、Bash PTY |
| 安装       | `JLU Dela-0.1.0-alpha.7-win-x64.exe /S /D=<目录>` | 退出码 0，文件与卸载程序齐全                             |
| 安装后启动 | 安装目录内 `JLU-Dela.exe --smoke-test`            | 通过，与目录版一致                                       |
| 卸载       | `Uninstall JLU-Dela.exe /S`                       | 退出码 0，安装目录清空                                   |

产物：安装包 168.96 MB，`dist` 内另含 `.blockmap` 与 `latest.yml`（自动更新元数据）。

## 手工验收清单

自动化冒烟只覆盖启动与运行时，以下项目需要人工确认：

| #   | 项目                 | 关注点                                                        |
| --- | -------------------- | ------------------------------------------------------------- |
| 1   | 首次启动与引导       | 工作区目录选择、跳过配置、重启后继续                          |
| 2   | 终端                 | `ls`、`git --version`、`ssh -V`（依赖随包 MinGit 与 OpenSSH） |
| 3   | 知识库               | 连接中文名、含空格的文件夹，检索并打开 PDF                    |
| 4   | 课表 / 通知 / 学习通 | 连接窗口、统一认证、断网后保留缓存                            |
| 5   | 吉大邮箱             | 连接后切换已发送与垃圾邮件，发送带中文附件的邮件              |
| 6   | Agent                | 选择模型后要求读取本地文件并总结（验证工具调用）              |
| 7   | 窗口与托盘           | 关闭到托盘、右键菜单、退出                                    |
| 8   | 本机网页端           | `pnpm web`，桌面端与网页端共用学习数据                        |
| 9   | 显示适配             | 125% / 150% 缩放，窗口拖到最窄                                |
| 10  | 安装包               | 自定义目录、快捷方式、卸载残留                                |

反馈请附：版本、Windows 版本、复现步骤、期望与实际、截图；必要时附 `%APPDATA%\JLU-Dela\dela.db`。

## 与 macOS 的差异

- 终端走 MinGit 的 Bash 与随包 OpenSSH，不是系统 Bash；命令行为与 macOS 有细微差别。
- 打包目标只有 `nsis`（x64），没有 dmg/zip；发布产物由 GitHub Actions 生成。
- 关闭窗口默认最小化到托盘，退出需要走托盘菜单。
