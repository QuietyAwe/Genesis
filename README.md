# Genesis

AI 驱动的多角色沙盒模拟器。角色在舞台上自主互动，支持分支时间线、世界观注入和长文本压缩。

## 功能

- **多角色舞台** — 多个 AI 角色在同一场景中自主对话，支持发言积极性调度
- **分支时间线** — 重生成消息会创建平行分支，可自由切换和对比
- **世界观系统** — 世界观设定 + Lore Entry（全局/关键词触发注入）
- **角色创建** — 填表模式（结构化字段）+ 自由编辑模式 + AI 随机生成
- **上下文管理** — 滑动窗口压缩，动态绑定 Context Window 设置
- **本地优先** — 所有数据存储在本地（SQLite / localStorage），零云端依赖

## 技术栈

- React Native (Expo ~54)
- TypeScript strict mode
- Zustand 状态管理
- expo-sqlite (Native) / localStorage (Web)
- Jest 29 + ts-jest 测试

## 快速开始

```bash
npm install
npx expo start
```

Web 端：
```bash
npx expo start --web
```

运行测试：
```bash
npx jest
```

## 项目结构

```
src/
├── components/     # 共享组件
├── constants/      # 主题常量
├── hooks/          # 自定义 hooks
├── navigation/     # 导航配置
├── screens/        # 页面组件
├── services/       # API、数据库、调度器
├── stores/         # Zustand 状态管理
├── types/          # TypeScript 类型定义
├── utils/          # 工具函数
└── __tests__/      # 测试用例
```

## License

MIT
