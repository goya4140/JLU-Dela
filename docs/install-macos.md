# 安装 JLU Dela · macOS

当前为 `0.1.0-alpha.8` 开发预览，适用于 macOS 13 及以上、Apple Silicon（M 系列芯片）的 Mac。Intel Mac 不在本次安装包的支持范围。

## 下载与安装

1. 在 [GitHub Release](https://github.com/goya4140/JLU-Dela/releases/tag/v0.1.0-alpha.8) 下载 [DMG 安装包](https://github.com/goya4140/JLU-Dela/releases/download/v0.1.0-alpha.8/JLU-Dela-0.1.0-alpha.8-mac-arm64.dmg)。ZIP 是相同版本的备用压缩包。
2. 打开 DMG，将 `JLU-Dela.app` 拖到「应用程序 / Applications」。
3. 从「应用程序」启动，按向导阅读使用须知、按需连接校园平台。只使用本地资料或校园功能可以跳过模型配置。

升级前请保存笔记、邮件草稿和学校网页中的作答，再退出旧版本。替换 App 会保留 `~/Library/Application Support/JLU-Dela/` 中的状态及既有资料目录；备份这些位置可保留一份独立副本。

## 首次打开与签名状态

此预览包尚未做 Developer ID 签名和 Apple 公证，macOS 可能提示无法验证开发者。

仅在确认文件来自本仓库、校验值一致并愿意使用此预览版时，按 [Apple 的应用打开说明](https://support.apple.com/zh-cn/102445)，在「系统设置 → 隐私与安全性」中查看对应应用的打开选项。若系统提示文件已损坏或含恶意软件，请保留提示并反馈，勿关闭整个系统的安全检查。

## 校验与验证范围

Release 附有 `SHA256SUMS` 和 `source-commit.txt`。在下载文件所在目录执行：

```sh
shasum -a 256 JLU-Dela-0.1.0-alpha.8-mac-arm64.dmg
```

将结果与 `SHA256SUMS` 中同名文件的值比较。校验值可检测下载是否一致，不能代替开发者签名。

发布检查覆盖构建、单元测试、校园与学习流程的合成数据测试，以及 DMG / ZIP 完整性和归档内应用的隔离启动。真实账号权限、学校改版和不同网络环境仍可能影响连接；模型服务需自行配置。本次不承诺 Intel Mac、自动更新或所有课程页面均已适配。

首次配置、各平台登录和常见问题见 [使用指南](user-guide.md)。
