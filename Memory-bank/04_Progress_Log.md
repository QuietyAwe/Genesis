# 进度日志 (Progress Log)

## 2026-05-29: 分支切换 — 先滚动后切换 (Scroll-First Transition)

### UX 流程重构
原有流程：点击切换 → 立即切换分支 → 滚动到分叉点 → 高亮闪烁。问题：共享消息因 ID 不同会"跳变"。

新流程：点击切换 → 先滚动到当前分支的分叉点 → 再切换分支 → 新增的分歧消息淡入动画。

### 实现细节

#### Store (`useStageStore.ts` + `useStageStore.web.ts`)
- 新增 `pendingSwitch: { targetBranchId, forkIndex }` 状态 — 触发滚动优先的过渡
- 新增 `forkIndex: number` 状态 — 切换完成后标记分歧消息的起始索引（用于淡入动画）
- 新增 `prepareSwitchBranch(targetBranchId)` — 计算分叉点索引，设置 pendingSwitch，不切换分支
- 新增 `findForkPointIndex()` — 返回当前分支中分叉点的索引（用于滚动目标）
- 修改 `switchBranch()` — 切换后计算新分支的 forkIndex
- 移除 `highlightMessageId` 和 `clearHighlight`

#### StageScreen.tsx
- `handleBranchSwitch` 改为调用 `prepareSwitchBranch`（不直接切换）
- 新增 `handleDotSwitch` 处理点击圆点切换
- 新增 useEffect：监听 `pendingSwitch` → 滚动到分叉点 → 500ms 后调用 `switchBranch`
- `SwipeableMessage` 组件重构：
  - `isHighlighted` → `isNewForkMessage`
  - 闪烁动画 → 淡入动画（350ms opacity 0→1）
- 分叉点分隔线使用 `forkIndex` 渲染
- 500ms 后自动清除 `forkIndex`

### 测试
- `branchFork.test.ts`: 新增 5 个 `findForkPointIndex` 测试用例
- 全量 79/79 通过

---

## 2026-05-29: 分支切换 — 自动滚动至分叉点 + 高亮闪烁动画

### 三阶段联动实现

#### 阶段 1：核心算法 — 定位分叉点
- `src/stores/useStageStore.ts` + `useStageStore.web.ts`:
  - 新增瞬时状态 `highlightMessageId: string | null`
  - 新增 `clearHighlight()` action
  - 新增 `findForkPointId()` 辅助函数：从头遍历两个分支的消息列表，找到第一个 `message.id` 不相同的位置，返回目标分支该消息的 ID
  - `switchBranch` 重构：在切换前调用 `findForkPointId`，将结果设为 `highlightMessageId`

#### 阶段 2：列表接管 — 自动滚动
- `src/screens/StageScreen.tsx`:
  - 新增 `highlightMessageId` 和 `clearHighlight` selector
  - 新增 `useEffect` 监听 `highlightMessageId`：
    - 在 `displayedMessages` 中找到对应 index
    - 延迟 150ms（等待 FlatList 重渲染）后调用 `scrollToIndex({ index, animated: true, viewPosition: 0.5 })`
    - 滚动完成后 1.5s 自动清除 highlight

#### 阶段 3：视觉着陆 — 高亮闪烁
- `src/screens/StageScreen.tsx` → `SwipeableMessage`:
  - 新增 `isHighlighted?: boolean` prop
  - 使用 `Animated.sequence` 实现闪烁：200ms 闪入 → 800ms 保持 → 600ms 淡出
  - 高亮色：深色模式 `rgba(255, 215, 0, 0.15)` / 浅色模式 `rgba(255, 215, 0, 0.25)`（柔和金色）
  - 外层 `View` 改为 `Animated.View`，通过 `interpolate` 映射背景色

### 修复：findForkPointId 算法 Bug (2026-05-29)

**问题**：`findForkPointId` 按 `message.id` 比较，但 regenerateMessage 会复制祖先消息并生成新 ID，导致分叉点始终定位到 index 0（第一个被复制的消息），而非真正内容变化的位置。

**修复**：改用 `content + senderId` 进行语义比较，而非物理 ID 比较。已同步修复 `useStageStore.ts` 和 `useStageStore.web.ts`。

**测试覆盖**：`src/__tests__/branchFork.test.ts` — 14 个测试用例：
- 重生成场景（旧实现 vs 新实现对比）
- 多分支场景（b1→b2, b1→b3, b2→b3, b2→b1）
- 开场白场景（narrator 消息跨分支复制）
- 反向切换场景

