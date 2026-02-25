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

# 安装 fd 和 ripgrep
RUN curl -LO https://github.com/sharkdp/fd/releases/download/v10.2.0/fd_10.2.0_amd64.deb \
  && dpkg -i fd_10.2.0_amd64.deb \
  && rm fd_10.2.0_amd64.deb \
  && curl -LO https://github.com/BurntSushi/ripgrep/releases/download/14.1.1/ripgrep_14.1.1_amd64.deb \
  && dpkg -i ripgrep_14.1.1_amd64.deb \
  && rm ripgrep_14.1.1_amd64.deb

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
