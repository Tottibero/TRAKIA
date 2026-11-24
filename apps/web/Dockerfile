FROM node:26.13.0-bookworm-slim AS build

WORKDIR /workspace
RUN npm install --global corepack@0.34.5 && corepack enable && corepack prepare pnpm@12.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @trakia/contracts build && pnpm --filter @trakia/web build

FROM nginx/nginx-unprivileged:1.31.10-alpine@sha256:86628f2c9eaa5e84e3b98d25e26563c4a4f9b0ead9cf5656da4731d86e0621de AS runtime

USER root
COPY apps/web/deploy/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /workspace/apps/web/dist/ /usr/share/nginx/html/
ENV NGINX_ENVSUBST_FILTER=^(PORT|API_UPSTREAM)$
USER 101
EXPOSE 8080