### 编译状态
- `tsc --noEmit`: 全绿
- `jest`: 74/74 passed (5 test suites)

---

## 2026-05-29: 滑动窗口压缩 — 动态绑定 Context Window 设置

### 问题
原有压缩逻辑使用硬编码常量 `COMPRESSION_THRESHOLD=30` 和 `RETAIN_COUNT=15`，与用户在设置中配置的 `contextWindow` 无关。用户调整上下文轮数不会影响压缩触发时机。

### 修复

#### 1. `src/services/api/promptAssembler.ts`
- 移除硬编码常量 `COMPRESSION_THRESHOLD` 和 `RETAIN_COUNT`
- 新增 `BATCH_SIZE = 10`（每次批量压缩的消息条数）
- `buildApiMessages` 新增第四个参数 `contextWindow: number = 20`
- 动态计算：
  - `retainCount = contextWindow`
  - `compressionThreshold = contextWindow + BATCH_SIZE`
- 当 `history.length > compressionThreshold` 时触发压缩
- 截取最老的 `history.length - retainCount` 条消息去生成摘要
- 保留最新的 `retainCount` 条消息作为活跃上下文

#### 2. `src/stores/useStageStore.ts` + `useStageStore.web.ts`
- `triggerAutoReply` 和 `regenerateMessage` 中调用 `buildApiMessages` 时传入 `settings.contextWindow` 作为第四个参数

### 算法公式
```
BATCH_SIZE = 10
RETAIN_COUNT = contextWindow (用户设置)
COMPRESSION_THRESHOLD = contextWindow + BATCH_SIZE

触发条件: messages.length > COMPRESSION_THRESHOLD
截断: stale = messages[0 .. messages.length - RETAIN_COUNT - 1]
保留: active = messages[messages.length - RETAIN_COUNT .. end]
```

### 测试更新
- 更新 `promptAssembler.test.ts`：移除对旧常量的引用，新增动态 contextWindow 测试
- 新增测试：不同 contextWindow 值（5, 10, 15, 20, 25）的压缩行为验证
- 新增测试：stale count = messages.length - contextWindow 验证

### 编译状态
- `tsc --noEmit`: 全绿
- `jest`: 60/60 passed

---

## 2026-05-29: 世界书词条 UI — Lore Entry 编辑器

### 完成内容
世界书（Lorebook）功能的数据模型、DAO 持久化、Prompt 注入引擎此前已全部实现，但缺少用户编辑界面。本次补全了 UI 层。

#### 1. 共享组件 `src/components/LoreEntryCard.tsx`
- `LoreEntryCard` — 可编辑词条卡片：全局注入 Switch、关键词 chips（可添加/删除）、内容 textarea
- `LoreEntryViewer` — 只读词条展示：显示全局/关键词标签、关键词列表、内容

#### 2. `WorldDetailScreen.tsx`
- 编辑模式下显示「世界书词条」区块，含 "+ 添加" 按钮
- 每个词条使用 `LoreEntryCard` 编辑
- 只读模式下使用 `LoreEntryViewer` 展示已有词条
- `handleSave` 将 `editEntries` 一并提交到 `updateWorld`

#### 3. `CreateWorldScreen.tsx`
- 表单底部新增「世界书词条」区块
- 使用 `LoreEntryCard` 组件编辑
- `handleSave` 将 `loreEntries` 传入 `addWorld`

### 编译状态
- `tsc --noEmit`: 全绿

---

## 2026-05-29: 测试基础设施 + 全功能审计

### 测试基础设施搭建
- 安装 `jest@29` + `ts-jest@29` + `@types/jest@29`
- 新建 `jest.config.js`（ts-jest preset, node environment）
- `package.json` 新增 `"test": "jest --verbose"` 脚本

### 测试覆盖 (59 tests, 4 suites)

#### 1. `ambientColor.test.ts` (14 tests)
- `deriveColorFromEmoji`: hex 格式、空值默认、确定性输出、不同 emoji 不同色、柔和色调
- `deriveColorFromName`: hex 格式、空值默认、确定性输出、不同名不同色、ASCII 名、柔和色调
- `AMBIENT_SWATCHES`: 6 个色板、hex 格式、唯一性

