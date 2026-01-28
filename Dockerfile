FROM node:24-alpine

WORKDIR /app

# 安装 OpenCode CLI
RUN npm install -g @opencode-ai/cli

COPY package.json pnpm-lock.yaml* ./

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# 创建数据目录和 OpenCode 配置目录
RUN mkdir -p /app/data/context /root/.config/opencode

# 复制 OpenCode 工具到配置目录
COPY opencode /root/.config/opencode

# 暴露端口
EXPOSE 3000 4242

# 启动脚本：先启动 OpenCode server，然后启动 bot
CMD ["sh", "-c", "opencode serve --hostname 0.0.0.0 --port 4242 --directory /app/data/context & sleep 5 && node dist/index.js"]
