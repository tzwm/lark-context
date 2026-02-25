FROM node:24-bookworm-slim

# 安装系统基础工具
RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  openssh-client \
  ca-certificates \
  vim \
  tree \
  curl \
  wget \
  procps \
  less \
  jq \
  && rm -rf /var/lib/apt/lists/*

# 安装 fd 和 ripgrep（使用 apt）
RUN apt-get update && apt-get install -y --no-install-recommends \
  fd-find \
  ripgrep \
  && ln -s $(which fdfind) /usr/local/bin/fd \
  && rm -rf /var/lib/apt/lists/*

# 全局安装 Pi Coding Agent
RUN npm install -g @mariozechner/pi-coding-agent@latest

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# 数据挂载目录
VOLUME /app/data
VOLUME /root/.pi/agent

EXPOSE 3000

CMD ["node", "dist/index.js"]
