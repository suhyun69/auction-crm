import path from "node:path";
import type { NextConfig } from "next";

// 웹이 저장소 루트의 simulator/를 import하므로 빌드 루트를 저장소 루트로 고정한다.
// 지정하지 않으면 web/package-lock.json 위치가 루트가 되어 Docker 빌드에서 simulator/를 찾지 못한다.
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
};

export default nextConfig;