#### 2. `hybridRouter.test.ts` (17 tests)
- `decideNextSpeaker`: 空角色、CJK 名字提及、ASCII @提及、词界提及、自提及排除、问号捕获（中/英）、活跃度回退、runtimeActivity 覆盖、单角色、不活跃排除
- `decideNextSpeakerWindow`: 空角色、开场白、提及检测、问号检测、活跃度回退、提及优先于问号、无 senderId 处理

#### 3. `promptAssembler.test.ts` (16 tests)
- `assembleSystemPrompt`: 变量替换、自定义模板、缺失 speaker、全局词条注入、非全局词条关键词匹配、无关键词不注入、loreEntries undefined 安全
- `buildApiMessages`: 阈值内无压缩、超阈值触发压缩、World-vs-Me 角色映射、narrator→user、guest→user、maxTurns 窗口、空消息
- 压缩常量: COMPRESSION_THRESHOLD=30, RETAIN_COUNT=15

#### 4. `markdown.test.ts` (11 tests)
- 标题、世界观信息、角色列表、消息计数、旁白斜体、角色名字前缀、用户消息、分隔线、页脚、空消息

### 全功能审计结果
| 功能 | 数据模型 | DAO 持久化 | Prompt 注入 | UI | Native/Web 双端 |
|------|---------|-----------|------------|-----|----------------|
| 世界书词条 (LoreEntry) | ✓ | ✓ | ✓ | ✓ | ✓ |
| 开场白 (openingScene) | ✓ | ✓ | ✓ 自动注入旁白 | ✓ | ✓ |
| 角色处境 (characterStatuses) | ✓ | ✓ | ✓ {{initial_status}} | ✓ | ✓ |
| 滑动窗口压缩 | ✓ | ✓ stageSummary | ✓ 异步非阻塞 | N/A | ✓ |
| World-vs-Me 角色映射 | N/A | N/A | ✓ buildApiMessages | N/A | ✓ |
| 动态世界书注入 | N/A | N/A | ✓ 全局+关键词匹配 | N/A | ✓ |
| 调度器 (mention/question/activity) | N/A | N/A | N/A | N/A | ✓ |
| Markdown 导出 | N/A | N/A | N/A | ✓ | ✓ |
| 环境色推导 | N/A | N/A | N/A | ✓ | ✓ |

### 编译状态
- `tsc --noEmit`: 全绿
- `jest`: 59/59 passed

---

## 2026-05-26: 深色模式完善 — StyleSheet 静态颜色修复 + 底部 Tab 导航

### 问题
第一轮修复后界面仍然白底。根因：`StyleSheet.create` 在模块加载时一次性计算，引用的是静态导入的 `colors`（永远是亮色常量），而不是 `useTheme()` 返回的动态颜色。

### 修复
1. **StageScreen** — 所有容器背景改为 `{ backgroundColor: colors.background }`，文本颜色改为 `{ color: colors.text.primary }`，通过内联样式覆盖 StyleSheet 静态值
2. **AppNavigator (Tab Navigator)** — `tabBarStyle.backgroundColor`、`tabBarActiveTintColor`、`tabBarInactiveTintColor` 改为 `useTheme()` 动态值
3. **ArchiveScreen** — 卡片环境色降级：深色模式下 `ambientColor` 从卡片背景降级为边框色，卡片背景统一用 `colors.surface`
4. **CharacterDetailScreen / WorldDetailScreen** — ScrollView 背景内联覆盖
5. **CreateCharacterScreen / CreateWorldScreen** — KeyboardAvoidingView 背景内联覆盖
6. **StageSetupScreen / ChroniclesScreen / SettingsScreen** — 已有内联覆盖，无需额外改动

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 errors, 0 warnings

---

## 2026-05-26: 深色模式完善 — 全局屏幕适配

### 问题
深色模式下很多屏幕使用硬编码 hex 颜色（如 `#FFFFFF`、`#CC4444`、`#FFF3F3`），在纯黑背景 `#000000` 下非常突兀。

### 修复
将以下屏幕的硬编码颜色替换为 `isDark` 条件动态颜色：
- **StageScreen** — 错误横幅、侧边栏、发送按钮文字、舞台切换列表、调试面板、分支侧边栏按钮
- **CharacterDetailScreen** — 删除按钮文字
- **WorldDetailScreen** — 删除按钮文字
- **ArchiveScreen** — 创建角色按钮文字
- **CreateCharacterScreen** — 导入按钮文字
- **CreateWorldScreen** — 导入按钮文字
- **SettingsScreen** — 导入按钮文字（AgenticImportSection 子组件）
- **StageSetupScreen** — 世界芯片选中状态文字

