# syntax=docker/dockerfile:1

FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# Production dependencies only (better-sqlite3 ships prebuilt binaries).
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Client and server builds.
FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm run build:server

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    DATABASE_URL=sqlite:/data/freeband.db \
    FREEBAND_PORT=7000 \
    FREEBAND_STATIC_DIR=/app/dist
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 7000
CMD ["node", "dist-server/main.js"]
