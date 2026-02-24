# Lark Context Bot

飞书(Feishu/Lark) Bot 集成 Pi AI 编程助手，为团队提供智能对话和飞书文档访问能力。

## 功能特性

- **AI 对话**: 每个飞书群聊/私聊对应独立的 Pi session，支持上下文记忆
- **多种触发方式**:
  - 群聊中 @bot 触发 AI 响应
  - 私聊中直接发送消息即可触发
- **命令系统**: 支持 `/new` 等命令创建新会话
- **飞书文档工具**: Pi 可访问飞书消息历史、文档、Wiki、多维表格等内容
- **自动会话管理**: 支持会话持久化、自动清理过期会话
- **实时消息更新**: 使用飞书卡片消息展示 AI 回复，包含思考过程、工具调用结果和 Token 统计

## 项目结构

```
lark-context/
├── src/                           # 源代码
│   ├── bot/                       # Bot 核心逻辑
│   │   ├── index.ts              # Bot 主类，WebSocket 连接管理
│   │   ├── handler.ts            # 消息处理器，处理飞书消息事件
│   │   ├── command-handler.ts    # 命令处理器
│   │   ├── commands/             # 命令实现
│   │   │   └── new-session.ts    # /new 命令 - 创建新会话
│   │   ├── message-template.ts   # 飞书卡片消息模板
│   │   └── utils.ts              # 消息解析工具
│   ├── pi/                       # Pi 集成
│   │   ├── service.ts            # Pi API 封装
│   │   └── session-manager.ts    # Session 管理（持久化到文件）
│   ├── types/                    # TypeScript 类型定义
│   │   └── index.ts
│   ├── index.ts                  # 应用入口
│   └── check-env.ts              # 环境变量检查工具
├── data/                         # 数据目录（不提交到 git）
│   ├── sessions.json             # chat-session 映射持久化文件
│   └── pi-sessions/              # Pi 会话持久化目录
├── k8s/                          # Kubernetes 部署配置
│   ├── k8s-deployment.yaml       # Deployment 和 Service
│   └── k8s-secret.yaml           # Secret 配置模板
├── Dockerfile                    # Docker 镜像构建
├── package.json                  # Node.js 依赖
├── tsconfig.json                 # TypeScript 配置
├── biome.json                    # Biome 代码规范配置
└── .env.example                  # 环境变量示例
```

## 环境变量配置

复制 `.env.example` 到 `.env` 并填写配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 飞书应用配置（必需）
LARK_APP_ID=your_app_id
LARK_APP_SECRET=your_app_secret

# 数据路径（必需）
DATA_PATH=./data
```

Pi 配置请参考 [Pi 官方文档](https://github.com/badlogic/pi-mono)，API 密钥等配置会自动读取 `~/.pi/agent/` 目录下的配置。

## 本地开发

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置 Pi
确保你本地已经安装并配置好 Pi 环境，添加了可用的模型 API 密钥。

### 3. 启动 Bot

```bash
pnpm dev
```

## Docker 部署

### 构建镜像

```bash
docker build -t lark-context .
```

### 运行容器

```bash
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  -v ~/.pi/agent:/root/.pi/agent \
  lark-context
```

## Kubernetes 部署

### 1. 配置 Secret

编辑 `k8s/k8s-secret.yaml`，填入实际的配置值：

```yaml
stringData:
  LARK_APP_ID: "your_actual_app_id"
  LARK_APP_SECRET: "your_actual_app_secret"
```

### 2. 部署到集群

```bash
kubectl apply -f k8s/k8s-secret.yaml
kubectl apply -f k8s/k8s-deployment.yaml
```

## 使用方法

### 群聊中使用

在飞书群聊中 @bot 并发送消息：

```
@bot 帮我写一个快速排序函数
```

### 私聊中使用

直接与 bot 私聊，发送消息即可：

```
帮我解释一下这段代码
```

### 可用命令

- `/new` - 创建新的 Pi 会话（清除上下文记忆）

## 开发

### 构建

```bash
pnpm build
```

### 代码检查

```bash
pnpm lint
```

### 类型检查

```bash
pnpm typecheck
```

### 预提交检查

```bash
pnpm pre-commit
```

## 技术栈

- **Runtime**: Node.js >= 24.0.0
- **Language**: TypeScript
- **Package Manager**: pnpm
- **Linter**: Biome
- **飞书 SDK**: @larksuiteoapi/node-sdk
- **AI SDK**: @mariozechner/pi-coding-agent

## 许可证

Apache-2.0
