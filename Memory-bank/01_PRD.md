# 产品需求文档 (PRD) + 现有逻辑详述：Genesis (创世纪)

**文档版本:** V 1.2.0 (含现有逻辑详述)
**最后更新:** 2026-05-28
**产品代号:** Genesis

---

## 1. 产品概述

### 1.1 电梯演讲
Genesis 是一款极简主义的 AI 扮演与故事生成器。用户作为"造物主"，只需设定世界观与角色卡牌，即可静观多角色自主交谈、互动并衍生出不可预知的故事情节。应用采用纯本地存储 + **BYOK (Bring Your Own Key)** 模式，保证极高的隐私性、零服务器订阅负担。

### 1.2 技术栈
- **框架:** React Native (Expo ~54.0.33) + TypeScript (strict mode)
- **状态管理:** Zustand (含平台专用 `.web.ts` 扩展，Web 端用 localStorage/in-memory，Native 端用 SQLite)
- **本地存储:** expo-sqlite (单例 DB 模式) + expo-secure-store (API 凭证加密存储)
- **文件系统:** expo-file-system (头像持久化，含 Web 端 blob→base64 转换)
- **LLM 通信:** OpenAI 兼容 SSE 流式请求，含非流式回退路径
- **导航:** React Navigation (Bottom Tabs + Native Stack)
- **触觉反馈:** expo-haptics (Web 端静默降级)

### 1.3 目标用户
- 跑团/TRPG 爱好者
- 同人/小说创作者
- AI 极客/自动化运维玩家

---

## 2. 设计原则

1. **Content is UI** — 无繁杂边框，留白为主，注意力 100% 聚焦于文本
2. **Typography First** — 通过字号、字重、灰度区分信息层级
3. **隐形交互** — 非核心操作隐藏在滑动、长按或折叠面板中
4. **渐进式明细** — 表层极简，深层隐藏 Prompt 引擎与变量系统
5. **暗色优先适配** — 所有 UI 组件必须同时适配 Light/Dark 两套色板

---

## 3. 应用架构与导航结构

### 3.1 导航栈
```
App (Root Stack)
├── Tabs (Bottom Tab Navigator)
│   ├── Archive (图鉴)
│   ├── Stage (舞台)
│   ├── Chronicles (历史)
│   └── Settings (设置)
├── CreateCharacter (新建角色)
├── CreateWorld (新建世界观)
├── CharacterDetail (角色详情)
├── WorldDetail (世界观详情)
├── PromptBlueprint (提示词蓝图)
└── StageSetup (舞台设置/编辑)
```

### 3.2 数据流总览
```
图鉴 (ArchiveStore) ──┐
                      ├──▶ 舞台设置 (StageSetup) ──▶ 舞台 (StageStore) ──▶ LLM API
设置 (SettingsStore) ─┘                              │
                                                     ├──▶ 历史 (Chronicles ← SQLite stageDao/chatDao)
                                                     ├──▶ 分支管理 (Branch Fork/Switch/Delete)
                                                     └──▶ 导出 (Markdown 生成)
```

### 3.3 平台差异
| 特性 | Native (iOS/Android) | Web |
|------|----------------------|-----|
| Archive 存储 | SQLite (characterDao/worldDao) | localStorage |
| Stage 存储 | SQLite (stageDao/chatDao) | localStorage |
| Settings 存储 | expo-secure-store + localSettings | localStorage |
| 头像持久化 | expo-file-system copyToPersistent | blob→base64 FileReader |
| ID 生成 | `generateId()` (crypto.randomUUID fallback) | `crypto.randomUUID()` |
| 触觉反馈 | expo-haptics (Light/Medium/Selection/Notification) | 静默降级 (no-op) |
| 主题 | `useColorScheme()` 系统跟随 | `useColorScheme()` 系统跟随 |

---

## 4. 功能需求与现有逻辑详述

### 4.0 主题系统 (Theme)

**文件:** `src/hooks/useTheme.ts`, `src/constants/theme.ts`

