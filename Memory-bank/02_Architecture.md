# 架构设计 (Architecture)

## 1. 项目目录结构

```
Genesis/
├── app.json                          # Expo 应用配置
├── App.tsx                           # 应用入口
├── src/
│   ├── components/                   # 可复用 UI 组件
│   │   ├── chat/                     # 舞台对话流相关
│   │   │   ├── MessageBubble.tsx     # 剧本流消息行（无气泡）
│   │   │   ├── TimelineIndicator.tsx # 多世界线指示器
│   │   │   └── SwipeableMessage.tsx  # 滑动重生成交互
│   │   ├── cards/                    # 造物图鉴卡片
│   │   │   ├── CharacterCard.tsx     # 角色卡片
│   │   │   ├── WorldCard.tsx         # 世界观卡片
│   │   │   └── AmbientColorPicker.tsx# 环境色预设选择器
│   │   ├── common/                   # 通用组件
│   │   │   ├── CollapsibleSection.tsx# 折叠面板
│   │   │   └── EmptyState.tsx        # 空状态占位
│   │   └── settings/                 # 设置面板
│   │       ├── ApiConfigForm.tsx     # BYOK 密钥配置
│   │       └── PromptBlueprintEditor.tsx # 极客 Prompt 编辑器
│   ├── screens/                      # 页面级组件
│   │   ├── HomeScreen.tsx            # 首页（图鉴瀑布流）
│   │   ├── StageScreen.tsx           # 舞台（核心推演页）
│   │   ├── SettingsScreen.tsx        # 全局设置
│   │   └── ChronicleScreen.tsx       # 历史记录
│   ├── navigation/                   # 路由导航
│   │   └── AppNavigator.tsx          # Stack/Tab 导航配置
│   ├── stores/                       # Zustand 状态管理
│   │   ├── useChatStore.ts           # 对话流与多世界线状态
│   │   ├── useArchiveStore.ts        # 角色/世界观图鉴状态
│   │   ├── useSettingsStore.ts       # 全局配置（API Key、模型参数）
│   │   └── useStageStore.ts          # 舞台状态与调度引擎
│   ├── services/                     # 业务逻辑层
│   │   ├── api/                      # LLM API 交互
│   │   │   ├── client.ts             # 通用 HTTP 客户端
│   │   │   ├── promptAssembler.ts    # Prompt 蓝图组装引擎
│   │   │   └── contextManager.ts     # 上下文压缩与 tool-call pairing 保护
│   │   ├── scheduler/                # 混合权重调度引擎
│   │   │   ├── hybridRouter.ts       # 调度决策入口
│   │   │   ├── mentionScanner.ts     # @ 提及正则扫描
│   │   │   └── activityWeight.ts     # 性格活跃度权重计算
│   │   ├── db/                       # SQLite 数据访问层
│   │   │   ├── schema.ts             # 数据库表结构定义
│   │   │   ├── migrations.ts         # 迁移脚本
│   │   │   ├── characterDao.ts       # 角色 CRUD
│   │   │   ├── worldDao.ts           # 世界观 CRUD
│   │   │   └── chatDao.ts            # 对话历史 CRUD
│   │   └── color/                    # 零 Token 环境色提取
│   │       └── ambientColor.ts       # 原生取色 API 封装 + 饱和度映射
│   ├── utils/                        # 工具函数
│   │   ├── haptics.ts                # 震动反馈封装
│   │   └── formatting.ts             # Markdown 导出、长图生成
│   ├── types/                        # TypeScript 类型定义
│   │   ├── character.ts              # 角色卡片结构
│   │   ├── world.ts                  # 世界观结构
│   │   ├── chat.ts                   # 消息/对话结构
│   │   └── config.ts                 # 配置参数结构
│   ├── constants/                    # 常量
│   │   ├── colors.ts                 # 设计系统色彩（灰度阶梯）
│   │   ├── spacing.ts                # 间距比例尺
│   │   └── typography.ts             # 字体层级定义
│   └── hooks/                        # 自定义 React Hooks
│       ├── useLLMStreaming.ts        # 流式响应 Hook
│       ├── useSwipeRegenerate.ts     # 滑动重生成 Hook
│       └── useIdentitySwitch.ts      # 身份拨盘 Hook
├── memory-bank/                      # 记忆库（项目文档）
│   ├── 01_PRD.md
│   ├── 02_Architecture.md
│   ├── 03_Tech_Stack.md
│   └── 04_Progress_Log.md
└── package.json
```

## 2. 核心数据流

### 2.1 Local-First 数据流
```
用户操作 → Zustand Store (内存) → SQLite (持久化)
                    ↓
              UI 订阅 Store 自动重渲染
```
所有数据读写先经过 Zustand Store，再异步刷入 SQLite。页面初始化时从 SQLite 批量加载至 Store。

