FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/dashboard-next/package.json ./apps/dashboard-next/

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY packages/shared/ ./packages/shared/
COPY apps/dashboard-next/ ./apps/dashboard-next/

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["pnpm", "--filter", "dashboard-next", "dev"]