#### 已实现逻辑
1. **双色板系统**
   - Light: 白色背景 `#FFFFFF`，深色文本 `#1A1A1A`
   - Dark: 纯黑背景 `#000000`，低对比度浅灰文本 `#D1D5DB`
2. **主题跟随**
   - `colorScheme` 设置支持三种模式: `light` / `dark` / `system` (默认)
   - `system` 模式下跟随 `useColorScheme()` 系统设置
3. **全屏适配策略**
   - 所有屏幕使用 `const { colors, isDark } = useTheme()` 获取动态颜色
   - StyleSheet 静态值作为 fallback，JSX 中通过 inline style 覆盖
   - 深色模式特殊处理: 红色 `#CC4444` → `#EF4444`，粉色背景 `#FFF3F3` → `#1A0A0A`，白色面板 `#FFFFFF` → `#1A1A1A`
4. **Tab 导航适配**
   - `tabBarStyle.backgroundColor`、`tabBarActiveTintColor`、`tabBarInactiveTintColor` 动态跟随主题

---

### 4.1 全局配置 (Settings)

**文件:** `src/screens/SettingsScreen.tsx`, `src/stores/useSettingsStore.ts` / `.web.ts`

#### 已实现逻辑
1. **API Key 管理**
   - 输入框 → 点击"保存"写入 secureStore (Native) 或 localStorage (Web)
   - 加载时从持久层读取并回填
   - Keychain/Keystore 加密存储 (Native)，明文 JSON (Web)

2. **Base URL 管理**
   - 同上，无加密，直接存储字符串

3. **模型选择**
   - 文本输入 + 下拉列表混合模式
   - 点击"获取模型列表" → 调用 `GET /v1/models` → 解析多种响应格式 (OpenAI `data.data`, `data.models`, 直接数组, 直接字符串列表)
   - 常用模型优先排序 (`gpt-4o-mini`, `gpt-4o`, `claude-sonnet-4`, `qwen-*`, `deepseek-*`)，其余按字母排序
   - 支持输入过滤搜索

4. **模型参数**
   - `Temperature` (0-2, 默认 0.8)
   - `Max Tokens` (1-8192, 默认 1000)
   - `Context Window` (1-100 轮, 默认 20)
   - 每个参数独立输入 + 保存按钮，带范围校验

5. **主题设置**
   - 三档选择: 浅色 / 深色 / 跟随系统 (默认)
   - 实时切换，无需重启

6. **Agentic Import (批量角色导入)**
   - 折叠面板，展开后粘贴 Wiki 文本
   - 三级本地解析策略：
     1. Markdown header 分割 (`## Name`)
     2. `Name: description` 模式匹配
     3. 每行作为独立角色 (长度 < 100)
   - 安全上限 20 条
   - 导入角色使用 `deriveColorFromName()` 生成环境色

7. **提示词蓝图入口**
   - 点击跳转 `PromptBlueprintScreen`

#### 错误处理
- `fetchModels` 重新抛出异常 → UI 层 `Alert.alert` 展示详细错误信息
- 结构化日志: `[Genesis::Settings] fetchModels failed:`

---

### 4.2 造物图鉴 (The Archive)

**文件:** `src/screens/ArchiveScreen.tsx`, `src/screens/CreateCharacterScreen.tsx`, `src/screens/CreateWorldScreen.tsx`, `src/screens/CharacterDetailScreen.tsx`, `src/screens/WorldDetailScreen.tsx`

**Store:** `src/stores/useArchiveStore.ts` / `.web.ts`

#### 4.2.1 图鉴列表页 (ArchiveScreen)
- 白色背景卡片列表，分"角色"和"世界观"两区
- **每张卡片使用 `ambientColor` 作为背景色** (fallback: `colors.surface`)
- 深色模式下 `ambientColor` 降级为边框色，卡片背景统一用 `colors.surface`
- 点击角色 → `CharacterDetail`, 点击世界观 → `WorldDetail`
- 右上角 `+ 世界` / `+ 角色` 按钮创建新条目

