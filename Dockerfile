# --- Lichtblick viewer (self-hosted Foxglove fork) -------------------------
# Recipe: docs/superpowers/specs/2026-07-13-lichtblick-recipe.md
FROM node:22-slim AS lichtblick
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g corepack --force
RUN git clone --depth 1 --branch v1.27.0 https://github.com/lichtblick-suite/lichtblick /lb
WORKDIR /lb
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack yarn install --immutable
RUN corepack yarn web:build:prod
# Preload the nav-trial layout via the official self-host hook
# (globalThis.LICHTBLICK_SUITE_DEFAULT_LAYOUT in defaultLayout.ts).
COPY public/demos/nav-trial-layout.json /tmp/layout.json
RUN printf 'globalThis.LICHTBLICK_SUITE_DEFAULT_LAYOUT = ' > web/.webpack/default-layout.js \
    && cat /tmp/layout.json >> web/.webpack/default-layout.js \
    && printf ';\n' >> web/.webpack/default-layout.js \
    && sed -i 's|<script defer="defer" src="main\.|<script src="default-layout.js"></script><script defer="defer" src="main.|' web/.webpack/index.html \
    && grep -q 'default-layout.js' web/.webpack/index.html

# --- Site build -------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime ----------------------------------------------------------------
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=lichtblick /lb/web/.webpack /usr/share/nginx/html/viewer
EXPOSE 8080
