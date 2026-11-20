# `docker compose up`용 웹 이미지. 로컬 개발은 루트의 `npm run dev`를 사용한다.
# 웹이 저장소 루트의 simulator/를 import하므로 빌드 컨텍스트는 저장소 루트다.
# 포함 파일은 web/Dockerfile.dockerignore 허용 목록으로 web/과 simulator/만 남긴다.
FROM node:22-alpine AS build
WORKDIR /repo/web
COPY web/package.json web/package-lock.json ./
# Docker Desktop 네트워크에서 동시 연결이 많으면 ECONNRESET이 나므로 연결 수를 줄이고 재시도한다.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --maxsockets=4 --fetch-retries=5 --fetch-retry-mintimeout=2000 --no-audit --no-fund
COPY simulator /repo/simulator
COPY web ./
# 브라우저 번들에 들어가는 값이라 빌드할 때 정해야 한다.
ARG NEXT_PUBLIC_API_ORIGIN=http://localhost:8080
ARG NEXT_PUBLIC_API_PROTOCOL=rest
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN NEXT_PUBLIC_API_PROTOCOL=$NEXT_PUBLIC_API_PROTOCOL NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
# 빌드와 같은 /repo/web, /repo/simulator 배치를 유지한다.
WORKDIR /repo/web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo/simulator /repo/simulator
COPY --from=build /repo/web/package.json ./
COPY --from=build /repo/web/node_modules node_modules
COPY --from=build /repo/web/.next .next
COPY --from=build /repo/web/public public
EXPOSE 3000
CMD ["npx", "--no-install", "next", "start", "--port", "3000"]
