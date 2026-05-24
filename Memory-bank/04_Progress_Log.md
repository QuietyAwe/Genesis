# 进度日志 (Progress Log)

## 2026-05-24: 沉浸夜间模式 + 剧场沉浸态 + 流式输出动画 + 振动反馈

### 1. 沉浸夜间模式 (Dark Mode)
- `src/hooks/useTheme.ts`: 新建 `useTheme` hook，基于 `useColorScheme()` 自动跟随系统深浅色模式
  - 深色模式：纯黑背景 `#000000`，主文本 `#D1D5DB`（低对比度浅灰），无高强度白光
  - 浅色模式：保持原有白色背景 + 深色文本
- 所有屏幕已接入 `useTheme`：ArchiveScreen, ChroniclesScreen, SettingsScreen, StageSetupScreen, CreateCharacterScreen, CreateWorldScreen, CharacterDetailScreen, WorldDetailScreen, PromptBlueprintScreen, StageScreen
  - 采用 "双源" 策略：JSX 使用 `const { colors } = useTheme()` 获取动态颜色；StyleSheet 保留静态 `colors` 引用作为 fallback，JSX 中通过 inline style 覆盖

### 2. 剧场沉浸态 (Immersive Stage)
- `src/screens/StageScreen.tsx`:
  - 新增 `headerAnim` 和 `inputAnim` 两个 `Animated.Value` 控制顶部 Header 和底部输入栏的显隐
  - `handleScroll` 监听 FlatList 滚动：向下滚动 >60px 时平滑隐藏 UI；向上滚动 >60px 时重新淡入
  - `handleTapToReveal`：在沉浸式模式下轻触屏幕空白处，UI 淡入恢复
  - 动画使用 `Animated.parallel` + `Animated.timing`，duration 250ms，opacity + translateY 双重过渡

### 3. 流式输出动画 (Streaming Animation)
- `src/screens/StageScreen.tsx`: 新增 `StreamingText` 组件
  -  incoming SSE 字符逐个以 80ms duration 的 `Animated.timing` 淡入 + 轻微上移（translateY: 4→0）
  - 每个字符有独立的 `Animated.Value`，确保平滑的逐字跃出效果
  - 流式结束后，字符保持完全渲染状态

### 4. 振动反馈 (Haptic Feedback)
- `src/utils/haptics.ts`: 新建轻量级封装，fallback 静默（Web 端不可用）
  - `lightImpact()` — 轻微触感（发送消息、删除分支）
  - `mediumImpact()` — 中等触感（自动推演、重新生成）
  - `selection()` — 选择触感（切换身份、切换分支、点击角色头像）
  - `notification()` — 通知级触感（成功/警告/错误）
- `src/screens/StageScreen.tsx`: 关键操作集成振动
  - 发送消息 → lightImpact
  - 点击角色头像（Force Speaker）→ selection
  - 自动推演 → mediumImpact
  - 身份切换 → selection
  - 左滑重新生成 → mediumImpact
  - 左滑删除 → lightImpact
  - 左滑切换分支 → selection

### 新增 Log Tag
| 模块 | Log Tag | 说明 |
|------|---------|------|
| 振动反馈 | `[Haptics]` | Web fallback 触发时静默，不打印日志 |

### 遗留问题
- [ ] `useStageStore.web.ts` 中 `stageId` unused warning（需重命名为 `_stageId`）
- [ ] `useStageStore.ts` 中 `activeBranchId` unused warning
- [ ] 深色模式在 Expo web 端的 `useColorScheme` 兼容性待验证
- [ ] 流式动画在长文本场景下的内存占用需观察（每个字符一个 Animated.Value）

---

## 2026-05-24: ESLint 修复 + 项目初始化补齐

### ESLint 修复 (0 errors, 17 warnings)
- `src/screens/StageSetupScreen.tsx`: `loadEditStage` 函数移到 `useEffect` 之前，消除 "access before declare" 错误；`useEffect` 依赖数组添加 `editStageId`
- `src/screens/CreateCharacterScreen.tsx`: `name.trim()` 提取为 `trimmedName` 变量，消除 `useMemo`/`useEffect` 依赖数组中函数调用的 lint 错误

---

## 2026-05-24: 视界隔离 + 截断摘要 + 活跃度动态权重 + 删除分支优化

