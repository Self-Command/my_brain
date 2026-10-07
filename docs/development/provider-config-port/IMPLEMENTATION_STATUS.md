# 通用配置：实现、使用与验证

2026-10-07 · 用户批准的移动测试版范围。所有类型检查、测试、Expo 导出、Gradle 构建、APK 检查、模拟器验证和发布均在 GitHub Actions；本机仅编辑、阅读与 Git 操作。

用户后续明确要求立即发布现有测试包，自行验证交互并反馈，因此交互不再是本次发布前置门槛。`Publish Provider Test APK` 在 Actions 下载已通过代码与包检查的 artifact，核对报告 SHA 与 APK SHA、签名和 SHA256 后直接发布 Prerelease；发布目标为 APK 实际源码提交，不能使用发布脚本提交替代包来源。后续 Android 流程默认跳过交互，可显式启用。

## 实际模块

| 模块 | 职责 |
| --- | --- |
| `packages/core/src/providers/serviceConfig.ts` | ServiceProfile / ProviderSettingsV2、角色、24 小时修订验证、公共 HTTPS 地址校验、显式 LLM 工厂 |
| `packages/core/src/providers/serviceCatalog.ts` | `/models` 目录、同源分页、错误分类、去重、取消与查询上限 |
| `packages/core/src/providers/ttsProtocol.ts` | Speech PCM、MiMo 音频 Chat SSE、24 kHz PCM 分帧和严格 Base64 |
| `apps/mobile/services/providerProfiles.ts` | 配置持久化、迁移 journal、旧副本、密钥复制后激活、并发迁移隔离 |
| `apps/mobile/services/secureCredentialStore.ts` | profile 独立安全凭据、旧别名兼容、密钥修订使验证失效 |
| `apps/mobile/services/providerCatalogStore.ts` | 24 小时 / 8 份非敏感缓存；按 profile、协议、地址和密钥修订隔离 |
| `apps/mobile/components/providers/UniversalProviderSettings.tsx` | 多配置、搜索 / 选择 / 手填、目录刷新、实际验证、试听 / 停止、显式启用 |
| `apps/mobile/services/configuredLlm.ts` | 解释与陪聊的同一配置入口、请求快照和取消、原临时会话与保存门控 |
| `apps/mobile/radar/mobileRadarRuntime.ts` | 雷达使用同一共享 LLM 工厂；新闻抓取策略保持原实现 |
| `apps/mobile/modules/provider-http/` | Android 原生 HTTPS 分块传输；拒绝重定向、取消、超时与大小限制 |
| `apps/mobile/voice/ttsPlayback.ts` | 复用原 Pipeline PCM 播放，等待设备结束事件，取消网络 / 队列 / 播放与旧回调 |
| `apps/mobile/voice/VoiceSession.ts` | 豆包实时和设备识别组合模式互斥，最终转写进入原意图出口 |

React Native 0.76 的标准 fetch 无可靠的 Android 流式正文读取；新增的小型 Expo 本地模块只包装 HttpURLConnection，不包含服务商 SDK、录音存储或业务逻辑。播放器继续使用既有 `@edkimmel/expo-audio-stream`，没有复制来源项目的 AudioTrack 或会话引擎。真实设备听感单列未验收。

