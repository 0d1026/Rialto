# Multi-package build: one image runs either service via CMD override.
#
# node:22-slim (Debian/glibc), not -alpine: discovery's embedding worker
# (search/embedding-model.ts, @huggingface/transformers -> onnxruntime-node)
# ships prebuilt native binaries for linux glibc only, no musl build -
# alpine would fail at runtime the moment the model actually loads.
# facilitator has no such dependency but shares this base for one image.
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/facilitator/package.json packages/facilitator/
COPY packages/discovery/package.json packages/discovery/
COPY site/package.json site/
RUN pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 20000 && \
    pnpm config set network-concurrency 8 && \
    pnpm install --frozen-lockfile --prod=false
COPY packages ./packages

FROM base AS facilitator
WORKDIR /app/packages/facilitator
EXPOSE 4022
CMD ["pnpm", "exec", "tsx", "src/index.ts"]

FROM base AS discovery
WORKDIR /app/packages/discovery
EXPOSE 4030
CMD ["pnpm", "exec", "tsx", "src/index.ts"]

FROM base AS embed-worker
WORKDIR /app/packages/discovery
CMD ["pnpm", "exec", "tsx", "src/embedding-worker-cli.ts"]

FROM base AS site-builder
COPY site ./site
WORKDIR /app/site
RUN pnpm exec next build

FROM node:22-slim AS site
WORKDIR /app/site
ENV NODE_ENV=production
COPY --from=site-builder /app/site/.next/standalone/ ./
COPY --from=site-builder /app/site/.next/static ./site/.next/static
COPY --from=site-builder /app/site/public ./site/public
EXPOSE 3000
CMD ["node", "site/server.js"]