### 本次完成 (Done)

#### 1. 视界隔离 (Fog of War)
- `src/services/api/promptAssembler.ts`: `assembleSystemPrompt` 新增 `speakerId` 参数
  - `buildCharPromptBlock` 改造：发言角色获得**完整角色卡片**（名称+设定+活跃度），其他角色**只显示名字**
  - 新增提示："你不了解他们的详细设定，请根据对话历史判断他们的态度和立场"
  - 发言角色的 `coreSetting` 作为高权重独立模块注入 `[你的记忆: xxx]`
- `src/stores/useStageStore.ts`: `triggerAutoReply` 和 `regenerateMessage` 传入 `speakerId`
- `src/stores/useStageStore.web.ts`: 同上

#### 2. 截断自动摘要 (Auto-Summary on Truncation)
- `src/services/api/promptAssembler.ts`: 新增 `summarizeStage()` 函数
  - 用低 temperature (0.2)、maxTokens 200 发起轻量 LLM 请求
  - 取最后 30 条消息作为摘要上下文
  - 50 字以内概括关键剧情
- `src/services/api/promptAssembler.ts`: `buildApiMessages` 返回 `{ apiMessages, needsSummary }`
- `src/stores/useStageStore.ts`: `triggerAutoReply` 在 `needsSummary=true` 时先调 `summarizeStage`，结果注入 system prompt 的 `[舞台剧情提要]` 模块
- `src/stores/useStageStore.web.ts`: 同上

#### 3. 活跃度动态权重
- `src/stores/useStageStore.ts`: 新增 `runtimeActivity: Map<string, number>` 纯内存状态
  - 进入舞台时从 DB 初始值重置（切换舞台自动回归初始设定）
  - 每次角色发言后：发言者 -1，随机其他角色 +1
- `src/services/scheduler/hybridRouter.ts`: `weightedRandom` 和 `decideNextSpeaker` 接受可选的 `runtimeActivity` Map

#### 4. 角色创建 — 高阶设定折叠面板
- `src/screens/CreateCharacterScreen.tsx`: 基础表单下方新增 `› 高阶设定` 折叠入口
  - 展开后提供三档位选择：`沉默寡言`(2) / `普通`(5,默认) / `话痨抢答`(8)
  - 极简 Tag 按钮风格，不使用原生 Slider

#### 5. 左滑删除 — 按分支截断
- `src/stores/useStageStore.ts`: 新增 `deleteBranch(branchId, msgId)` action
  - 删除该消息及同分支中排在它之后的所有消息，保留前半段
  - 删除后自动切换到剩余分支
- `src/services/db/chatDao.ts`: 删除按 ID 逐条执行（保留其他分支数据）
- `src/screens/StageScreen.tsx`: 左滑删除调用改为 `deleteBranch(item.branchId, item.id)`

### 新增 Log Tag

| 模块 | Log Tag | 说明 |
|------|---------|------|
| 摘要生成 | `[PromptAssembler::Summary]` | 摘要生成开始/完成/失败、摘要内容 |
| 活跃度动态 | `[Stage::Activity]` | 发言者-1、幸运角色+1 的权重变化 |

### 遗留问题与下一步
- [ ] 原生端 SQLite + API 请求链路尚未真机测试
- [ ] 截断摘要功能需要在实际长对话场景中验证摘要质量
- [ ] 视界隔离在多角色场景下的 LLM 行为表现需要观察

---

## 2026-05-20: 批量实现 — 页面补齐 + 状态流优化 + ESLint

### 本次完成 (Done)

#### 1. ChroniclesScreen 历史归档 (DONE)
- `src/screens/ChroniclesScreen.tsx`: 从空白占位改为完整历史列表
- 从 localStorage 读取舞台数据，展示舞台名称、日期、消息数、角色标签
- 点击条目可导航回 Stage 页

#### 2. 模型参数设置 (DONE)
- `src/stores/useSettingsStore.ts` / `.web.ts`: 新增 `contextWindow` 和 `customPromptTemplate` 字段
- `src/services/secureStore.ts` / `.web.ts`: 新增对应 getter/setter
- `src/screens/SettingsScreen.tsx`: 新增 Context Window 输入框 + 提示词蓝图入口链接