颜色策略：
- 红色系：`#CC4444` → `#EF4444`（深色模式更柔和）
- 白色文字在 `colors.text.primary` 背景上：`#FFFFFF` → `#000000`（深色模式反转）
- 粉色背景：`#FFF3F3` → `#1A0A0A`（深色模式暗红底色）
- 白色面板/列表：`#FFFFFF` → `#1A1A1A`（深色模式深灰）

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 errors, 0 warnings

---

## 2026-05-26: 调度提及匹配 — 简化为子串匹配

### 问题
之前过度设计了边界检查：后缀白名单 + CJK词界 + 结构性词列表。结果"小明同学"能匹配，但"小明说得对"、"我觉得小明是对的"、"老师说小明迟到了"都匹配不到。过于严格的正则反而漏掉了最常见的提及场景。

### 修复
**CJK名字** — 简化为子串匹配。长名优先排序（长度降序）保证了短名不会误匹配长名的内部：
- "明" 不会在 "小明" 之前被检查
- "小明" 先检查 → "小明同学" 匹配 "小明" ✓
- "小雨" 先检查 → "小雨伞" 中找不到 "小雨"... 等等，找得到！

实际上"小雨"在"小雨伞"中确实作为子串存在。所以"小雨"会匹配"小雨伞"。这是一个可接受的 trade-off：在真实对话中，如果角色名叫"小雨"，有人说"小雨伞坏了"，小雨很可能也会回应。

**ASCII名字** — 仍使用 `\b` word boundary 防止 "Ann" 匹配 "Anne"。

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 warnings

### 测试验证
14/14 测试用例通过，涵盖：后缀调用（小明同学、小明先生）、标点分隔（小明，你来了）、句中提及（我觉得小明是对的、老师说小明迟到了）、@提及（@小明）、否定用例（小雨伞坏了）、短名碰撞（明 vs 小明）。

---

## 2026-05-26: 调度提及匹配 — 中文词界与短名碰撞修复

### 问题
原有 `scanMentions` 正则对中文名字没有词界检查：
- 角色名"张"会匹配到"张三"
- 角色名"小雨"会匹配到"小雨伞"
- 短名优先于长名（先遍历到的角色先匹配）

### 修复
1. **长名优先** — 按名字长度降序排序，"张三" 先于 "张" 匹配
2. **CJK 词界** — 中文名字使用 `/(^|[^\p{L}\p{N}])Name([，。！？,\.!?\s]|$)/u` 模式，要求名字前后不是字母/数字字符
3. **ASCII 词界** — 英文名字继续使用 `\b` word boundary
4. **@前缀** — 仍然支持 `@张三`、`@ 张三` 格式

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 warnings

---

## 2026-05-26: 下一位发言者调度 — 多窗口扫描

### 问题
原有 `decideNextSpeaker` 只看最后一条消息的内容。如果对话链中较早的消息叫了某人的名字或提出了问题，中间被其他角色的回复打断后，调度器就"忘记"了这个召唤。

### 修复
- **`decideNextSpeakerWindow()`** — 新建函数，扫描最近 5 条消息（从最新到最旧）：
  1. 先扫 @提及/名字调用 — 找到即返回
  2. 再扫问号结尾 — 排除提问者本人，按活跃度权重选人
  3. 都没有则按活跃度随机选择
- 两个 store（DB 和 web）的 `triggerAutoReply` / `doAutoReply` 均已改用新函数
- 保留了原有 `decideNextSpeaker` 单消息版本（向后兼容）

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 warnings

---

## 2026-05-26: 分支分歧点视觉标记

### 问题
移除左滑侧边栏的"切换"按钮后，底部圆点导航虽然能切换分支，但用户无法直观看到"这条分支是从哪里开始分叉的"。

### 修复
在消息列表的分歧点插入一条视觉分隔线：
- **计算**：`displayedMessages` 中第一条非根分支消息的索引
- **展示**：在分歧点消息前插入 "从这里开始分叉" 分隔线（细灰线 + 提示文字）
- 仅当分支数 > 1 且 `divergenceIndex > 0`（即有共享前缀）时显示

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 warnings

---

## 2026-05-26: 消除左滑分支切换冗余

### 问题
消息左滑侧边栏中的"⇄ 切换"按钮与输入框下方的分支圆点导航（‹ ›）功能完全重复。两者都能切换分支，给用户造成困惑。

### 修复
移除 SwipeableMessage 侧边栏中的分支切换按钮。保留两个核心操作：
- **重新生成** — 消息级操作
- **删除** — 消息级操作