#### 4.2.2 创建角色 (CreateCharacterScreen)
1. **字段:** 名称 (必填)、核心设定、头像 (可选)、卡片颜色
2. **头像上传:**
   - 请求相册权限 → `expo-image-picker` 选择 → 裁剪为 1:1
   - **Web:** `blob://` → `FileReader.readAsDataURL()` → base64 持久化
   - **Native:** 复制到 `document/avatars/` 目录持久化
   - 未上传时根据名称首字母自动映射 Emoji (A→🅰️, B→🅱️, ..., Z→⚡)
3. **环境色系统:**
   - 6 个预设柔和色块 + 1 个自动衍生色块 (基于名称首字母 Emoji 的 Unicode 码点 → HSL hue)
   - 名称变更时自动更新颜色 (仅当当前颜色仍为默认值时)
   - 手动选择后不再被自动覆盖
4. **高阶设定折叠面板:**
   - 基础表单下方 `› 高阶设定` 折叠入口
   - 展开后提供活跃度三档选择: `沉默寡言`(2) / `普通`(5,默认) / `话痨抢答`(8)
   - 极简 Tag 按钮风格
5. **Wiki 导入:**
   - 同 SettingsScreen 的三级解析策略
   - 单条 → 填入编辑框；多条 → 批量导入 (自动分配 Emoji + 环境色)
6. **保存:** `addCharacter()` → 生成 UUID → 写入 DB/localStorage → `Alert.alert` → `goBack()`

#### 4.2.3 创建世界观 (CreateWorldScreen)
1. **字段:** 名称 (必填)、Emoji (可选)、设定描述、卡片颜色
2. **环境色:** 6 个预设色块，基于名称哈希自动衍生 (非 Emoji 衍生)
3. **Wiki 导入:** 单条解析 (不批量) → 填入名称 + 设定
4. **保存:** `addWorld()` → 写入 DB → `Alert.alert` → `goBack()`

#### 4.2.4 角色详情 (CharacterDetailScreen)
- 查看模式: 头像/Emoji + 名称 + 核心设定
- 编辑模式: 名称输入 + Emoji/图片 URI 输入 + 核心设定文本域
- 删除: `Alert.alert` 确认后调用 `deleteCharacter()`
- `useFocusEffect` 自动同步编辑状态

#### 4.2.5 世界观详情 (WorldDetailScreen)
- 查看模式: Emoji + 名称 + 设定
- 编辑模式: Emoji 输入 + 名称输入 + 设定文本域
- 删除: 确认后调用 `deleteWorld()`

#### 4.2.6 环境色工具 (`src/utils/ambientColor.ts`)
```
deriveColorFromEmoji(emoji):
  Unicode code point % 360 → hue
  saturation = 30 + (code % 20)  → 30-50%
  lightness = 85 + (code % 10)   → 85-94%
  → hslToHex()

deriveColorFromName(name):
  djb2 hash → hue = abs(hash) % 360
  saturation = 25 + abs(hash % 25)  → 25-50%
  lightness = 84 + abs(hash % 10)   → 84-93%
  → hslToHex()

AMBIENT_SWATCHES = ['#F5E6E0', '#E8F0E8', '#E8EDF5', '#F5F0E0', '#EDE8F5', '#F5E8ED']
```

---

### 4.3 舞台与推演 (The Stage) — 核心引擎

**文件:** `src/screens/StageScreen.tsx`, `src/screens/StageSetupScreen.tsx`
**Store:** `src/stores/useStageStore.ts` (Native/SQLite) / `.web.ts` (Web/localStorage)

#### 4.3.1 舞台设置 (StageSetupScreen)
1. **舞台名称** 输入
2. **世界观选择** — 多选 chip，选中变深色背景+白字
3. **角色选择** — 卡片列表多选，选中显示边框高亮 + ✓
4. **编辑模式** — 通过 `route.params.stageId` 加载已有舞台数据，保存时 `updateStage()` 而非创建
5. **保存后** → 自动跳转至 Stage 标签页

