# Android APK 自动构建与下载

所有类型检查、测试、编译、模拟器验证和发布由 GitHub Actions 执行。
`Provider Config Validation` 在开发分支推送、PR、main 或手动触发时检查；
通过 gate 后，同一 SHA 调用 `Android APK Release` 构建和验证。
main 成功通过门槛后发布 GitHub Prerelease；开发分支默认保留 artifact。
手动发布可在 Provider Config Validation 勾选 publish，或在 Android APK Release
填写同一 SHA 的成功 validation_run 并勾选 publish。SHA 不一致会失败。
不需要 Expo 账号、EAS 构建额度或额外 GitHub Secrets。

## 下载和安装

打开当前仓库的 **Releases**，在通用配置 **Pre-release** 的 Assets 中下载
`my-brain-android.apk`。支持 Android 7.0 及以上；安装时允许下载应用的
浏览器或文件管理器「安装未知应用」。APK 自带 JavaScript，不需要 Expo Go
或连接 Metro 开发服务器。`my-brain-android.apk.sha256` 用于校验文件。

当前是自用测试包：沿用仓库固定的 debug keystore 签署 release 构建，
后续自动构建保持同一签名，并递增 `versionCode`，支持覆盖安装保留本地数据。
它不适合作为应用商店正式发行包；正式发行应另行配置私有签名密钥。
若手机已装有不同签名的同包名应用，先使用应用的备份功能保存数据，
再处理旧包的安装冲突。

构建使用 production 配置，不将开发者 `.env.local` 凭据打进 APK。
真实服务按应用设置配置，目录与实际调用分别验证；LLM 已验证时允许文字功能。
操作、迁移与恢复见 [通用配置实施记录](development/provider-config-port/IMPLEMENTATION_STATUS.md)。

## 构建过程

1. Ubuntu 22.04、Node 20、pnpm 9.15.5、Java 17。
2. 安装 Android SDK 35、Build Tools 35.0.0、NDK 26.1.10909125、CMake 3.22.1。
3. 按 lockfile 安装完整 workspace 依赖。
4. 验证根类型 / lint、core 类型 / 边界、mobile 类型、全部移动/core 测试与完整仓库测试。
   新失败或移动/core 失败阻断后续构建；无关且未恶化的历史 `src/` 失败公开记录。
5. 先验证 Android JavaScript 打包，再使用已提交的 Android 工程运行
   `assembleRelease`，保留原生模块、权限及备份规则。
6. 验证 APK 与旧包签名、递增版本、应用 ID、内嵌 Hermes JS 和敏感值，计算 SHA-256。
7. Actions Android API 35 模拟器安装旧包、填写配置、覆盖升级并检查保存 / 重启 / 迁移。
   Maestro 固定 CLI 2.11.0 并校验下载 SHA256；失败阻断发布。
8. 独立发布 job 用 `contents: write` 发布 Prerelease，附 APK、哈希、验证报告与已知限制。

Prerelease 不更新 `releases/latest`，请从具体发布页下载。版本码按 Actions 构建时间
递增，并与旧包比较；发布 tag 含唯一 run ID。所有报告绑定完整源码 SHA。
`provider-verification` artifact 保留命令退出码和当前 / 基线的完整测试 JSON；
模拟器 artifact 保留 JUnit、截图与设备日志。

真实麦克风、回声、蓝牙、来电、声学打断 P50 < 300 ms 和 iOS 未验收，
标为 NOT_RUN / NOT_TESTED，不阻断本次测试版。真实账号权限需应用内验证。
原来的独立 push 发布入口已替换，不能仅凭 APK 编译成功绕过测试和模拟器门槛。