#### 3. Prompt 蓝图编辑器 (DONE)
- `src/screens/PromptBlueprintScreen.tsx`: 新页面，支持编辑自定义系统 Prompt 模板
- 变量标签按钮：`{{world_lore}}`、`{{char_prompt}}`、`{{history_n_turns}}`、`{{stage_status}}`
- 预览拼接结果功能
- `src/services/api/promptAssembler.ts`: `assembleSystemPrompt` 支持变量替换
- 导航路由已注册 (`RootStackParamList.PromptBlueprint`)

#### 4. Agentic Import 扩充 (DONE)
- `src/screens/CreateCharacterScreen.tsx`: 新增 Wiki 粘贴导入面板
  - 单条解析时自动填入名称+设定字段
  - 多条解析时批量导入角色卡片
- `src/screens/CreateWorldScreen.tsx`: 新增 Wiki 粘贴导入面板
  - 解析为世界观名称+lore 并自动填入表单

#### 5. Markdown 导出 (DONE)
- `src/services/export/markdown.ts`: 新模块，将舞台数据导出为格式化 Markdown
  - 包含舞台元信息（名称、日期、世界观、角色列表）
  - 旁白使用斜体剧本格式，角色/用户发言使用 **名字：** 格式
- `src/screens/StageScreen.tsx`: 顶部新增导出按钮（📋），点击复制 Markdown 到剪贴板

#### 6. ESLint 配置 (DONE)
- 新增 `eslint.config.js`（ESLint 9.x flat config）
- `package.json`: 新增 `lint` 和 `typecheck` 脚本
- `npm run lint`: exit code 0（16 个 warning，0 errors）
- `npx tsc --noEmit`: exit code 0

### 关键 Log Tag

| 模块 | Log Tag | 说明 |
|------|---------|------|
| LLM 流式 | `[Stage::LLM]` | 流式生成开始/完成、模型、发言人、字数 |
| 调度器 | `[Stage::Scheduler]` | nextSpeakerId、选中原因 (mention/question/activity) |
| 自动推演 | `[Stage::AutoReply]` | 链路启动/完成、turn 数 |
| 消息重生成 | `[Stage::Regen]` | 重生成特定消息 |
| 分支切换 | `[Stage::Branch]` | branchId 切换 |
| Prompt 压缩 | `[PromptAssembler::Compression]` | 截断窗口大小、tool 配对检测 |
| 导出 | `[Stage::Export]` | Markdown 导出字符数 |
| Agentic Import | `[AgenticImport]` / `[AgenticImport::CreateChar]` | 解析条目数、错误 |

### 遗留问题与下一步
- [ ] 长对话 tool_call 配对保护需要在实际 LLM tool use 场景中验证
- [ ] Agentic Import 目前纯本地正则解析，可考虑接入低温 LLM 做更精准的结构化提取
- [ ] StageScreen 的分支创建（用户主动切换世界线）UX 流程可进一步细化
- [ ] 原生端 SQLite + API 请求链路尚未真机测试

---

## 2026-05-09
**状态:** 核心引擎已打通 — Prompt 组装 + 调度算法 + LLM 流式响应

### 已完成 (Done)
- [x] 数据库扩展：新增 stages 表 + messages 表（含 branchId 支持多世界线）
- [x] API 客户端：`services/api/client.ts` — 兼容 OpenAI 格式的流式 SSE 解析器
- [x] Prompt 组装器：`services/api/promptAssembler.ts` — 系统 Prompt 蓝图引擎（世界观+角色卡+舞台状态）
- [x] 调度引擎：`services/scheduler/hybridRouter.ts` — 三级优先级发言调度（@提及 > 问句捕获 > 活跃度权重）
- [x] 舞台 Store：`stores/useStageStore.ts` — 舞台创建/加载/消息发送/自动推演/流式渲染
- [x] StageScreen 重构：流式对话展示 + 底部输入框 + 身份切换（旁白/附身/神秘人）+ 角色头像快速点名
- [x] 所有新模块 Web stubs（chatDao / stageDao / useStageStore / secureStore 等）
- [x] TypeScript 编译全绿
- [x] Web 端打包成功（539 modules）

### 已知问题与技术债 (Issues & Tech Debt)
- Web 端 SQLite / SecureStore 全部为 no-op stub，仅原生端可用
- 消息流在 SQLite 中未做分页/懒加载，长对话可能有性能问题
