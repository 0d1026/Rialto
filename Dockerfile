# Multi-package build: one image runs either service via CMD override.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/facilitator/package.json packages/facilitator/
COPY packages/discovery/package.json packages/discovery/
RUN pnpm install --frozen-lockfile --prod=false
COPY packages ./packages

FROM base AS facilitator
WORKDIR /app/packages/facilitator
EXPOSE 4022
CMD ["pnpm", "exec", "tsx", "src/index.ts"]

FROM base AS discovery
WORKDIR /app/packages/discovery
EXPOSE 4030
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
