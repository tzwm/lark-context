FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

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
