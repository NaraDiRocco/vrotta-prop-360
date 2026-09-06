# Visor 360 (Vite, build estatico). Contexto de build: la raiz del monorepo.
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @r360/viewer build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/viewer/dist /usr/share/nginx/html
EXPOSE 80
