# 通用服务配置移植：来源与现状审计

版本 1.0 · 核对日期 2026-10-07 · 待审批。本文区分代码已具备的能力、适合迁入的逻辑和本次需要新增的功能。

## 1. 代码基线

| 仓库 | 固定 revision | 作用 |
| --- | --- | --- |
| [Self-Command/my_brain](https://github.com/Self-Command/my_brain/tree/11b24ef326f03a2a445139021c03b87a5fd5ee4d) | `11b24ef326f03a2a445139021c03b87a5fd5ee4d` | 目标；现有已安装 APK 对应基线 |
| [Self-Command/fluxvoice-personal](https://github.com/Self-Command/fluxvoice-personal/tree/12980a55f4c21f0224b17d306a0f2b5b940b8880) | `12980a55f4c21f0224b17d306a0f2b5b940b8880` | Kotlin / Compose 来源，参考配置与协议逻辑 |

后续上游变化不能悄悄改变本方案范围。实施时记录实际引用的文件和 revision；若接口变化需要改设计，更新能力表与验收。

## 2. 来源项目：迁入、改造、排除

下表路径相对于 `app/src/main/java/com/techrifter/fluxvoice/`。

| 来源文件 | 已核对能力 | 处理决定 |
| --- | --- | --- |
| `domain/model/AppSettings.kt` | OpenAI-compatible 地址、模型选择、MiMo Key / 音色 / 风格、源项目人格与上下文设置 | 只参考配置角色；不迁入系统提示词、会话模式、上下文规则与 Deepgram 业务 |
| `domain/model/ModelCatalog.kt` | 模型目录与状态；URL 规范化；地址 / Key 摘要作用域；固定 relay 默认值 | 迁入目录与作用域思想；改用凭据修订；去掉固定 relay |
| `data/catalog/ModelCatalogSource.kt` | `/models` Bearer 查询、可选名称字段、分页、同源校验、循环 / 50 页上限、错误分类 | 按 TS 端口重写并增加移动传输 / 重定向验证 |
| `data/catalog/ModelCatalogController.kt` | 防抖、取消、请求代次、缓存、保留显式选择、旧账户结果隔离 | 迁入状态控制思想；手动选择改为始终可用；目录状态与实际可调用状态分离 |
| `data/catalog/ModelCatalogRepositoryImpl.kt` | DataStore 目录持久化，最近作用域数量限制 | 改为 my_brain 非敏感本地存储；不增加第二套业务数据库 |
| `ui/components/ModelPicker.kt` | 模型选择交互入口 | 在 RN 重新实现搜索 / 选择 / 手填；不复制 Compose UI |
| `data/local/datastore/SettingsDataStore.kt` | 设置与 Key 以 DataStore preferences 保存 | 不迁入密钥存储方式；目标使用 Expo SecureStore |
| `ui/screen/settings/SettingsScreen.kt` | MiMo 固定模型说明、Key、风格和两项音色芯片 | 只取配置交互参考；不能当作模型 / 音色自动发现能力 |
| `domain/model/MimoVoiceConfig.kt` | 默认音色与风格 | 作为可编辑预设参考，不成为通用固定值 |
| `data/tts/MimoProtocol.kt` | 固定 `mimo-v2.5-tts`；assistant 原文 / user 风格；PCM；SSE 音频字段 | 迁入参数与解析思路；模型 / URL / 音色来自目标配置 |
| `data/tts/MimoTtsEngine.kt` | 固定 MiMo URL；24 kHz PCM16LE；音频队列、代次、取消、播放完成判断 | 参考协议和取消概念；使用现有 RN 原生播放端口，不复制 AudioTrack |

固定来源链接示例：[目录请求实现](https://github.com/Self-Command/fluxvoice-personal/blob/12980a55f4c21f0224b17d306a0f2b5b940b8880/app/src/main/java/com/techrifter/fluxvoice/data/catalog/ModelCatalogSource.kt)、[目录控制器](https://github.com/Self-Command/fluxvoice-personal/blob/12980a55f4c21f0224b17d306a0f2b5b940b8880/app/src/main/java/com/techrifter/fluxvoice/data/catalog/ModelCatalogController.kt)、[MiMo 协议](https://github.com/Self-Command/fluxvoice-personal/blob/12980a55f4c21f0224b17d306a0f2b5b940b8880/app/src/main/java/com/techrifter/fluxvoice/data/tts/MimoProtocol.kt)。

来源项目的固定中转地址为 `https://api.krill-code.net/v1`。本次不沿用该地址，不替用户选择第三方中转站，不沿用来源 User-Agent 身份。新自定义配置必须由用户填写。

不移植整套 `FluxVoiceEngine`、VoiceViewModel、Deepgram 识别链路、聊天仓库和源项目人格。来源没有 my_brain 的知识图谱和确认入库机制，直接搬会话引擎会扩大范围并冲突。

来源的“MiMo 支持”不等于已经实现通用 TTS，也不等于音色自动发现；这两部分是目标的新实现。

## 3. 目标项目：可复用能力与必须修复的接入

| 目标位置 | 当前事实 | 对方案的影响 |
| --- | --- | --- |
| `apps/mobile/services/providerConfigStore.ts` | v1 LLM 包含 providerId / model / endpoint；voice 为实时模型 / 区域 / App ID；默认 ModelScope + 豆包 | 旧字段可迁移；不能只替 UI 丢弃原值 |
| `apps/mobile/screens/ProviderSettingsScreen.tsx` | 展示固定模型文字，输入 endpoint / Key；门控文案绑定 ModelScope 与豆包 | 替换 LLM 选择 UI，门控按实际角色与配置验证 |
| `apps/mobile/services/secureCredentialStore.ts` | `llm_api_key / voice_api_key / short_lived_token`，Expo SecureStore，末四位遮罩 | 扩展 profile 引用，继续复用安全存储 |
| `apps/mobile/services/providerUrlValidation.ts` | 现有 HTTPS / 私网限制主要服务 Token Exchange / Execution API | 为通用服务单独设计校验；不直接放宽原端点 |
| `packages/core/src/providers/types.ts` | 有 LlmProvider、VoiceProvider、NewsSource 抽象 | 保持接口与业务依赖方向；补齐配置 / 目录 / TTS 契约 |
| `packages/core/src/providers/` | 已有通用 OpenAI-compatible LLM 实现 | 优先复用，工厂强制显式传模型 / URL；保持结构化校验 |
| `apps/mobile/hooks/useConversationSession.ts` | live 工厂分支只覆盖 `deepseek`，其他返回 mock | 必须修复；不能拿设置连接测试通过证明实际已接入 |
| `apps/mobile/radar/mobileRadarRuntime.ts` | 已根据配置构造 DeepSeek / compatible provider | 收敛到共享工厂，避免不同消费者选择不一致 |
| `apps/mobile/screens/CompanionChatScreen.tsx` | 普通聊天走 appendCasualTurn，本地临时状态；保存候选仍需确认 | 只补服务接线与异步状态，保留临时记忆 / 用户保存规则 |
| `apps/mobile/voice/VoiceSession.ts` | 多条语音分支、打断 / 转写 / FSM；设备 STT 播放时停用或忽略 | 组合模式需真实语音活动 / 识别预研；豆包业务事件桥接需核对 |
| `apps/mobile/voice/doubaoDialogTransport.ts` | 双向 WebSocket，服务 ASR / TTS，专属鉴权与事件 | 豆包保留 realtime adapter，不能冒充普通 TTS |
| `apps/mobile/voice/doubaoPcmAudio.ts` | 已有录音与 PCM Pipeline；输入 16 kHz，输出 24 kHz；turn 失效能力 | 抽取输出端口，采样率按服务声明，继续复用原生依赖 |
| `apps/mobile/voice/deviceSpeechInput.ts` | 设备识别，通过 react-native-voice | 首批组合模式复用；不声称已经覆盖所有云 STT |
| `apps/mobile/voice/deviceSpeechOutput.ts` | Android 系统 TTS / Expo speech 路径 | 保留明确的设备降级选择；不与网络音色目录混淆 |
| `apps/mobile/voice/deviceAudioClient.ts` | mock / device_stub 与播放状态 | mock 测试有用，但不能证明声学打断或任意编码播放 |
| `apps/mobile/App.tsx`、`stores/mobileAppStore.ts` | 主入口依赖旧验证布尔值 | 验证绑定配置修订；文字和语音状态分开 |
| `.github/workflows/android-apk-release.yml` | production 导出、原生 APK、验签、哈希、artifact / Release 已成功 | 在其上接测试门槛，不能只编译就发布新功能 |

目标项目的 legacy [Provider 插件契约](../../providers/PROVIDER_PLUGIN_CONTRACT.md) 可以参考依赖隔离原则，但其中 `src/` 路径不能冒充移动端已实现模块。移动主线以 `apps/mobile` / `packages/core` 为准。

## 4. 官方接口核对

技术判断仅依赖实际代码和官方协议资料。目录、模型、音色可能继续变化；下表描述核对日期的情况。

| 来源 | 核对结论 | 设计约束 |
| --- | --- | --- |
| [OpenAI Models list](https://developers.openai.com/api/reference/resources/models/methods/list) | `GET /models` 返回模型 ID 等字段 | 不以列表或名称推断 TTS 能力和账号调用权限 |
| [OpenAI Create speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create) | `POST /audio/speech` 使用 model / input / voice，支持其文档说明的返回格式 | 只适配兼容服务实际实现的字段 / 音频；不存在可据此保证的跨厂商音色列表 |
| [MiMo 模型列表](https://mimo.mi.com/docs/zh-CN/api/model/list-models) | 官方 `GET https://api.xiaomimimo.com/v1/models`，支持文档鉴权 | 可以自动查询；仍须验证所选模型实际权限 |
| [MiMo 语音合成](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5) | 普通 TTS / voiceclone / voicedesign 参数不同；普通 TTS 可用 SSE 音频 | 首批普通合成，模型可选；克隆 / 设计不得用同一最小表单伪装支持 |
| 同上 | 文档列出中英文预置音色和流式 PCM 示例；核对时未发现公开音色目录 API | 预置音色注明“文档预置”，保留手填；不猜测枚举端点 |

对“所有 TTS 能否只填 URL / Key 接入”的回答是基于协议差异的工程判断：现有协议范围内可配置接入；私有协议要补适配器。方案不能把 OpenAI 文字兼容性推论成语音协议、实时会话或音色目录兼容性。

MiMo 文档中的普通预设音色与参数需在实施阶段重新核对，预置仅提供便利，不能作为“当前账号的所有可用音色”证据。

## 5. 许可证和来源记录

来源仓库基线的 [LICENSE.md](https://github.com/Self-Command/fluxvoice-personal/blob/12980a55f4c21f0224b17d306a0f2b5b940b8880/LICENSE.md) 为 Apache License 2.0。实施前核对具体迁入文件的版权头和仓库是否存在 NOTICE；复制或改写来源代码时保留适用声明和许可文本，说明修改，并在目标来源记录中列出来源 revision / 文件 / 对应实现。

Kotlin 改写成 TypeScript 不代表可以删除来源声明。独立按公开协议实现的模块与实际改写来源模块分别记录。此项属于实现时的来源维护，不扩大为用户未要求的法律审查流程。

建议实施时新增 `docs/development/provider-config-port/PORTING_ATTRIBUTION.md` 作为最终清单，记录：来源仓库、revision、原路径、目标路径、移植方式、保留的声明、主要差异。该文件目前不创建虚构的已移植记录。

## 6. 当前交付状态

这套文档已经描述所需实现和验证，但应用仍为原始基线代码。文档中的新配置、目录、适配器、迁移、工作流和测试均未声称已经实现或通过。

下一步仅在用户明确批准后进行。所有二次开发编译、构建与测试执行位置固定为 GitHub Actions，详见 [实施与验收](IMPLEMENTATION_AND_ACCEPTANCE.md)。
