import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = fileURLToPath(new URL('../', import.meta.url));
const next = fileURLToPath(new URL('../web/node_modules/next/dist/bin/next', import.meta.url));
const children = [];
let stopping = false;
let killTimer;
let exitCode = 0;

function port(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error(`${name}는 1~65535 사이 포트여야 합니다.`);
  }
  return number;
}

function checkPort(number) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', error => reject(new Error(`${number} 포트를 사용할 수 없습니다 (${error.code}). 실행 중인 서버 또는 권한을 확인하세요.`)));
    server.listen(number, () => server.close(resolve));
  });
}

function signal(child, name) {
  try { process.kill(-child.pid, name); }
  catch (error) { if (error.code !== 'ESRCH') console.error(error.message); }
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  console.log('\n[dev] API와 웹을 종료합니다.');
  for (const child of children) signal(child, 'SIGTERM');
  // Gradle, Java, Next의 자식 프로세스도 같은 전용 그룹에서 정리한다.
  killTimer = setTimeout(() => {
    for (const child of children) signal(child, 'SIGKILL');
    process.exit(exitCode);
  }, 8000);
  if (children.length === 0) { clearTimeout(killTimer); process.exit(code); }
}

function start(label, command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', line => console.log(`[${label}] ${line}`));
  }
  child.on('error', error => {
    console.error(`[${label}] ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code, reason) => {
    if (!stopping) {
      console.error(`[${label}] 서버가 종료되었습니다 (${reason ?? code}).`);
      shutdown(code || 1);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  if (process.platform === 'win32') throw new Error('통합 실행은 macOS/Linux에서 지원합니다.');
  if (!existsSync(next)) throw new Error('웹 의존성을 먼저 설치하세요: npm --prefix web ci');
  const apiPort = port(process.env.API_PORT ?? process.env.SERVER_PORT ?? '8080', 'API_PORT');
  const webPort = port(process.env.WEB_PORT ?? '3000', 'WEB_PORT');
  if (apiPort === webPort) throw new Error('API_PORT와 WEB_PORT는 서로 달라야 합니다.');
  await Promise.all([checkPort(apiPort), checkPort(webPort)]);
  const env = { ...process.env };
  if (!env.JAVA_HOME && process.platform === 'darwin') {
    try { env.JAVA_HOME = execFileSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { /* Gradle의 Java toolchain 탐색을 사용한다. */ }
  }
  console.log(`[dev] 웹 http://localhost:${webPort} / API http://localhost:${apiPort}`);
  console.log('[dev] Ctrl+C로 두 서버를 함께 종료합니다.');
  start('api', './gradlew', ['--no-daemon', 'bootRun'], root + 'api', {
    ...env, SERVER_PORT: String(apiPort),
    AUCTION_WEB_ALLOWED_ORIGINS: env.AUCTION_WEB_ALLOWED_ORIGINS ?? `http://localhost:${webPort}`,
    SPRING_LIFECYCLE_TIMEOUT_PER_SHUTDOWN_PHASE: env.SPRING_LIFECYCLE_TIMEOUT_PER_SHUTDOWN_PHASE ?? '5s',
  });
  start('web', process.execPath, [next, 'dev', '--port', String(webPort), ...process.argv.slice(2)], root + 'web', {
    ...env, NEXT_PUBLIC_API_ORIGIN: env.NEXT_PUBLIC_API_ORIGIN ?? `http://localhost:${apiPort}`,
  });
} catch (error) {
  console.error(`[dev] ${error.message}`);
  shutdown(1);
}