Android 11+ 的识别服务可见性声明已加入 Manifest，并在 APK 中检查；识别轮次在最终结果或错误后重启，避免 onSpeechEnd 提前开启新轮丢掉最终转写。依据 [Android SpeechRecognizer 官方约束](https://developer.android.com/reference/android/speech/SpeechRecognizer)。

## 配置方式

1. 在提供商设置填写语言模型的公网 HTTPS Base URL、Key 和模型 ID。地址允许保留自定义路径前缀；例如 `https://example.com/proxy/v1`。点击“保存配置与 Key”后自动获取支持的 `/models` 目录，可搜索选择，也可一直手填。
2. 点击“验证连接”，成功后再“启用配置”。目录成功仅代表可列模型；实际调用必须成功，且地址、模型或密钥改变后需要重新验证。对已经工作的配置进行编辑会生成候选副本，原配置保留到候选验证并启用。
3. 选择“豆包实时会话”可继续填写原 App ID、Token、区域和实时模型。回复仍由豆包实时服务生成；通用 LLM 用于 my_brain 的其他语言任务。
4. 选择“设备识别 + LLM + TTS”，新增通用 TTS 或 MiMo 预设，填写地址、Key、模型和音色。MiMo 仅预填地址与协议，模型不固定；音色按钮标为文档预置，也可以手填账号可用的音色。
5. “试听并验证”会真实调用服务并可能计费。等待设备播放结束才授予调用验证；停止试听不会授予验证。再点击“启用配置”选择组合语音。LLM 已验证但语音未就绪时，文字功能仍可进入，语音说明故障。

首批协议只接收 PCM16LE 单声道 24 kHz。OpenAI Speech 无通用账号音色目录，MiMo 尚无确认的公开音色目录，因此展示手填 / 文档预置；没有假称这些音色来自账号实时接口。特殊鉴权、私有协议、其他采样率、MP3/AAC、克隆和设计流程需要后续适配器。

## 迁移与恢复

- v1 配置保留原值，并复制到 `provider.settings.v1.backup`；新配置放在 `provider.settings.v2`，journal 为 `provider.migration.v2`。
- 先复制并读回校验 LLM 和豆包旧安全凭据，再激活 v2。旧凭据不删除；中途退出可重复迁移，启动与设置页并发迁移会串行合并。
- App ID、Token、区域、实时模型以及 radar、Token Exchange、Execution API 原值保留；不读取或清空脑图 / 画像业务数据。
- 旧验证不继承为 live。损坏的 v1/v2 原值保留并提示修复；不会通过写默认值覆盖损坏数据。
- 需要回到旧版时，先备份现有应用数据。Android 降级安装未作为本次自动化验收；本版保留的旧配置副本与凭据用于受控恢复。

## Actions 门槛与证据

`Provider Config Validation` 对原始基线 `11b24ef326f03a2a445139021c03b87a5fd5ee4d` 和当前提交分别运行根类型 / lint、core 类型 / 边界、mobile 类型、全部移动/core 测试与完整仓库测试。收集器保留真实退出码，gate 拒绝缺失检查、移动/core 失败和新增完整仓库失败。

允许公开保留的一项无关历史失败为：`src/agent/jobs/curationScanJob.test.ts` 中的 “returns empty proposals when graph has no stale candidates”。固定日期在当前日期产生过期候选；未改原整理行为迎合断言。最终报告列出当前与基线的完整失败名称，任何新增失败都阻断 APK。

APK 只有在当前完整 SHA 的验证 PASS 后才构建。原应用 ID `app.mybrain.personal` 和原签名保留；versionCode 根据 Actions 构建时间递增，并与旧包断言比较。签名、内嵌 Hermes JS、敏感值扫描通过后，模拟器安装旧 APK、填写旧配置，再覆盖升级新包，验证 Key / 地址 / 豆包 App ID 保留、新配置保存重启和手填 TTS。模拟器失败阻断发布。

Prerelease 附件包含 APK、SHA256、`provider-verification.json`、`apk-verification.json`、`sensitive-scan.json`、`emulator-verification.json` 和已知限制。完整命令日志、测试 JSON、JUnit 与模拟器截图可在同一 Actions run 的 artifacts 下载。报告均绑定源码 SHA，不将旧分支报告用于新提交发布。

自动化用例覆盖配置切换、目录分页 / 权限 / 限流 / 晚到结果、迁移恢复、实际请求选中模型、MiMo SSE / PCM、播放结束与取消、豆包最终转写、两种语音模式、确认入库 / 临时聊天 / 自动整理 / 撤销。真实账号调用权限需应用内验证；合成协议数据不能证明某个账号有权限。

真实麦克风、回声、声学打断停止 P50 < 300 ms、蓝牙、来电和 iOS 为 NOT_RUN / NOT_TESTED。上游缺失设计 SVG 和 companion-registry.json，视觉基线比对为 NOT_RUN；现有 18 条捕获路由和主题契约继续检查。详见 [已知限制](KNOWN_LIMITATIONS.md)。

移植依据与 Apache 2.0 来源见 [归属说明](PORTING_ATTRIBUTION.md)，未包含来源项目固定中转站或人格 / 记忆 / 对话核心。
