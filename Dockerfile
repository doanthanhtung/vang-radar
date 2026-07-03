FROM node:22-alpine AS app

WORKDIR /app

ENV CI=true \
    HUSKY=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile --prod=false

ARG NEXT_PUBLIC_API_BASE_URL=https://api.vangscore.com/api/v1
ARG PUBLIC_API_BASE_URL=http://api:4000/api/v1
ARG LOCAL_API_PROXY_TARGET=http://api:4000/api/v1
ARG PUBLIC_WEB_URL=https://vangscore.com

ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL} \
    LOCAL_API_PROXY_TARGET=${LOCAL_API_PROXY_TARGET} \
    PUBLIC_WEB_URL=${PUBLIC_WEB_URL}

RUN pnpm db:generate && pnpm build

ENV NODE_ENV=production \
    API_PORT=4000 \
    WEB_PORT=3000

EXPOSE 3000 4000

CMD ["pnpm", "--filter", "@vang-radar/web", "start"]
