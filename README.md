# JLU Dela

面向吉林大学本科生的本地学习工作台，基于 [Chang-Yo/Dela](https://github.com/Chang-Yo/Dela) 的公开 Fork。非吉林大学官方产品。

**当前版本：`0.1.0-alpha.2`，优先 macOS Apple Silicon。**

## 现在能做什么

- 继承 Dela 的本地项目、资料导入与预览、笔记、终端和 Agent 工作台；模型服务需要自行配置。
- 「课表」已实现吉大教务接入预览：本人在独立学校登录窗口完成认证后，读取个人课表、校历、节次与调停课信息，存入本地缓存并供周/月日历和 Agent 查询。
- 已用本人登录后的真实会话验证课表同步，以及彻底退出重开后的再次联网同步。自动化检查使用人工数据；其他账号、系统重启和长期会话过期尚未验收。
- 课程资料、通知及课程回放的自动同步仍为**待接入**，对应入口在系统浏览器中打开学校平台。
- 上游 Canvas、交大课堂视频、邮箱与水源等校园命令不向 Agent 开放；首次配置不要求交大身份。

## 本地开发

使用 [`.node-version`](.node-version) 指定的 Node.js 和 [`package.json`](package.json) 指定的 pnpm。当前为 Node.js `24.22.1`、pnpm `12.3.4`。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

| 命令                   | 用途                                          |
| ---------------------- | --------------------------------------------- |
| `pnpm check`           | 格式、lint、类型检查、构建与单元测试          |
| `pnpm smoke`           | 真实 Electron 基础冒烟                        |
| `pnpm smoke:jlu`       | 隔离数据目录，验证吉大入口与接入状态          |
| `pnpm smoke:timetable` | 人工数据验证登录、同步、日历与失败保留缓存    |
| `pnpm package:mac`     | 构建 Apple Silicon 开发预览 DMG / ZIP，不发布 |

开发预览包未配置 Developer ID 签名与公证，暂不作为正式发行版。Intel Mac 尚未验证。推送和 PR 自动运行 macOS CI；需要安装包时，手动运行 Actions 的 **macOS development packages**，从对应运行的 Artifacts 下载。该工作流不自动发布 GitHub Release。

## 使用课表

打开「课表」，点击「登录并同步」，在学校自己的登录页面中完成认证。账号密码不需要填写到聊天或配置文件；校外可能需要连接学校 VPN。同步完成后可切换学期和教学周；Agent 通过 `dela query_schedule` 读取同一份本地缓存。

节次与开学日期来自教务响应，不沿用上游交大时间表。缺失或无法识别的必需数据不会覆盖旧课表；调停课等附加信息不可用时，界面与 Agent 的 coverage 都会提示缺口。成绩、培养方案与选课操作不在此次接入范围。

## 校园适配

| 来源                                                                   | 首版目标                 | 状态                           |
| ---------------------------------------------------------------------- | ------------------------ | ------------------------------ |
| [教务系统](https://iedu.jlu.edu.cn/jwapp/sys/emaphome/portal/index.do) | 本科课表                 | 接入预览，已验证同步及退出重开 |
| [电子校务平台](https://oa.jlu.edu.cn/defaultroot/login.jsp?access=oa)  | 学校通知                 | 待验证栏目、可见范围与脱敏响应 |
| [学在吉大](https://ilearntec.jlu.edu.cn/studycenter-web/index#/)       | 课程资料、课表、课程回放 | 待验证平台实际能力与脱敏响应   |

入口由项目发起人提供，不代表已验证数据接口。成绩与培养方案暂不纳入首版。

后续材料与验收标准见 [吉大接入计划](docs/jlu-integration.md)。上游架构见 [开发文档](docs/DEVELOPMENT.md)，其中校园接口和原发布流程仅供参考。

## 数据与更新

- 应用数据：`~/Library/Application Support/JLU-Dela/`。
- 默认资料目录：`~/Documents/JLU-Dela/`，可在设置中更改。
- 内置与自定义技能：`~/.jlu-dela/skills/`。
- 更新配置与下载入口指向本仓库；不使用上游 Dela 的更新分发源。签名、公证与稳定更新发布留待正式发行阶段。

这些目录与上游独立。内部 `window.dela` API、`dela` 命令和数据库文件名暂沿用，以减少对上游工作台的改动。仓库中保留未适配模块用于后续迁移，不表示它们已支持吉大。

## 来源与许可

基于上游提交 [`ad571996817bfb345fcbb372a7f2edff1080d885`](https://github.com/Chang-Yo/Dela/commit/ad571996817bfb345fcbb372a7f2edff1080d885) 初始化，保留 Git 历史及 [GPL-3.0-or-later](LICENSE) 许可。Dela 的代码、图标和其他素材归其原作者所有，当前界面暂沿用 Dela 标识并注明来源。

[贡献指南](CONTRIBUTING.md) · [问题反馈](https://github.com/goya4140/JLU-Dela/issues) · [使用说明](docs/terms.md) · [隐私说明](docs/privacy.md)