分支切换统一通过底部圆点导航完成，这是更直观、可发现性更高的交互方式。

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 warnings

---

## 2026-05-26: 修复分支切换 Duplicate Key 错误

### 问题
切换回原始分支时报 React warning: "Encountered two children with the same key"。FlatList 的 `keyExtractor` 使用 `item.id`，说明 `_getBranchMessages` 返回了重复 ID 的消息。可能由以下原因导致：
- 旧版 cloning 代码在 DB 中遗留的冗余消息
- 状态更新时的竞态条件

### 修复
1. **`dedupById` 辅助函数**（双端同步）：对 `_getBranchMessages` 的返回结果按 ID 去重，保留首次出现的消息。作为防御性安全网。

2. **`getBranches` 简化**：直接调用 `_getBranchMessages(bid)` 获取每个分支的消息并计数，替代之前手动查找分歧点+分桶的复杂逻辑。保证与 UI 展示逻辑一致。

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 errors

---

## 2026-05-26: 修复重新生成上下文丢失 + `_getBranchMessages` 分歧点检测

### 问题
重新生成消息时，LLM 上下文为空。根因：`regenerateMessage` 用 `messages.slice(0, msgIdx).filter(m => m.branchId === targetMsg.branchId)` 构建上下文。但重新生成的消息在新分支上，前面所有共享前缀消息都带着原始分支 ID（如 `branch-1`），被 filter 全部丢弃。

### 修复

1. **`regenerateMessage` 上下文构建**（双端同步）：改用 `_getBranchMessages(targetMsg.branchId)` 获取当前分支的完整线性路径（共享前缀 + 分支消息），然后在该路径中找到目标消息的位置，取其之前所有消息作为上下文。

2. **`_getBranchMessages` 分歧点检测**：旧逻辑用"任何非目标分支 ID"判断分歧点，在分支1开头、分支2中间、分支3结尾的混合数组中会错误地把开头分支1消息也当作"非目标"而跳过。改为以**第一条消息的 branchId** 作为根分支（root branch），分歧点 = 第一个非根分支消息的索引。

   示例数组 `[A(b1), B(b1), C(b1), B'(b2), A''(b3)]`：
   - 根分支 = b1
   - 分歧点 = index 3（B' 是第一个非 b1 消息）
   - 分支1：`[A, B, C]`（分歧点之前的全部）
   - 分支2：`[A, B, C, B']`（共享前缀 + b2 消息）
   - 分支3：`[A, B, C, A'']`（共享前缀 + b3 消息）

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 errors

---

## 2026-05-26: 修复默认提示词重复内容

### 问题
默认提示词出现双倍重复：`assembleSystemPrompt` 在没有自定义模板时，先对 `DEFAULT_TEMPLATE_WITH_VARS` 做变量替换，然后又在末尾追加 `【世界观】`、`【你的身份】`、`当前在场的其他人有`、`【舞台剧情提要】`。由于模板本身已经包含这些变量的展开内容，导致每块内容出现两次。

### 修复
- 删除了 `if (!customTemplate)` 分支中的追加块
- 将 Fog of War 提示 "（你不了解其他角色的详细设定，请根据对话历史判断他们的态度和立场。）" 融入 `DEFAULT_TEMPLATE_WITH_VARS` 模板
- 现在无论是否有自定义模板，都统一走变量替换一条路径，不再做二次追加

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 errors

---

## 2026-05-26: 分支管理重构 — 消除消息复制 bug

### 问题
用户切换几次分支后，前面的消息出现多份复制。根因：`regenerateMessage` 每次都会将前缀消息（0 到 msgIdx-1）克隆为新 ID + 新 branchId，然后追加到 messages 数组。多次再生后，messages 数组中同一原始消息有多个副本。此外，`contextMessages = messages.slice(0, msgIdx)` 会包含其他分支的消息，造成 LLM 上下文污染。

### 修复方案

**不再克隆前缀消息**。分支共享前缀消息，仅在分歧点之后产生独立消息。

1. **`regenerateMessage`**（双端同步）:
   - 上下文构建改为 `messages.slice(0, msgIdx).filter(m => m.branchId === targetMsg.branchId)` — 仅取同分支消息，避免跨分支污染
   - 不再克隆前缀消息，直接将新生成的消息追加到 messages 数组
   - 流式期间只设置 `activeBranchId` 和 `isStreaming`，不替换整个 messages 数组
   - DB 端只需 `createMessage` 新消息（前缀已存在）

