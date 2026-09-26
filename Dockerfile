# syntax=docker/dockerfile:1
# Larpbox TV: one long-running Node process serving the SPA, the API and Socket.IO on one origin.
# Run exactly one instance (rooms live in memory). Example:
#   docker build -t larpbox-tv .
#   docker run --rm -p 3001:3001 \
#     -e PUBLIC_ORIGIN=https://larpbox.example -e ALLOWED_ORIGINS=https://larpbox.example larpbox-tv

# ---- build: all dependencies, then shared -> web -> server ----
FROM node:24-slim AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
RUN npm run build

# ---- deps: production dependencies only ----
FROM node:24-slim AS deps
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund

# ---- runtime: non-root, built output only, no sources ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node packages/shared/package.json packages/shared/
COPY --chown=node:node apps/server/package.json apps/server/
COPY --chown=node:node apps/web/package.json apps/web/
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
# The server bundle includes @larpbox/shared and the server-only prompt pack.
COPY --from=build --chown=node:node /app/apps/server/dist apps/server/dist
COPY --from=build --chown=node:node /app/apps/web/dist apps/web/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
# Exec form: SIGTERM reaches Node, which ends every room honestly before exiting.
CMD ["node", "apps/server/dist/index.js"]
