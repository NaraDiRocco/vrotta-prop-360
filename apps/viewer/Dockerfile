# ATENCION: Baleia NO se publica con este Dockerfile.
#
# El material del recorrido (apps/viewer/public/baleia/, unos 100 MB de fotos,
# tiles 360, video y brochure) esta fuera de git y ademas excluido en
# .dockerignore, asi que esta imagen construye el sitio SIN media: queda un
# visor vacio. Baleia se publica con tools/deploy/publicar-vps.sh, que sube el
# dist ya construido por rsync al VPS. Ver DESPLIEGUE-VPS.md.
#
# Este Dockerfile queda para el visor generico, que si vive en git completo.
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
