> **M0 修订（2026-06-13）· 状态：merged**  
> **移动 App-only / User Evolution-first** 以 [`docs/MOBILE_PRODUCT_PLAN.md`](../MOBILE_PRODUCT_PLAN.md) + [`specs/mobile-app/`](../../specs/mobile-app/) 为准。  
> 新增目录：`apps/mobile`、`packages/core`；移动 gate：`pnpm mobile:gate M{n}`。

# my_brain 项目总览手册

> **读者：** 换 Cursor 窗口、换 LLM、新 agent、或隔很久再回来改代码的人。  
> **目标：** 5–15 分钟建立完整心智模型，知道「这是什么、代码在哪、什么不能动、怎么跑起来」。  
> **更新时间：** 2026-06-08（与 `main` 上 v2 沉浸式伴侣形态对齐）

---

## 0. 如何使用本文档

1. **先读本文**，不要先全库 grep。
2. 改**产品行为** → 对照 [§2 不变量](#2-七条产品不变量) 与 `PRODUCT.md`。
3. 改**代码结构** → 对照 [§5 目录地图](#5-仓库目录地图) 与 [§8 关键文件索引](#8-关键文件索引按任务查)。
4. 改**UI/视觉** → v2 主路径是 `ImmersiveScene` + `LaunchScene`；Legacy 多分区 UI 仍保留但**不挂主流程**。
5. 深读单功能 → `specs/V*.md` 对应里程碑。

---

## 1. 三十秒速览

| 项 | 内容 |
|----|------|
| **是什么** | 语音优先、本地 SQLite 的 AI 知识伴侣：讲 AI 资讯/GitHub 趋势，**你语音确认**是否入库，入库后 **AI 自动整理** 概念图谱 |
| **v2 形态** | 全屏神经星图 + 右侧语音光球 + 右上角设置；**无**导航栏、收件箱、说话按钮 |
| **技术** | TypeScript · React 18 · Vite · Tauri 2 · Zustand · SQLite · Provider 可替换 |
| **开发默认** | Mock providers，无需 API Key；`pnpm dev` → http://localhost:1420 |
| **质量门** | `pnpm check` = typecheck + lint + 512 tests；Husky pre-commit |

---

## 2. 七条产品不变量

违反任一条即破坏产品灵魂（详见 `AGENTS.md` / `PRODUCT.md`）：

| # | 规则 |
|---|------|
| 1 | **三层记忆分离**：原始音频/全文聊完即丢；**图谱**永久；**用户画像**永久静默生长 |
| 2 | **新建概念 = 用户语音确认**（「入 / 不要 / 讲细点」）；禁止静默 create |
| 3 | **入库后整理 = AI 自动执行**（merge / link / archive / edge-migrate）；变更进 **graph history** 可 undo；偶尔口头汇报 |
| 4 | **删除 = 归档**（隐藏可恢复）；合并时边迁移到新节点 |
| 5 | **节点 = 概念 + 短简介 + 来源链接**，不是新闻碎片 |
| 6 | **语音必须可打断**（barge-in）；Realtime 为主路径设计 |
| 7 | **Local-first**：MVP 无云端后端；数据在本机 SQLite |

**记忆引擎边界（M 系列）：** `MemoryProvider` 只读注入对话、只写蒸馏文本，**绝不写图谱/画像**。与 V4 auto-curate 写图谱不冲突。

**Brain MCP 边界（F1）：** 外部 agent 通过 MCP 默认 **只读**（`brain_search_nodes` / `brain_get_node` / `brain_graph_outline` / `brain_node_neighborhood`），**不能** create/merge/archive/undo/ingest/confirm action，不得绕过 App 内用户确认写图谱或 cognitive action。

**合法图谱写路径（仅两条）：**

1. 用户确认 → `applyIngestCreate`（V3）
2. 入库后 → `runAutoCurateAfterIngest` / `autoCurate`（V4）

---

## 3. 用户可见流程（v2）

```
启动
  → self_check  语音自检 HUD（CompanionSelfCheckScreen）
  → loading     抓资讯 + 注入动画
  → companion   全屏星图 + 光球，伴侣主动开口
       ├ 闲聊（不入库）
       ├ 讲资讯 → 每条问「入/不要/讲细点」
       └ 讲已有知识 → 星图 walkthrough 高亮
```

**LaunchPhase**（`src/stores/appStore.ts`）：`boot` | `self_check` | `loading` | `companion` | `error`  
路由入口：`AppShell.tsx` — 启动阶段走 `LaunchScene`，`companion` 走 `ImmersiveScene`。

---

## 4. 技术栈（锁定）

| 层 | 选型 | 说明 |
|----|------|------|
| 语言 | TypeScript strict | 全仓库 |
| 壳 | Tauri 2 + Web | 同一 React 代码库 |
| UI | React 18 · Vite 7 · Tailwind · Zustand | UI 文案 zh-CN |
| 图谱 | react-force-graph-2d/3d | 2D 默认，3D 可切换 |
| 存储 | SQLite | Web dev: `better-sqlite3`；桌面: Tauri SQL plugin |
| 语音 | `VoiceProvider` | Mock / OpenAI Realtime |
| LLM | `LlmProvider` | Mock / OpenAI |
| 记忆 | `MemoryProvider` | Mock / EverMemOS sidecar |
| 资讯 | `NewsSource` | RSS + GitHub trending 等 |
| 向量 | `EmbeddingProvider` | Mock；供 auto-curate 语义邻域 |

---

## 5. 仓库目录地图

```
my_brain/
├── src/                    # 应用源码（主战场）
│   ├── main.tsx / App.tsx  # 入口
│   ├── components/
│   │   ├── launch/         # 启动、自检（CompanionSelfCheckScreen, LaunchScene）
│   │   ├── shell/          # v2 主界面（ImmersiveScene, SciFiAtmosphere）
│   │   ├── voice/          # 光球、VoiceOrb、CompanionVoicePresence
│   │   ├── brain/          # BrainGraphView, 3D, 图例, zoom
│   │   ├── settings/       # SettingsOverlay（唯一可见设置入口）
│   │   └── layout/         # AppShell；legacy 分区组件仍在但不挂主流程
│   ├── conversation/       # ConversationConductor 状态机、nextTurn、ingest
│   ├── hooks/              # useConversationSession, useVoiceSession, ingest…
│   ├── stores/             # Zustand：app, graph, profile, graphHistory…
│   ├── lib/                # 纯逻辑：启动、图谱变更、context pack、visual snapshot
│   ├── domain/             # 领域类型（graph, news…）
│   ├── storage/            # StorageProvider + SQLite 适配器 + migrations
│   ├── providers/          # voice / llm / memory / news / embedding
│   ├── agent/              # Sense→Plan→Act、scheduler、curation、jobs
│   ├── mcp/                # 只读 MCP handlers（外部 agent 查图谱）
│   ├── invariants/         # 产品不变量回归测试
│   └── e2e/                # companion 端到端 mock 冒烟
├── src-tauri/              # Tauri 桌面壳 + Rust migrations
├── specs/                  # 里程碑 SRS（V0–V7 主路径；A/B/C/N/G superseded）
├── docs/                   # 工程文档；本 handbook 在 docs/handbook/
├── assets/                 # 视觉回归 baseline PNG
├── scripts/                # visual-feedback、brain-mcp-server
├── PRODUCT.md              # 产品 PRD v2
├── AGENTS.md               # Agent 编码约束
└── README.md               # 对外介绍 + 快速开始
```

---

## 6. 运行时架构

```
                    ┌─────────────────────────────────────┐
                    │  LaunchScene / ImmersiveScene (UI)   │
                    └─────────────────┬───────────────────┘
                                      │
                    ┌─────────────────▼───────────────────┐
                    │  useConversationSession              │
                    │  ConversationConductor (FSM)         │
                    └─┬─────────┬─────────┬───────────────┘
                      │         │         │
           VoiceProvider   LlmProvider   graphContextPack
                      │         │         │
                      │    nextTurn / ingestActions
                      │         │
                      ▼         ▼
              applyIngestCreate ──► graphStore + SQLite
              runAutoCurateAfterIngest ──► graphMutations + graphHistoryStore
                      │
              MemoryProvider (recall only, no graph writes)
                      │
              NewsSource ──► newsQueue ──► briefing / ingest
```

**状态存储分工：**

| Store | 职责 |
|-------|------|
| `appStore` | 启动阶段、自检项、newsQueue、providers/storage 句柄 |
| `graphStore` | 当前图谱 nodes/edges |
| `graphHistoryStore` | 结构变更快照，支持 undo |
| `conversationStore` | 会话态、walkthrough 高亮、ingest 指针 |
| `profileStore` | 用户画像 |
| `proposalStore` | **Legacy** 提议收件箱（只读归档路径，非 v2 主流程） |

---

## 7. Provider 与配置

**移动主线（2026-10-07）：** `apps/mobile/services/providerProfiles.ts` 管理 v2 服务配置、修订验证与可恢复迁移；长效密钥保存在 SecureStore。`packages/core/src/providers/serviceConfig.ts` 是通用 LLM 工厂，`serviceCatalog.ts` 查询模型目录，`ttsProtocol.ts` 定义 Speech / MiMo PCM 协议。移动设置支持独立 LLM、豆包实时会话或设备识别 + LLM + TTS。全部开发验证、APK 和 Prerelease 经过 Actions 门槛。实际接入及未验收项见 [通用配置实施记录](../development/provider-config-port/IMPLEMENTATION_STATUS.md)。以下 `src/` 环境变量说明属于 legacy Web/Tauri。

**工厂入口：** `src/providers/index.ts` → `createAppProviders()`  
**环境变量：** `.env.example` → `.env`（gitignore）

| 变量（常见） | 作用 |
|--------------|------|
| `VITE_OPENAI_API_KEY` | Realtime / LLM（验收期） |
| `VITE_VOICE_PROVIDER` | `mock` / `openai` |
| `VITE_LLM_PROVIDER` | `mock` / `openai` |
| `VITE_MEMORY_PROVIDER` | `mock` / `evermemos` |
| `VITE_DESIGN_PREVIEW` | 设计预览模式（非主 App） |

Mock-first：默认全部 mock，本地可完整演示入库、整理、undo、walkthrough。

---

## 8. 关键文件索引（按任务查）

### 启动与主界面

| 任务 | 文件 |
|------|------|
| 应用壳 / 阶段切换 | `src/components/layout/AppShell.tsx` |
| 启动序列 | `src/lib/runLaunchSequence.ts` |
| 自检 UI | `src/components/launch/CompanionSelfCheckScreen.tsx` |
| 启动场景容器 | `src/components/launch/LaunchScene.tsx` |
| v2 主界面 | `src/components/shell/ImmersiveScene.tsx` |
| 背景氛围（角标可关） | `src/components/shell/SciFiAtmosphere.tsx` |
| 设置浮层 | `src/components/settings/SettingsOverlay.tsx` |

### 语音与对话

| 任务 | 文件 |
|------|------|
| 对话状态机 | `src/conversation/ConversationConductor.ts` |
| 会话 hook | `src/hooks/useConversationSession.ts` |
| 下一句话术 | `src/conversation/nextTurn.ts` |
| 入库动作 | `src/conversation/ingestActions.ts` |
| 语音 UI | `src/components/voice/VoiceOrb.tsx`, `CompanionVoicePresence.tsx` |
| Mock 语音 | `src/providers/voice/mockVoiceProvider.ts` |
| Realtime | `src/providers/voice/openaiRealtimeVoiceProvider.ts` |

### 图谱

| 任务 | 文件 |
|------|------|
| 2D 星图 | `src/components/brain/BrainGraphView.tsx` |
| 3D 星图 | `src/components/brain/BrainGraph3DView.tsx` |
| 领域模型 | `src/domain/graph.ts` |
| 变更 apply | `src/lib/graphMutations.ts` |
| 入库 create | `applyIngestCreate`（ingestActions / graphMutations） |
| 自动整理 | `src/agent/curation/autoCurate.ts`, `src/lib/runAutoCuratePipeline.ts` |
| LLM 上下文子图 | `src/lib/graphContextPack.ts`, `contextTiers.ts` |
| Undo | `src/stores/graphHistoryStore.ts`, `GraphUndoControl.tsx` |
| 视觉 token | `src/lib/graphVisualTokens.ts` |

### 存储

| 任务 | 文件 |
|------|------|
| 抽象接口 | `src/storage/types.ts` |
| Web SQLite | `src/storage/adapters/betterSqliteBackend.ts`, `webSqlStorage.ts` |
| Tauri SQLite | `src/storage/adapters/tauriSqlStorage.ts` |
| 迁移 | `src/storage/schemaMigrations.ts`, `migrations.ts` |

### 测试入口

| 任务 | 文件 |
|------|------|
| 主界面行为 | `src/components/shell/ImmersiveScene.test.ts` |
| 自检 UI | `src/components/launch/CompanionSelfCheckScreen.test.tsx` |
| 不变量 | `src/invariants/productInvariants.test.ts` |
| E2E 冒烟 | `src/e2e/companion.e2e.test.ts` |
| 视觉快照模式 | `src/lib/visualSnapshotMode.ts`, `visualSnapshotFixtures.ts` |

---

## 9. Legacy vs v2 主路径

| 类别 | v2 主路径 | Legacy（保留，勿当主流程恢复） |
|------|-----------|--------------------------------|
| UI 壳 | `ImmersiveScene` 全屏 | `NavRail`, `TopBar`, 探索/文档/洞察分区 |
| 图谱整理 | V4 `autoCurate` 自动 apply | A2 `proposalStore` 收件箱审批 |
| 视觉回归默认 | `companion-selfcheck`, `companion-main` | `boot`, `companion`, `inbox`, `insight`（需 `--legacy-visual`） |
| Spec | V0–V7 ✅ | A/B/C/N/G 标 `superseded(逻辑复用)` |

**规则：** 修 v2 时不要恢复「逐条审批 inbox」为主流程；Legacy 代码主要用于 `?visual=*` 快照和部分 harness 测试。

---

## 10. 开发命令

```bash
pnpm install
pnpm dev              # http://localhost:1420
pnpm check            # typecheck + lint + test（提交前 hook 同款）
pnpm build            # Web 生产构建
pnpm tauri dev        # 桌面
pnpm visual:loop --companion   # V2 视觉回归（selfcheck + main）
pnpm brain:mcp        # 只读 MCP，见 docs/BRAIN_MCP.md
```

**常用 URL：**

| URL | 用途 |
|-----|------|
| `/` | 正常启动流程 |
| `/?visual=companion-main` | 主界面视觉快照 |
| `/?visual=companion-selfcheck` | 自检页视觉快照 |

---

## 11. 文档层级（深读顺序）

```
docs/handbook/PROJECT_HANDBOOK.md   ← 你在这里（总览）
        ↓
AGENTS.md                           编码约束 + 命令
PRODUCT.md                          产品机制全文
specs/V*.md                         单里程碑接口与验收
docs/PROJECT_STATUS.md              实现进度 / 差距
docs/V2_VISUAL_SPEC.md              视觉契约
docs/V2_REAL_API_ACCEPTANCE.md      接真 API 清单
docs/BRAIN_MCP.md                   MCP 只读查询
```

**双文档注意：** 仓库同时有 `AGENT.md`（长 RFC）与 `AGENTS.md`（agent 约束）；新改动以 **`AGENTS.md`** 为准，旧 spec 可能仍引用 `AGENT.md`。

---

## 12. 当前实现状态（2026-06）

- **V0–V7 spec**：索引上均为 ✅（mock / harness 可演示）。
- **v2 UI**：沉浸式主界面 + 自检 HUD 已落地；主界面与自检页 **均无四角 HUD 角标**；仅保留设置按钮。
- **真 API**：OpenAI Realtime / LLM / EverMemOS 有 adapter，**验收期**才需真 Key；见 `docs/V2_REAL_API_ACCEPTANCE.md`。
- **CI**：GitHub Actions — check、coverage ratchet、visual-smoke、tauri-build。

---

## 13. Agent 常见任务速查

| 你要做… | 先看 | 别碰 |
|---------|------|------|
| 改主界面布局/光球 | `ImmersiveScene.tsx`, `index.css` | 勿加说话/麦克风按钮 |
| 改自检动画 | `CompanionSelfCheckScreen.tsx`, `runLaunchSequence.ts` | 勿加可见操作按钮 |
| 改入库逻辑 | `ingestActions.ts`, `ConversationConductor.ts` | 勿绕过语音确认 create |
| 改自动 merge/link | `autoCurate.ts`, `runAutoCuratePipeline.ts` | 勿经 proposal inbox 主路径 |
| 改图谱渲染 | `BrainGraphView.tsx`, `graphVisualTokens.ts` | 注意 visual snapshot 模式 |
| 改存储 schema | `schemaMigrations.ts` + 双端 adapter | 必须可迁移、有测试 |
| 接真语音 | `openaiRealtimeVoiceProvider.ts` | 保持 `VoiceProvider` 接口 |
| 加依赖 | — | 非必要不加；栈在 AGENTS.md 锁定 |

---

## 14. 视觉回归说明

- 配置：`scripts/visual-feedback/config.mjs`
- Baseline：`assets/companion-*.png`（V2 默认）；legacy 概念图 `main-ui-graph-voice.png` 等仍保留
- 产物：`artifacts/visual-feedback/`（gitignore）
- 主界面 compare 使用 **ignore rect** 遮罩左侧星图区，主要对比右侧光球/设置区

---

## 15. 维护本文档

当发生以下变化时，请更新本节对应章节：

- 新增 V 系列 spec 或 cutover 里程碑
- 主 UI 入口变更（非 `ImmersiveScene` / `LaunchScene`）
- Provider 接口或合法写图谱路径变化
- 默认 dev/CI 命令变化

**本文档不负责：** 逐条 API 签名、完整 spec 验收清单——那些仍在 `specs/*.md`。
