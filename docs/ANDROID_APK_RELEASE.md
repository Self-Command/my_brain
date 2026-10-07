# Android APK 自动构建与下载

`.github/workflows/android-apk-release.yml` 在推送到 `main` 后构建
`apps/mobile` 的独立 release APK，并发布到 GitHub Releases。
也可以在 Actions → **Android APK Release** → **Run workflow** 手动触发。
不需要 Expo 账号、EAS 构建额度或额外 GitHub Secrets。

## 下载和安装

打开当前仓库的 **Releases**，在最新版本的 Assets 中下载
`my-brain-android.apk`。支持 Android 7.0 及以上；安装时允许下载应用的
浏览器或文件管理器「安装未知应用」。APK 自带 JavaScript，不需要 Expo Go
或连接 Metro 开发服务器。`my-brain-android.apk.sha256` 用于校验文件。

当前是自用测试包：沿用仓库固定的 debug keystore 签署 release 构建，
后续自动构建保持同一签名，并递增 `versionCode`，支持覆盖安装保留本地数据。
它不适合作为应用商店正式发行包；正式发行应另行配置私有签名密钥。
若手机已装有不同签名的同包名应用，先使用应用的备份功能保存数据，
再处理旧包的安装冲突。

构建使用 production 配置，不将开发者 `.env.local` 凭据打进 APK。
真实服务按应用现有设置配置；无配置时使用现有降级路径。

## 构建过程

1. Ubuntu 22.04、Node 20、pnpm 9.15.5、Java 17。
2. 安装 Android SDK 35、Build Tools 35.0.0、NDK 26.1.10909125、CMake 3.22.1。
3. 按 lockfile 安装完整 workspace 依赖。
4. 先验证 Android JavaScript 打包，再使用已提交的 Android 工程运行
   `assembleRelease`，保留原生模块、权限及备份规则。
5. 验证 APK 签名和内嵌 JavaScript，计算 SHA-256，保存 Actions artifact。
6. 独立发布 job 用 `contents: write` 发布到当前 fork 的 Releases。

每次成功构建保留独立 release 和对应提交信息，最新版本可通过仓库的
`releases/latest` 页面找到。在其他分支手动运行只生成 Actions artifact。
原有 Web/Tauri CI 单独运行，不作为 Android APK 发布的前置条件。