#### 4.3.2 舞台主界面 (StageScreen)
1. **顶部导航栏:**
   - 左侧: 舞台名称 + ▾ 箭头 (点击呼出舞台切换器)
   - 右侧: `+` (新建舞台) / `📋` (导出 Markdown) / `▶ 自动推演` 按钮
   - 流式生成时显示 `生成中...` 替代自动推演按钮
   - **长按舞台名称** → 弹出提示词调试面板 (Prompt Inspector)

2. **舞台切换器 (Stage Switcher):**
   - 点击舞台名称/▾ → 弹出全屏 overlay + 下拉列表
   - 列出所有舞台，当前舞台高亮 + ✓
   - 点击切换舞台，重置身份模式和选中角色
   - **长按舞台项** → `Alert.alert` 确认后删除该舞台及其所有聊天记录
   - 底部 `+ 新建舞台` 按钮

3. **消息渲染:**
   - 剧本流排版，无气泡
   - 角色消息: `MessageItem` 组件 (头像/图片 + 名称 + 内容)
   - 旁白消息: 斜体灰色文本 (`narratorBlock`)
   - 流式消息: `StreamingText` 组件，opacity 脉冲动画 (0.7→1, 180ms 周期)
   - **分支过滤:** `displayedMessages` 按 `activeBranchId` 过滤

4. **左滑操作 (SwipeableMessage):**
   - `PanResponder` + `Animated.Value` + `translateX`
   - 侧边栏固定 `right: 0`, `width: 140px`, `position: absolute`
   - 内容层有实心背景色，覆盖在侧边栏上方 (z-order)
   - 容器 `overflow: hidden` 裁切
   - 侧边栏两个按钮:
     - **↻ 重新生成** — fork 新分支 + LLM 重新生成
     - **🗑 删除** — 按分支截断 (删除该消息及同分支后续消息)
   - 手势逻辑:
     - `onStartShouldSetPanResponder`: 侧边栏已打开时返回 `false`，让触摸穿透到按钮
     - `onMoveShouldSetPanResponder`: 水平位移 > 25px 且水平 > 垂直×3 时接管
     - 松手时: 滑动超过一半 → `snapTo(-140)` 打开，否则 `snapTo(0)` 关闭
   - 重新生成: 调用 `onRegenerate()` + 2 秒防抖 → 不自动关闭侧边栏
   - 删除: 调用 `onDelete()` + 自动关闭侧边栏

5. **分支管理系统 (Branch / Parallel Timelines):**
   - 每条消息属于一个 `branchId`，分支从分歧点开始独立
   - **重新生成 = Fork**: 找到目标消息 → 提取祖先树 (共享前缀) → 生成新 `branchId` → 复制祖先到新分支 → LLM 重新生成 → 新消息写入新分支
   - **分支切换**: 底部圆点导航 (‹ [● ● ●] ›)，点击圆点或左右箭头切换分支
   - **分支删除**: 左滑删除按分支截断，删除后自动切换到剩余分支
   - **分支数据隔离**: DB 和 Store 中消息严格按 `branchId` 隔离，旧分支消息永不修改
   - `getBranches()` 枚举所有分支: `{ branchId, label: "#N", msgCount }`

6. **角色快照 (Character Snapshots):**
   - 创建舞台时，将所有参与角色的完整数据 (name, avatar, coreSetting, activityLevel, ambientColor) 快照存入 `stages.character_snapshots`
   - 加载舞台时: 优先从 Archive 读取实时角色数据；若角色已从图鉴删除，从快照恢复
   - 保证即使删除角色卡牌，已有舞台的对话仍可正常加载和继续

7. **身份切换引擎 (Identity Switcher):**
   - 底部输入框左侧显示当前身份 Icon
   - 点击身份图标循环切换三种模式:
     1. **📜 世界意志 (Narrator)** — `senderType: 'narrator'`
     2. **🎭 附身控制 (Takeover)** — 选择舞台上的角色，`senderType: 'character'`, `senderId: 角色ID`
     3. **👤 空降玩家 (Guest)** — `senderType: 'guest'`

