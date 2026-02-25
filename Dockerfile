FROM node:24-bookworm-slim

# 安装系统基础工具
RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  ca-certificates \
  vim \
  tree \
  curl \
  wget \
  procps \
  && rm -rf /var/lib/apt/lists/*

# 安装 fd 和 ripgrep（使用静态二进制）
RUN curl -fsSL https://github.com/sharkdp/fd/releases/download/v10.2.0/fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz | tar xz -C /usr/local/bin fd --strip-components=1 \
  && curl -fsSL https://github.com/BurntSushi/ripgrep/releases/download/14.1.1/ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz | tar xz -C /usr/local/bin ripgrep-14.1.1-x86_64-unknown-linux-musl/rg --strip-components=1

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
