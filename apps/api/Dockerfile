FROM node:26.13.0-bookworm-slim AS build

WORKDIR /workspace
RUN npm install --global corepack@0.34.5 && corepack enable && corepack prepare pnpm@12.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @trakia/contracts build \
  && pnpm --filter @trakia/api build \
  && pnpm --filter @trakia/api deploy --prod /out

FROM node:26.13.0-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/ ./
USER node
EXPOSE 3033
CMD ["node", "dist/main.js"]