8. **角色头像快捷点名 (Speaker Bar):**
   - 输入框上方显示所有舞台角色头像
   - 点击头像 → 立即切换到该角色身份 + 若有输入内容则直接发送
   - 选中状态: 边框高亮 + 深色背景

9. **底部输入区:**
   - 身份切换按钮 (左侧)
   - 文本输入框 (placeholder 随身份变化)
   - 发送按钮 (流式生成时禁用)
   - 支持 `KeyboardAvoidingView` (iOS padding, Android 默认)

10. **自动推演 (Auto Play):**
    - 点击 `▶ 自动推演` → `triggerAutoReply()`
    - 调度引擎决定下一个发言角色 → LLM 流式生成 → 保存消息 → 自动触发下一轮
    - 流式中按钮变为 `生成中...` 禁用状态

11. **API 错误横幅:**
    - 红色背景横幅，显示错误信息
    - **重试按钮:** 清除错误 + 重新触发 `triggerAutoReply()` (流式中禁用)
    - **关闭按钮:** 仅清除错误状态

12. **提示词调试面板 (Prompt Inspector):**
    - 长按舞台名称 500ms 触发
    - 展示最近一次 LLM 请求的 `systemPrompt` 和 `apiMessages`
    - 等宽字体，可滚动
    - 暂无历史时显示提示文本

13. **导出功能:**
    - 收集舞台信息 + 角色 + 消息 → 生成 Markdown
    - 使用 `exportToMarkdown()` (services/export/markdown.ts)
    - Web 端通过 Clipboard API 复制；Native 端显示 Alert fallback

#### 4.3.3 调度引擎 (Hybrid Routing)
**文件:** `src/services/scheduler/hybridRouter.ts`

调度逻辑决定下一个发言角色:
1. **@ 提及加权** — 正则扫描上一句文本中是否提到角色名/别名
   - CJK 名字: 子串匹配，长名优先排序 (防止短名误匹配)
   - ASCII 名字: `\b` word boundary
2. **问句捕获** — 问号结尾 → 强制切换非提问者作答
3. **性格活跃度** — 角色 `activityLevel` (1-10) 影响随机权重
4. **连续发言抑制** — 上一个发言者自动排除在候选之外

`decideNextSpeakerWindow(characters, messages, runtimeActivity)` 返回 `{ nextSpeakerId, reason }`

**运行时活跃度 (Runtime Activity):**
- 每次进入舞台时从角色 DB 初始值重置
- 每次角色发言后: 发言者 **-2**，随机 2 个其他角色 **+1**
- 活跃度 ≤ 1 的角色被排除在调度候选之外
- 纯内存状态，不持久化

#### 4.3.4 LLM 流式通信
**文件:** `src/services/api/client.ts`

1. **请求构建:** `systemPrompt` + `messages` + `config` → `POST /v1/chat/completions`
2. **SSE 解析:** `data:` 前缀 → JSON parse → `choices[0].delta.content`
3. **非流式回退:** `response.body` 为 null 时 (React Native 环境) → `response.text()` → 尝试 SSE 或 JSON 解析
4. **错误处理:** 网络失败 → `throw Error`, HTTP 错误 → `throw Error` 含状态码和响应体

#### 4.3.5 Prompt 组装
**文件:** `src/services/api/promptAssembler.ts`

- `assembleSystemPrompt({ characters, worldLore, speakerId, stageSummary, lastSpeakerName }, customTemplate)`
- 支持自定义模板 + 变量标签 (`{{world_lore}}`, `{{char_prompt}}`, `{{history_n_turns}}`, `{{stage_status}}` 等)
- **视界隔离 (Fog of War):** 发言角色获得完整角色卡片，其他角色只显示名字
- **World-vs-Me 视角映射:** 发言角色的历史消息映射为 `assistant` role，其他角色映射为 `user` role + sanitized name
  - `sanitizeName(raw)` — 将中文/特殊字符清洗为 `a-zA-Z0-9_-`，极端 fallback 为 `char_<hash>`
