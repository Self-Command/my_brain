# 来源与重写边界

配置、模型目录搜索、分页、缓存和手动选择的交互思路参考 [fluxvoice-personal](https://github.com/Self-Command/fluxvoice-personal)，固定版本 `12980a55f4c21f0224b17d306a0f2b5b940b8880`。原项目使用 Apache License 2.0，完整许可保存于 [FLUXVOICE_LICENSE.md](FLUXVOICE_LICENSE.md)。

my_brain 的实现为 TypeScript / React Native 与 Expo 原生 HTTP 流桥接，使用原有设备识别、PCM Pipeline、SecureStore、SQLite、LLMProvider 和会话意图出口。未移植 Kotlin UI、AudioTrack 会话、源项目人格提示词、Deepgram、硬编码中转地址或核心对话控制器。

协议依据为 OpenAI Models / Speech 与 MiMo Models / Speech 官方文档，见 [SOURCE_AUDIT.md](SOURCE_AUDIT.md)。MiMo 地址是可编辑预设；模型与音色由用户选择，不自动替换配置。
