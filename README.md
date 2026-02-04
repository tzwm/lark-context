# Lark Context Bot

飞书(Feishu/Lark) Bot 集成 OpenCode AI 编程助手，为团队提供智能对话和飞书文档访问能力。

## 功能特性

- **AI 对话**: 每个飞书群聊/私聊对应独立的 OpenCode session，支持上下文记忆
- **多种触发方式**:
  - 群聊中 @bot 触发 AI 响应
  - 私聊中直接发送消息即可触发
- **命令系统**: 支持 `/new` 等命令创建新会话
- **飞书文档工具**: OpenCode 可访问飞书消息历史、文档、Wiki、多维表格等内容
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
│   ├── opencode/                 # OpenCode 集成
│   │   ├── service.ts            # OpenCode API 封装
│   │   └── session-manager.ts    # Session 管理（持久化到文件）
│   ├── types/                    # TypeScript 类型定义
│   │   └── index.ts
│   ├── index.ts                  # 应用入口
│   └── check-env.ts              # 环境变量检查工具
├── opencode/                     # OpenCode 配置和工具
│   ├── package.json              # OpenCode 插件依赖
│   └── tools/                    # OpenCode 自定义工具
│       ├── lark_client.ts        # 飞书 API 客户端（Token 管理）
│       ├── lark_list_messages.ts # 获取飞书消息历史
│       ├── lark_docx_get.ts      # 获取飞书 Docx 文档
│       ├── lark_wiki_get.ts      # 获取飞书 Wiki 节点
│       └── lark_bitable_get.ts   # 获取飞书多维表格
├── data/                         # 数据目录（不提交到 git）
│   └── sessions.json             # chat-session 映射持久化文件
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

# OpenCode 配置（必需）
OPENCODE_HOST=http://localhost:4096

# OpenCode 认证（可选，如果启用了 Basic Auth）
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=your-password

# 数据路径（必需）
DATA_PATH=./data
```

## 本地开发

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动 OpenCode Server

```bash
opencode serve --port 4096
```

### 3. 启动 Bot

在另一个终端窗口中：

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
  -p 4096:4096 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  lark-context
```

## Kubernetes 部署

### 1. 配置 Secret

编辑 `k8s/k8s-secret.yaml`，填入实际的配置值：

```yaml
stringData:
  LARK_APP_ID: "your_actual_app_id"
  LARK_APP_SECRET: "your_actual_app_secret"
  OPENCODE_SERVER_PASSWORD: "your_actual_password"
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

- `/new` - 创建新的 OpenCode 会话（清除上下文记忆）

### 飞书文档工具

OpenCode 可以自动调用以下工具访问飞书内容：

| 工具 | 功能 |
|------|------|
| `lark_list_messages` | 获取飞书消息历史 |
| `lark_docx_get` | 获取飞书 Docx 文档内容 |
| `lark_wiki_get` | 获取飞书 Wiki 节点信息 |
| `lark_bitable_get` | 获取飞书多维表格信息 |

使用示例：
- "帮我总结一下这个文档 https://xxx.feishu.cn/docx/xxx"
- "查看一下这个 Wiki 页面 https://xxx.feishu.cn/wiki/xxx"
- "获取这个群聊最近的 50 条消息"

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
- **OpenCode SDK**: @opencode-ai/sdk, @opencode-ai/plugin

## 许可证

Apache-2.0