- `buildApiMessages(messages, contextWindow, speakerId)` — 截取最近 N 轮对话，返回 `{ apiMessages, needsSummary }`
- `summarizeStage(messages, characters, config)` — 低 temperature (0.2)、maxTokens 200 生成剧情摘要
- `buildStageStatus(characters, lastMsg)` — 生成当前舞台状态摘要
- `AVAILABLE_VARIABLES` — 蓝图页面可用的变量标签列表

---

### 4.4 提示词蓝图 (Prompt Blueprint)

**文件:** `src/screens/PromptBlueprintScreen.tsx`

#### 已实现逻辑
1. **编辑器:** 多行文本域，留空表示使用默认模板
2. **变量标签:** 可点击的 tag 按钮 (`{{world_lore}}`, `{{char_prompt}}`, 等) → 插入光标位置
3. **预览:** 调用 `assembleSystemPrompt()` 展示拼接后的完整 Prompt
4. **保存:** 写入 `customPromptTemplate` → 持久化到 localSettings
5. **重置:** 确认后清空自定义模板，恢复默认

---

### 4.5 历史与导出 (Chronicles)

**文件:** `src/screens/ChroniclesScreen.tsx`

#### 已实现逻辑
1. **列表展示:**
   - 从 SQLite 读取所有 Stage 记录
   - 每条显示: 舞台名称、消息数量、创建时间 (相对时间: 刚刚/X 小时前/X 天前)、关联世界名称、参与角色名称标签
2. **点击打开:**
   - `selectStage(stageId)` → 加载舞台数据 → 跳转至 Stage 标签页
3. **空状态:** "尚无记录" + 提示文本
4. **刷新:** `useFocusEffect` 每次页面获得焦点时重新加载

#### 导出 (StageScreen 内)
- `exportToMarkdown()` 生成纯净 Markdown 文本
- 包含舞台名称、世界观、角色列表、完整对话记录
- 旁白使用斜体格式，角色发言使用 **名字：** 格式
- 通过 Clipboard/下载分享

---

### 4.6 数据库层 (DAO)

**文件:**
- `src/services/db/index.ts` — 单例 DB 初始化 + `seedDatabase()`
- `src/services/db/characterDao.ts` — 角色 CRUD
- `src/services/db/worldDao.ts` — 世界观 CRUD
- `src/services/db/stageDao.ts` — 舞台 CRUD
- `src/services/db/chatDao.ts` — 消息 CRUD

#### 数据模型
```sql
characters (id, name, avatar, core_setting, activity_level, world_id, ambient_color, created_at, updated_at)
worlds (id, name, emoji, lore, ambient_color, created_at)
stages (id, name, world_ids_json, character_ids_json, character_snapshots_json, system_prompt, created_at, updated_at)
messages (id, stage_id, sender_type, sender_name, sender_avatar, sender_id, content, branch_id, is_selected, created_at)
settings (key, value)
```

- 所有 DAO 操作带结构化日志: `[Genesis::DB] createCharacter: xxx`
- `ambient_color` 字段已完整支持 (写入/读取/更新)
- `character_snapshots` 字段存储角色快照 JSON，用于角色被删除后的数据恢复
- 空值处理: Android `runAsync` 不接受 JS `null`，使用空字符串 `''`
- 数据库迁移: `ALTER TABLE stages ADD COLUMN world_ids TEXT` (自动检测)

#### 种子数据 (Seed Data)
首次启动时自动注入:
- **角色:** 西尔维娅 🦊 (情报商)、迦尔纳 🔥 (领航员)、露娜 🌙 (图书管理员)
- **世界观:** 雾港 🌫️ (永雾笼罩的港口城市)

---

### 4.7 触觉反馈系统 (Haptics)

**文件:** `src/utils/haptics.ts`

