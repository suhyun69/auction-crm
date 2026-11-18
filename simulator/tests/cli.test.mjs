import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
const entry = fileURLToPath(new URL('../cli.mjs', import.meta.url));

async function fixture(t, overrides = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'auction-simulation-test-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const scenario = join(folder, 'scenario.json');
  await writeFile(scenario, JSON.stringify({ version: 1, name: 'test', seed: 42, durationMs: 100, tickMs: 10, minIncrement: 1,
    participants: [ { id: 'a', name: 'A', budget: 100, personality: 'competitive', participationProbability: 1, reactionMs: { min: 10, max: 10 }, increment: { min: 1, max: 2 } },
      { id: 'b', name: 'B', budget: 200, personality: 'competitive', participationProbability: 1, reactionMs: { min: 10, max: 10 }, increment: { min: 1, max: 2 } } ], ...overrides }));
  return { folder, scenario, output: join(folder, 'result.json') };
}
function launch(t, args) {
  const child = spawn(process.execPath, [entry, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 12000);
  const done = new Promise(resolve => child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); }));
  t.after(() => { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  return { child, done };
}

test('CLI dry-run finishes, writes results and makes no HTTP calls', async t => {
  const f = await fixture(t);
  const { done } = launch(t, ['--scenario', f.scenario, '--dry-run', '--api', 'http://127.0.0.1:1', '--speed', '1000', '--quiet', '--output', f.output]);
  const result = await done;
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(await readFile(f.output, 'utf8'));
  assert.equal(report.mode, 'dry-run'); assert.equal(report.phase, 'completed'); assert.equal(report.apiOrigin, null);
  assert.ok(report.totals.accepted > 0); assert.ok(report.events.length > 0);
  assert.equal(report.scenario.seed, 42);
});

test('pause preserves virtual time, then resume/speed/stop control the run', async t => {
  const f = await fixture(t, { durationMs: 20000, tickMs: 1000 });
  const { child, done } = launch(t, ['--scenario', f.scenario, '--dry-run', '--speed', '10', '--quiet', '--output', f.output]);
  let text = '', sent = false, checked = false;
  child.stdout.on('data', chunk => {
    text += chunk;
    if (!sent && text.includes('입력 명령:')) {
      sent = true; child.stdin.write('pause\nstatus\n');
    }
    if (!checked && text.includes('[status] paused')) {
      checked = true;
      setTimeout(() => child.stdin.write('status\nresume\nspeed 1000\nstop\n'), 150);
    }
  });
  const result = await done;
  assert.equal(result.code, 0, result.stderr);
  const paused = [...result.stdout.matchAll(/\[status\] paused ([\d.]+)s/g)].map(m => m[1]);
  assert.equal(paused.length, 2, result.stdout); assert.equal(paused[0], paused[1]);
  assert.match(result.stdout, /resumed/); assert.match(result.stdout, /speed 1000x/);
  assert.equal(JSON.parse(await readFile(f.output, 'utf8')).phase, 'stopped');
});

test('Ctrl+C cancels an in-flight API call and writes stopped results', async t => {
  const f = await fixture(t);
  let resolveRequest;
  const received = new Promise(resolve => { resolveRequest = resolve; });
  const server = createServer(() => resolveRequest());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const { child, done } = launch(t, ['--scenario', f.scenario, '--api', `http://127.0.0.1:${server.address().port}`, '--output', f.output]);
  await received;
  child.kill('SIGINT');
  const result = await done;
  assert.equal(result.code, 130, result.stderr);
  assert.equal(JSON.parse(await readFile(f.output, 'utf8')).phase, 'stopped');
});

test('existing result file and invalid CLI options fail before simulation', async t => {
  const f = await fixture(t);
  await writeFile(f.output, 'keep');
  assert.equal((await launch(t, ['--scenario', f.scenario, '--dry-run', '--output', f.output]).done).code, 1);
  assert.equal(await readFile(f.output, 'utf8'), 'keep');
  assert.equal((await launch(t, ['--speed', '0', '--dry-run']).done).code, 1);
  assert.equal((await launch(t, ['--unknown']).done).code, 1);
});

test('very slow speed waits without timeout overflow and remains stoppable', async t => {
  const f = await fixture(t, { durationMs: 20000, tickMs: 1000 });
  const { child, done } = launch(t, ['--scenario', f.scenario, '--dry-run', '--speed', '0.000000001', '--quiet', '--output', f.output]);
  let text = '', sent = false;
  child.stdout.on('data', chunk => {
    text += chunk;
    if (!sent && text.includes('입력 명령:')) {
      sent = true;
      setTimeout(() => child.stdin.write('status\nstop\n'), 100);
    }
  });
  const result = await done;
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /TimeoutOverflowWarning/);
  const report = JSON.parse(await readFile(f.output, 'utf8'));
  assert.equal(report.tick, 1);
  assert.equal(report.phase, 'stopped');
});
