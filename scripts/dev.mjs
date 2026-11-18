import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = fileURLToPath(new URL('../', import.meta.url));
const next = fileURLToPath(new URL('../web/node_modules/next/dist/bin/next', import.meta.url));
const children = [];
let stopping = false;
let finished = false;
let dbStarted = false;
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

function compose(args, env, stdio = 'inherit') {
  return execFileSync('docker', ['compose', ...args], { cwd: root, env, stdio, encoding: 'utf8' });
}

function dockerReady(env) {
  try { execFileSync('docker', ['info'], { env, stdio: 'ignore', timeout: 10000 }); return true; }
  catch { return false; }
}

// Docker 데몬이 꺼져 있으면 Docker Desktop을 켜고 응답할 때까지 기다린다.
async function ensureDocker(env) {
  try { compose(['version'], env, 'ignore'); }
  catch { throw new Error('Docker Compose를 찾을 수 없습니다. Docker Desktop을 설치하세요.'); }
  if (dockerReady(env)) return;
  console.log('[dev] Docker가 꺼져 있어 Docker Desktop을 시작합니다.');
  let launched = false;
  try { execFileSync('docker', ['desktop', 'start', '--detach'], { env, stdio: 'ignore', timeout: 30000 }); launched = true; }
  catch { /* 구버전 Docker Desktop은 desktop 명령이 없다. */ }
  if (!launched && process.platform === 'darwin') {
    try { execFileSync('open', ['-a', 'Docker'], { stdio: 'ignore' }); launched = true; }
    catch { /* 아래에서 안내한다. */ }
  }
  if (!launched) throw new Error('Docker를 자동으로 시작할 수 없습니다. Docker 데몬을 직접 실행하세요.');
  const timeoutMs = Number(env.DOCKER_START_TIMEOUT_MS ?? 120000);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stopping) return;
    if (dockerReady(env)) { console.log('[dev] Docker가 준비되었습니다.'); return; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Docker가 ${Math.round(timeoutMs / 1000)}초 안에 준비되지 않았습니다. Docker Desktop 상태를 확인하세요.`);
}

// 컨테이너와 tmpfs 데이터를 함께 제거한다. 다음 실행은 항상 빈 DB에서 시작한다.
function removeDb(env = process.env) {
  compose(['down', '--volumes', '--remove-orphans'], env, ['ignore', 'ignore', 'inherit']);
}

function signal(child, name) {
  try { process.kill(-child.pid, name); }
  catch (error) { if (error.code !== 'ESRCH') console.error(error.message); }
}

function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(killTimer);
  if (dbStarted) {
    console.log('[dev] PostgreSQL 컨테이너를 제거합니다.');
    try { removeDb(); } catch (error) { console.error(`[db] ${error.message}`); }
  }
  process.exit(exitCode);
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
    finish();
  }, 8000);
  if (children.every(child => child.exitCode !== null || child.signalCode !== null)) finish();
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
    if (stopping && children.every(c => c.exitCode !== null || c.signalCode !== null)) finish();
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  if (process.platform === 'win32') throw new Error('통합 실행은 macOS/Linux에서 지원합니다.');
  if (!existsSync(next)) throw new Error('웹 의존성을 먼저 설치하세요: npm --prefix web ci');
  const apiPort = port(process.env.API_PORT ?? process.env.SERVER_PORT ?? '8080', 'API_PORT');
  const webPort = port(process.env.WEB_PORT ?? '3000', 'WEB_PORT');
  const dbPort = port(process.env.DB_PORT ?? '5432', 'DB_PORT');
  if (new Set([apiPort, webPort, dbPort]).size !== 3) throw new Error('API_PORT, WEB_PORT, DB_PORT는 서로 달라야 합니다.');
  const env = { ...process.env, DB_PORT: String(dbPort) };
  await ensureDocker(env);
  if (stopping) throw new Error('시작 중 종료 요청을 받았습니다.');
  // 이전 실행이 남긴 컨테이너를 먼저 지워야 DB 포트 검사가 정확하다.
  removeDb(env);
  await Promise.all([checkPort(apiPort), checkPort(webPort), checkPort(dbPort)]);
  if (!env.JAVA_HOME && process.platform === 'darwin') {
    try { env.JAVA_HOME = execFileSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { /* Gradle의 Java toolchain 탐색을 사용한다. */ }
  }
  console.log(`[dev] 빈 PostgreSQL을 localhost:${dbPort}에 준비합니다.`);
  dbStarted = true;
  compose(['up', '--detach', '--wait', 'db'], env);
  if (stopping) finish();
  console.log(`[dev] 웹 http://localhost:${webPort} / API http://localhost:${apiPort} / DB localhost:${dbPort}`);
  console.log('[dev] Ctrl+C로 서버와 DB 컨테이너를 함께 종료합니다.');
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