轻量级 expo-haptics 封装，Web 端静默降级 (try-catch no-op):

| 函数 | 触感级别 | 使用场景 |
|------|----------|----------|
| `lightImpact()` | 轻微 | 发送消息、删除分支 |
| `mediumImpact()` | 中等 | 自动推演、重新生成 |
| `selection()` | 选择 | 切换身份、切换分支、点击角色头像 |
| `notification(type)` | 通知级 | 成功/警告/错误 (预留) |

---

## 5. 非功能需求

### 5.1 可观测性 (Vibecoding 规范)
- **结构化日志格式:** `[Genesis::模块] 描述性信息`
  - `[Genesis::DB]` — 数据库读写
  - `[Genesis::LLM]` / `[Stage::LLM]` — LLM 请求流
  - `[Genesis::Settings]` — 设置操作
  - `[Stage::Scheduler]` — 调度决策
  - `[Stage::Regen]` — 重新生成
  - `[Stage::AutoReply]` — 自动推演链路
  - `[Stage::Activity]` — 运行时活跃度变化
  - `[Stage::Delete]` — 消息/分支删除
  - `[Stage::SwitchBranch]` — 分支切换
  - `[Stage::Summary]` — 剧情摘要生成
  - `[Stage::Export]` — Markdown 导出
  - `[AgenticImport]` — Wiki 解析
  - `[CreateCharacter::Avatar]` — 头像持久化
- **Zustand 状态追踪:** 重要状态变更打印 Payload
- **Try/Catch Everything:** 所有外部调用包裹 try-catch，输出完整错误堆栈

### 5.2 性能
- 页面切换 < 100ms
- 所有环境色/调度运算为本地零 Token 消耗
- SQLite 单例模式，避免重复初始化
- 流式动画使用单次 opacity 脉冲 (非逐字符 Animated.Value)，性能开销趋近于零

### 5.3 安全性
- API Key 使用系统级 Keychain/Keystore 加密 (Native)
- Web 端存储于 localStorage (明文 JSON)
- 所有数据 Local-First，零上传

---

## 6. 已修复的历史 Bug

| Bug | 描述 | 修复 |
|-----|------|------|
| 模型列表截断 | `.slice(0, 15)` 硬限制只显示 15 个 | 移除限制，`useMemo` 排序 + 全部展示 |
| 模型获取错误不显示 | `fetchModels` catch 后不 re-throw | 添加 `throw e` |
| "No response body" 错误 | RN fetch 无 `response.body` 导致流式失败 | 添加非流式回退路径 |
| 重新生成按钮常显 | `position: absolute` 无内容覆盖 | sidebar 先渲染 (底层)，content 后渲染 (实心背景覆盖) |
| 点击按钮侧边栏自动关闭 | `triggerRegenerate()` 后调用 `closeSwipe()` | 移除 `closeSwipe()` 调用 |
| Web 端错误横幅不显示 | `.web.ts` 缺少 `apiError`/`clearApiError` | 补全状态定义、初始化和 catch 块 |
| Settings 批量导入硬编码颜色 | `ambientColor: colors.surface` | 改为 `deriveColorFromName(entry.name)` |
| TS `__getValue` 类型错误 | RN 类型不暴露 `__getValue` | 使用 `panX.addListener()` 追踪值到 ref |
| 深色模式白底 | `StyleSheet.create` 引用静态 colors 常量 | JSX inline style 覆盖 + Tab Navigator 动态颜色 |
| 深色模式硬编码 hex | 多屏幕使用 `#FFFFFF`/`#CC4444` 等固定色值 | `isDark` 条件动态颜色替换 |
| 分支切换 Duplicate Key | 切换回原始分支时 messages 数组有重复 ID | `dedupById` 防御性去重 |
| 重新生成上下文丢失 | 新分支上下文为空 (共享前缀被 branchId filter 丢弃) | 改用 `_getBranchMessages` 获取完整线性路径 |
| 默认提示词重复 | 变量替换后又追加相同内容导致双倍 | 统一走变量替换一条路径 |
| 分支消息复制 bug | 多次再生后前缀消息有多个副本 | 不再克隆前缀消息，分支共享前缀 |
| 调度提及匹配过严 | CJK 名字正则过度设计导致漏匹配 | 简化为子串匹配 + 长名优先排序 |
| 调度只看最后一条 | 多轮对话中的召唤被遗漏 | `decideNextSpeakerWindow` 扫描最近消息 |

