FROM ubuntu:24.04

ENV SHELL=/bin/bash

RUN apt-get update && apt-get install -y --no-install-recommends wget gnupg ca-certificates curl && rm -rf /var/lib/apt/lists/*

RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list

RUN apt-get update && apt-get install -y --no-install-recommends \
    aria2 \
    bash \
    cmake \
    ffmpeg \
    fonts-noto-cjk \
    g++ \
    gcc \
    git \
    google-chrome-stable \
    htop \
    iputils-ping \
    libffi-dev \
    libsm6 \
    libssl-dev \
    libtalloc-dev \
    libxext6 \
    make \
    opensc \
    openssh-client \
    openssl \
    procps \
    python3 \
    python3-dev \
    python3-pip \
    tmux \
    tree \
    unzip \
    vim \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/bin/python3 /usr/bin/python

RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash \
    && npm install -g pnpm

RUN git config --global user.name "lark-context" \
    && git config --global user.email "lark-context@localhost" \
    && git config --global init.defaultBranch main

RUN curl -fsSL https://opencode.ai/install | bash

ENV PATH="/root/.bun/bin:/root/.opencode/bin:${PATH}"

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

COPY opencode /root/.config/opencode

# 暴露端口
EXPOSE 3000 4096

# 启动脚本：先启动 OpenCode server，然后启动 bot
CMD ["sh", "-c", "opencode serve --port 4096 & sleep 5 && node dist/index.js"]
