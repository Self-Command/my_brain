# 通用配置测试版限制

2026-10-07 用户要求立即发布已构建测试版，自行测试并反馈；取消本次模拟器交互发布门槛。代码检查和 APK 签名 / JS / 敏感值门槛继续保留，交互报告标记由用户测试，不宣称验收完成。

- GitHub Actions 执行类型检查、核心边界检查、移动端与共享核心测试、完整仓库测试、Android 编译、签名检查、内嵌 JS 与敏感值扫描、模拟器安装升级验证及发布。
- 模拟器验证不代表真实麦克风、声学打断 P50 < 300 ms、回声、蓝牙耳机、来电恢复或 iOS 验收；这些项目为 NOT_RUN / NOT_TESTED。
- 自动化协议测试使用合成 SSE / PCM 与测试凭据。真实账号权限、音色可用性与计费由应用内连接验证确定，模型目录成功不授予 live 状态。
- 首批通用性覆盖 OpenAI Chat Completions、OpenAI Speech PCM 与 MiMo 音频 Chat 协议；私有协议、特殊鉴权、私网、非 24 kHz PCM、MP3/AAC、音色克隆与设计需要后续适配器。
- MiMo 音色列表为官方文档预置，非账号接口实时目录；其他音色可手填。未确认的音色目录接口不会自动探测。
- 上游未提供 companion-registry.json 与设计 SVG，视觉基线比对标为 NOT_RUN；已检查的 18 条捕获路由、运行时 testID 与主题可读性仍执行。
- 完整仓库基线遗留失败逐项列在 provider-verification.json；任何新增失败或移动端/共享核心失败阻断发布。
- 原有 CI 的 check / visual-smoke / tauri-build 在 pnpm 安装阶段有相同版本声明冲突（workflow 声明 9，packageManager 为 9.15.5）。[基线运行](https://github.com/Self-Command/my_brain/actions/runs/37551806587) 与 [当前 PR 运行](https://github.com/Self-Command/my_brain/actions/runs/37564424173) 保留失败；本次新验证流水线固定 9.15.5，实际执行完整根类型 / lint / 测试，并对移动/core 及新增失败设门槛。
- 测试版沿用此前固定 Android debug 签名，支持原应用覆盖升级。配置迁移保留 v1 配置副本与旧凭据，不清空脑图、画像。
