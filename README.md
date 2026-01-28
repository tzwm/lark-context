# Lark Context Bot - OpenCode 集成版本

Feishu bot 集成 OpenCode AI 编程助手。

## 功能特性

- 每个 Feishu 群聊对应一个独立的 OpenCode session
- 通过 @bot 触发 AI 响应
- 支持获取聊天历史记录（通过自定义工具）
- 自动会话管理
- 实时消息更新

## 项目结构

```
lark-context/
├── data/                          # 数据目录（不提交到 git）
│   ├── context/                   # OpenCode 工作目录
│   │   ├── .opencode/
│   │   │   ├── tools/
│   │   │   │   └── feishu.ts  # 自定义工具：获取 Feishu 聊天历史
│   │   │   └── opencode.jsonc # OpenCode 配置
│   │   └── ...                  # OpenCode 生成的其他文件
│   └── sessions.json             # chat-session 映射
├── src/
│   ├── opencode/
│   │   ├── service.ts           # OpenCode 服务封装
│   │   └── session-manager.ts   # Session 管理
│   └── ...
```

## 环境变量配置

复制 `.env.example` 到 `.env` 并填写配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Feishu App 配置
LARK_APP_ID=your_app_id
LARK_APP_SECRET=your_app_secret

# Webhook 模式（可选）
LARK_VERIFICATION_TOKEN=your_verification_token
LARK_ENCRYPT_KEY=your_encrypt_key

# OpenCode 配置
OPENCODE_HOST=http://localhost:4096
OPENCODE_TIMEOUT=60000

# 数据路径
DATA_PATH=./data
```

## 本地开发

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动 OpenCode Server

在 `data/context` 目录下启动 OpenCode server：

```bash
cd data/context
opencode serve --hostname 0.0.0.0 --port 4096
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

## 使用方法

在 Feishu 群聊或私聊中 @bot 并发送消息：

```
@bot 帮我写一个快速排序函数
```

Bot 会：
1. 为该聊天创建或获取 OpenCode session
2. 发送消息到 OpenCode
3. 先显示"正在处理..."
4. 完成后更新消息为 AI 响应

## OpenCode 自定义工具

项目包含一个自定义工具 `feishu.ts`，允许 OpenCode 访问 Feishu 聊天历史：

```typescript
// data/context/.opencode/tools/feishu.ts
export default tool({
  description: "Get recent messages from Feishu chat",
  args: {
    count: tool.schema.number().default(30).describe("Number of recent messages to retrieve"),
  },
  async execute(args, context) {
    // 通过 context 获取 sessionID，映射到 chatId
    // 调用 Feishu API 获取聊天历史
    // 返回格式化的消息列表
  },
});
```

## 开发

### 构建

```bash
pnpm build
```

### Lint

```bash
pnpm lint
```

### 类型检查

```bash
pnpm typecheck
```

## 许可证

Apache-2.0