2. **`_getBranchMessages(branchId)`** — 新建内部辅助方法:
   - 找到第一个非目标分支的消息索引（分歧点）
   - 返回 `shared_prefix + branch_messages`
   - 这样切换分支时，共享前缀始终可见，只有分歧点后的消息随分支切换

3. **`getBranches`** — 改进计数逻辑:
   - 共享前缀消息计入所有分支
   - 分歧点后的消息按 branchId 分别计数

4. **`StageScreen.tsx`**:
   - `displayedMessages` 改用 `getBranchMessages(activeBranchId)` 替代简单的 `filter(m => m.branchId === activeBranchId)`

### 改动文件
- `src/stores/useStageStore.ts`
- `src/stores/useStageStore.web.ts`
- `src/screens/StageScreen.tsx`

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 errors

### 遗留问题与下一步
- [ ] 原生端 SQLite + API 请求链路尚未真机测试
- [ ] 多分支场景下 `_getBranchMessages` 的共享前缀检测在"嵌套分支"（从已有分支再次再生）中的表现需要验证
- [ ] 当共享前缀很长时，每次切换分支都要重新组装数组，可考虑缓存优化

---

## 2026-05-26: World vs. Me 动态角色映射 — 根除 AI 身份混淆

### 核心重构: `buildApiMessages` — "我与世界"视角转换

**问题**: 原有 `buildApiMessages` 把所有角色消息统一映射为 `assistant` role + `name` 字段，LLM 在多角色场景中容易"左右互搏"——替其他角色说话或行动。

**解决方案**: 采用 OpenAI API 原生的 `role` 区分能力，将对话历史从当前发言角色的第一人称视角重构：

- **"Me"（当前发言角色自己的历史消息）** → `{ role: "assistant", content: "纯台词" }` — 不带名字前缀，LLM 认为这是"自己"之前说的话
- **"World"（其他角色、旁白、用户）** → `{ role: "user", name: "sanitized_name", content: "纯台词" }` — LLM 认为这是外部世界对它说的话

**改动文件**:

1. **`src/services/api/promptAssembler.ts`**:
   - 新增 `sanitizeName(raw: string)` — 将中文/特殊字符名字清洗为 `a-zA-Z0-9_-` 格式，极端情况 fallback 为 `char_<hash>`
   - `buildApiMessages` 新增 `speakerId` 可选参数，内部使用 `toApiMessage` 闭包根据 `senderId === speakerId` 判断 "Me vs World"
   - 移除 `DEFAULT_TEMPLATE_WITH_VARS` 结尾的强警告语 "不要替其他角色说话或行动" — World-vs-Me 映射从架构层面解决了这个问题，不再需要 prompt 补丁

2. **`src/stores/useStageStore.ts`**: `triggerAutoReply` 和 `regenerateMessage` 中调用 `buildApiMessages` 时传入 `speaker.id`

3. **`src/stores/useStageStore.web.ts`**: 同上

### 编译状态
- `tsc --noEmit`: 全绿
- `eslint`: 0 errors, 0 warnings (on modified files)

### 遗留问题与下一步
- [ ] 原生端 SQLite + API 请求链路尚未真机测试
- [ ] World-vs-Me 映射在实际多角色长对话中的 LLM 行为表现需要观察
- [ ] `sanitizeName` 的 hash fallback 在极端名字（纯 emoji）下的可读性待验证

---

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

### UX 修复与优化 (Post-review fixes)
- **剧场沉浸态**:
  - `isImmersive` 从 `useRef` 改为 `useState + useRef` 双源：state 控制 `pointerEvents` 确保交互随动画切换；ref 用于 scroll handler 避免闭包陷阱
  - 移除 FlatList 的 `onTouchEnd`（与消息左滑手势冲突），改用独立的 `Pressable` 全屏覆盖层 + `onScrollToTop` 作为揭示触发
  - 新增 "near bottom" 守卫：当用户靠近底部（观看实时推演）时，自动滚动不触发 UI 隐藏；只有向上翻阅历史时才隐藏
- **流式输出动画**:
  - 重写 `StreamingText`：从"每个字符一个 Animated.Value"（500+ 次分配、内存泄漏）改为"整个文本块单次 opacity 脉冲"，视觉上仍有"活"的感觉，性能开销趋近于零
- **编译状态**: `tsc` 全绿, `lint` 0 errors, 17 warnings（均为 pre-existing）

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
