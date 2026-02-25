# A richer base image than *-slim, while keeping the current Node.js major version.
# Includes more common Debian tooling and libraries, easier for building native deps.
FROM node:24-bookworm

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# ---- Optional customization hooks ----
# Install extra OS / Python dependencies at build time:
#   docker build \
#     --build-arg EXTRA_APT_PACKAGES="ffmpeg poppler-utils" \
#     --build-arg EXTRA_PIP_PACKAGES="requests==2.32.3" \
#     --build-arg CUSTOM_CMD="echo hello && node -v && python -V" \
#     -t lark-context .
ARG EXTRA_APT_PACKAGES=""
ARG EXTRA_PIP_PACKAGES=""
ARG CUSTOM_CMD=""

# System tools + Python runtime (guaranteed)
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    git \
    openssh-client \
    jq \
    less \
    procps \
    tree \
    vim \
    # search tools
    fd-find \
    ripgrep \
    # Python
    python3 \
    python3-pip \
    python3-venv \
    python-is-python3 \
    # common build deps for native modules
    build-essential \
    pkg-config \
  ; \
  # Debian ships fd as fdfind
  ln -sf "$(command -v fdfind)" /usr/local/bin/fd; \
  # Optional: extra APT packages
  if [[ -n "${EXTRA_APT_PACKAGES}" ]]; then \
    apt-get install -y --no-install-recommends ${EXTRA_APT_PACKAGES}; \
  fi; \
  rm -rf /var/lib/apt/lists/*

# Optional: extra Python packages
RUN set -eux; \
  if [[ -n "${EXTRA_PIP_PACKAGES}" ]]; then \
    python -m pip install --no-cache-dir ${EXTRA_PIP_PACKAGES}; \
  fi

# Optional: arbitrary customization command (last-resort escape hatch)
RUN set -eux; \
  if [[ -n "${CUSTOM_CMD}" ]]; then \
    bash -lc "${CUSTOM_CMD}"; \
  fi

# Install Pi Coding Agent globally
RUN npm install -g @mariozechner/pi-coding-agent@latest

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Data mount directories
VOLUME /app/data
VOLUME /root/.pi/agent

EXPOSE 3000

CMD ["node", "dist/index.js"]