---

## 7. 后续迭代规划 (Roadmap)

- **V 1.1 - 记忆胶囊 (Local Vector):** 移动端轻量级向量检索，角色长线记忆
- **V 1.5 - 卡牌隐写术 (Steganography):** 角色 JSON 蓝图嵌入头像图片
- **V 2.0 - 商业化探索:** iCloud 跨端同步 + 深色主题 (已完成基础)

---

## 8. 关键文件索引

| 文件 | 职责 |
|------|------|
| `App.tsx` | 入口: DB 初始化 + 种子数据 + 路由根容器 |
| `src/navigation/AppNavigator.tsx` | Tab + Stack 导航配置 (动态主题色) |
| `src/types/index.ts` | TypeScript 类型定义 (Character, World, Stage, ChatMessage, IdentityMode) |
| `src/constants/theme.ts` | 静态设计系统 (colors, spacing, typography) |
| `src/hooks/useTheme.ts` | 动态主题 hook (light/dark/system 跟随) |
| `src/utils/haptics.ts` | 触觉反馈封装 (expo-haptics + Web 降级) |
| `src/utils/ambientColor.ts` | 环境色衍生工具 |
| `src/stores/useArchiveStore.ts` | Native 图鉴 Store (SQLite) |
| `src/stores/useArchiveStore.web.ts` | Web 图鉴 Store (localStorage) |
| `src/stores/useStageStore.ts` | Native 舞台 Store (SQLite + 分支管理 + 运行时活跃度) |
| `src/stores/useStageStore.web.ts` | Web 舞台 Store (localStorage) |
| `src/stores/useSettingsStore.ts` | Native 设置 Store (secureStore + localSettings) |
| `src/stores/useSettingsStore.web.ts` | Web 设置 Store (localStorage) |
| `src/services/api/client.ts` | LLM 流式/SSE 通信 |
| `src/services/api/promptAssembler.ts` | Prompt 组装 + 变量替换 + 视界隔离 + World-vs-Me 映射 + 剧情摘要 |
| `src/services/scheduler/hybridRouter.ts` | 混合权重调度引擎 (mention > question > activity) |
| `src/services/export/markdown.ts` | Markdown 导出 + 剪贴板复制 |
| `src/services/db/index.ts` | SQLite 单例 + 表初始化 + 种子数据 |
| `src/services/db/*.ts` | SQLite DAO 层 (character, world, stage, chat) |
| `src/services/secureStore.ts` | API 凭证加密存储 |
| `src/services/localSettings.ts` | 本地设置存储 (temperature, maxTokens 等) |
| `src/screens/ArchiveScreen.tsx` | 图鉴列表页 |
| `src/screens/CreateCharacterScreen.tsx` | 创建角色 (含高阶设定 + Wiki 导入) |
| `src/screens/CreateWorldScreen.tsx` | 创建世界观 |
| `src/screens/CharacterDetailScreen.tsx` | 角色详情/编辑 |
| `src/screens/WorldDetailScreen.tsx` | 世界观详情/编辑 |
| `src/screens/StageScreen.tsx` | 舞台主界面 (含 SwipeableMessage + 分支导航 + 舞台切换器 + Prompt Inspector) |
| `src/screens/StageSetupScreen.tsx` | 舞台设置/编辑 |
| `src/screens/ChroniclesScreen.tsx` | 历史记录 |
| `src/screens/SettingsScreen.tsx` | 全局设置 (含主题切换) |
| `src/screens/PromptBlueprintScreen.tsx` | 提示词蓝图编辑器 |

---

*End of Document*
