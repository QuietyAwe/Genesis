# 技术栈 (Tech Stack)

## 1. 核心框架

| 技术 | 版本 | 用途 |
|------|------|------|
| React Native | 0.81.x | 跨平台移动端 UI 框架 |
| Expo SDK | ~54.0.x | 开发工具链、构建系统、原生模块桥接 |
| TypeScript | ~5.9.x | 类型安全、开发体验保障 |

## 2. 状态管理

| 技术 | 版本 | 用途 |
|------|------|------|
| Zustand | latest | 轻量级全局状态管理，替代 Redux/Redux Toolkit |
| React useState/useReducer | 内置 | 组件级局部状态 |

**选择 Zustand 的理由：**
- API 极简，无 boilerplate（对比 Redux）
- 原生支持 middleware，方便接入 SQLite 持久化
- 按需订阅机制，避免不必要的重渲染

## 3. 本地存储

| 技术 | 版本 | 用途 |
|------|------|------|
| expo-sqlite | bundled | 主数据库，存储角色、世界观、对话历史 |
| expo-secure-store | bundled | 系统级加密存储 API Key 与 Base URL |

**安全策略：**
- 敏感信息（API Key）→ `expo-secure-store`（iOS Keychain / Android Keystore）
- 业务数据（角色、对话）→ `expo-sqlite`（本地 SQLite 文件）
- 零云端上传，所有数据驻留设备

## 4. 动画与交互

| 技术 | 版本 | 用途 |
|------|------|------|
| react-native-reanimated | latest | 手势动画（滑动重生成、折叠面板展开） |
| expo-haptics | bundled | 触觉反馈（滑动重生成时的震动提示） |

## 5. 导航

| 技术 | 版本 | 用途 |
|------|------|------|
| expo-router | bundled (推荐) 或 @react-navigation/native | 底部 Tab + Stack 导航 |

> 待决定：是否采用 `expo-router`（基于文件系统的路由）还是传统 `@react-navigation` 方案。初期采用 `@react-navigation/native` 以获得更细粒度的控制。

## 6. LLM 通信

| 模块 | 实现方式 |
|------|----------|
| HTTP 客户端 | 原生 `fetch` API（无需额外依赖） |
| 流式响应 | `ReadableStream` / `TextDecoder` 逐块解析 SSE 或 JSON stream |
| 超时/重试 | `AbortController` + 指数退避重试策略 |
| API 兼容性 | 兼容 OpenAI-compatible 接口（支持 Ollama、LocalAI 等第三方端点） |

## 7. 调度引擎（零 Token）

| 模块 | 技术 |
|------|------|
| @ 提及扫描 | 正则表达式 `/@(\w+)/g` 匹配角色别名 |
| 问句检测 | 正则 `/[?？]\s*$/` 检测问号结尾 |
| 活跃度权重 | 角色卡片 `activity_level` 字段的简单随机加权 |
| 决策器 | 纯 TypeScript 函数，无外部依赖 |

## 8. 环境色提取（零 Token）

| 模块 | 技术 |
|------|------|
| 取色 | 系统原生 API（通过平台桥接或 `expo-image-manipulator`） |
| 色彩映射 | HSL 空间转换：S → 10-20%, L → 90-95% |
| 预设色板 | 6 个硬编码自然质感色值（白茶、岩兰草等） |

## 9. 开发工具

| 工具 | 用途 |
|------|------|
| ESLint + Prettier | 代码规范与格式化 |
| TypeScript strict mode | 编译时类型检查 |

## 10. 未来技术路线图

| 版本 | 技术 | 用途 |
|------|------|------|
| V1.1 | 轻量级向量检索（如 `usearch` 或 WASM 版 sqlite-vec） | 角色长线记忆胶囊 |
| V1.5 | 图像隐写库（纯 JS 实现） | 角色卡牌 JSON 隐写至头像图 |
| V2.0 | iCloud / CloudKit SDK | 跨端实时同步引擎 |