### 2.2 LLM 推演数据流
```
StageScreen → useStageStore → promptAssembler → contextManager → API Client
                                                         ↓
Streaming Response ← useLLMStreaming Hook ← LLM API
        ↓
  写入 ChatStore → 刷入 SQLite → UI 更新
```

### 2.3 调度引擎数据流
```
新消息入站 → mentionScanner (正则) → 是否匹配 @？
                                        ↓ 否
                                    questionCapture (问号检测)
                                        ↓ 否
                                    activityWeight (活跃度权重)
                                        ↓
                              hybridRouter 决策 → 指定下一发言者
```

## 3. 数据库设计 (SQLite Schema)

### 3.1 characters 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | UUID |
| name | TEXT NOT NULL | 角色名 |
| personality | TEXT | 性格描述 |
| background | TEXT | 背景故事 |
| catchphrase | TEXT | 口癖 |
| activity_level | INTEGER DEFAULT 5 | 活跃度 1-10 |
| world_id | TEXT | 所属世界观 ID (FK) |
| avatar_emoji | TEXT | Emoji 头像 |
| ambient_color | TEXT | 环境色 HEX |
| created_at | INTEGER | 时间戳 |
| updated_at | INTEGER | 时间戳 |

### 3.2 worlds 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | UUID |
| name | TEXT NOT NULL | 世界观名称 |
| lore | TEXT | 世界观设定全文 |
| ambient_color | TEXT | 环境色 HEX |
| created_at | INTEGER | 时间戳 |

### 3.3 stages 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | UUID |
| name | TEXT NOT NULL | 舞台名称 |
| world_id | TEXT | 关联世界观 (FK) |
| character_ids | TEXT (JSON) | 在场角色 ID 数组 |
| system_prompt | TEXT | 自定义 Prompt 蓝图 |
| created_at | INTEGER | 时间戳 |
| updated_at | INTEGER | 时间戳 |

### 3.4 messages 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | UUID |
| stage_id | TEXT NOT NULL | 所属舞台 (FK) |
| sender_type | TEXT NOT NULL | 'character' \| 'narrator' \| 'user' \| 'guest' |
| sender_id | TEXT | 发送者 ID（角色 ID 或 null） |
| content | TEXT NOT NULL | 消息正文 |
| branch_id | TEXT | 多世界线分支 ID |
| is_selected | INTEGER DEFAULT 1 | 是否为当前选定世界线 |
| tool_calls | TEXT (JSON) | 关联的 tool call 数据 |
| tool_responses | TEXT (JSON) | 关联的 tool response 数据 |
| created_at | INTEGER | 时间戳 |

### 3.5 settings 表
| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT PRIMARY KEY | 配置键名 |
| value | TEXT | 配置值 (JSON 字符串) |

> API Key 与 Base URL 不存入 SQLite，使用 `expo-secure-store` 系统级加密存储。

## 4. 关键架构决策

### 4.1 导航方案
采用单 Stack 导航器包裹底部 Tab 导航器：
- **Tab 1: 图鉴 (Archive)** — 角色与世界观瀑布流
- **Tab 2: 舞台 (Stage)** — 核心推演页
- **Tab 3: 历史 (Chronicles)** — 过往剧本浏览
- **Tab 4: 设置 (Settings)** — 全局配置

### 4.2 多世界线实现
每条消息通过 `branch_id` 分组。同一 `branch_id` 下 `is_selected=1` 的消息为当前可见世界线。滑动重生成时创建新 `branch_id` 记录，旧记录保留可回溯。

### 4.3 上下文压缩与 Tool Call Pairing
`contextManager.ts` 在触发 `forceCompression` 时：
1. 从消息链末尾向前扫描，定位 tool call 节点
2. 若发现未配对的 tool call，向前扩展截断点直至包含其 response
3. 保证配对完整性，绝不切断半对

### 4.4 环境色提取策略
1. 用户设定 Emoji/封面图后，调用系统原生取色 API
2. 提取主色后，强制映射至 HSL 空间：S 锁定 10%-20%，L 锁定 90%-95%
3. 输出极淡通透背景色，零 Token 消耗

## 5. 状态管理分层

| 层级 | 工具 | 职责 |
|------|------|------|
| UI 本地状态 | `useState` / `useReducer` | 折叠面板开关、输入框文本等瞬时状态 |
| 全局应用状态 | Zustand | 角色图鉴列表、舞台配置、设置参数 |
| 持久化状态 | Zustand + SQLite middleware | 所有用户数据的持久化与恢复 |
| 设备安全存储 | `expo-secure-store` | API Key、Base URL |
