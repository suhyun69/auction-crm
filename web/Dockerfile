# `docker compose up`용 웹 이미지. 로컬 개발은 루트의 `npm run dev`를 사용한다.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Docker Desktop 네트워크에서 동시 연결이 많으면 ECONNRESET이 나므로 연결 수를 줄이고 재시도한다.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --maxsockets=4 --fetch-retries=5 --fetch-retry-mintimeout=2000 --no-audit --no-fund
COPY . .
# 브라우저 번들에 들어가는 값이라 빌드할 때 정해야 한다.
ARG NEXT_PUBLIC_API_ORIGIN=http://localhost:8080
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/.next .next
COPY --from=build /app/public public
EXPOSE 3000
CMD ["npx", "--no-install", "next", "start", "--port", "3000"]
