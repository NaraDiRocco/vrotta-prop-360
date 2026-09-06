# Panel de administracion (Next.js). Contexto de build: la raiz del monorepo.
# OJO: las NEXT_PUBLIC_* se resuelven al COMPILAR, por eso entran como ARG.
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_R360_MOCK=1
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ENV NEXT_PUBLIC_R360_MOCK=$NEXT_PUBLIC_R360_MOCK \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN pnpm --filter @r360/admin build

ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
EXPOSE 3001
CMD ["pnpm", "--filter", "@r360/admin", "start"]
