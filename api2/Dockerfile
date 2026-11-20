# `docker compose up`용 api2(NestJS) 이미지. 로컬 개발은 루트의 `npm run dev`를 사용한다.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Docker Desktop 네트워크에서 동시 연결이 많으면 ECONNRESET이 나므로 연결 수를 줄이고 재시도한다.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --maxsockets=4 --fetch-retries=5 --fetch-retry-mintimeout=2000 --no-audit --no-fund
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
# 컴파일된 마이그레이션(dist/migrations)도 함께 들어 있어 시작할 때 적용한다.
COPY --from=build /app/dist dist
EXPOSE 8080
# node가 직접 PID 1이 되어 SIGTERM을 받고, 열린 SSE·WebSocket을 정리한 뒤 끝난다.
CMD ["node", "dist/main.js"]
