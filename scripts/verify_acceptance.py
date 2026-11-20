#!/usr/bin/env python3
"""Run isolated HTTP/SSE/concurrency/persistence checks against the built API.

Uses only Python's standard library and a throwaway PostgreSQL container
(tmpfs data, removed afterwards), never the `npm run dev` database. Docker is required.
Spring API (default): cd api && ./gradlew bootJar, then python3 scripts/verify_acceptance.py
NestJS api2: cd api2 && npm run build, then python3 scripts/verify_acceptance.py --impl api2
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def available_port():
    with socket.socket() as connection:
        connection.bind(('127.0.0.1', 0))
        return connection.getsockname()[1]


def request(origin, path, body=None, key=None):
    headers = {'Accept': 'application/json'}
    if key is not None:
        headers['Idempotency-Key'] = key
    data = None if body is None else json.dumps(body).encode()
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = Request(origin + path, data=data, headers=headers)
    try:
        with urlopen(req, timeout=10) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)


class Events:
    def __init__(self, origin):
        self.origin = origin
        self.condition = threading.Condition()
        self.names = []
        self.error = None
        self.response = None
        self.thread = threading.Thread(target=self.read, daemon=True)
        self.thread.start()

    def read(self):
        try:
            self.response = urlopen(self.origin + '/api/events', timeout=30)
            event = None
            for raw in self.response:
                line = raw.decode().strip()
                if line.startswith('event:'):
                    event = line.split(':', 1)[1].strip()
                elif not line and event:
                    with self.condition:
                        self.names.append(event)
                        self.condition.notify_all()
                    event = None
        except Exception as error:
            with self.condition:
                self.error = error
                self.condition.notify_all()

    def wait_for(self, name, count):
        with self.condition:
            ok = self.condition.wait_for(
                lambda: self.names.count(name) >= count or self.error is not None, timeout=10)
            assert ok and self.names.count(name) >= count, (name, count, self.names, self.error)

    def close_after_server_stop(self):
        self.thread.join(timeout=5)
        if self.response is not None:
            self.response.close()


POSTGRES_IMAGE = 'postgres:17.5-alpine'


def start_postgres():
    """Start a disposable PostgreSQL on a random local port; it lives across API restarts."""
    container = subprocess.run([
        'docker', 'run', '--detach', '--rm', '--tmpfs', '/var/lib/postgresql/data',
        '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_DB=auction',
        '--env', 'POSTGRES_USER=auction', '--env', 'POSTGRES_PASSWORD=auction', POSTGRES_IMAGE,
    ], check=True, capture_output=True, text=True).stdout.strip()
    try:
        published = subprocess.run(['docker', 'port', container, '5432/tcp'],
                                   check=True, capture_output=True, text=True).stdout
        db_port = published.splitlines()[0].rsplit(':', 1)[1]
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            # TCP 확인까지 해야 초기화 중 임시 서버가 아닌 실제 서버가 준비된 것이다.
            ready = subprocess.run(['docker', 'exec', container, 'pg_isready', '-h', '127.0.0.1',
                                    '-U', 'auction', '-d', 'auction'], capture_output=True)
            if ready.returncode == 0:
                return container, db_port
            time.sleep(0.5)
        raise RuntimeError('PostgreSQL startup timed out')
    except Exception:
        stop_postgres(container)
        raise


def stop_postgres(container):
    subprocess.run(['docker', 'rm', '--force', container], capture_output=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--impl', choices=['api', 'api2'], default='api',
                        help='api: Spring Boot jar (default), api2: NestJS build in api2/dist')
    parser.add_argument('--jar', type=Path, help='Built Spring Boot executable jar')
    args = parser.parse_args()
    if args.impl == 'api2':
        node = shutil.which('node')
        entry = ROOT / 'api2/dist/main.js'
        if not node:
            parser.error('Node.js 22 or newer is required for api2.')
        if not entry.is_file():
            parser.error('api2 build missing. Run: cd api2 && npm run build')
    else:
        jars = sorted((ROOT / 'api/build/libs').glob('*.jar'))
        jars = [p for p in jars if not p.name.endswith('-plain.jar')]
        jar = args.jar.resolve() if args.jar else (jars[0] if jars else None)
        if jar is None or not jar.is_file():
            parser.error('API jar missing. Run: cd api && ./gradlew bootJar')
        java_home = os.environ.get('JAVA_HOME')
        java = str(Path(java_home) / 'bin/java') if java_home else shutil.which('java')
        if not java:
            parser.error('Java 21 or newer is required; configure JAVA_HOME.')
    origin = 'http://127.0.0.1:' + str(available_port())
    port = origin.rsplit(':', 1)[1]
    if not shutil.which('docker'):
        parser.error('Docker is required for the PostgreSQL acceptance database.')
    container, db_port = start_postgres()

    with tempfile.TemporaryDirectory(prefix='auction-crm-acceptance-') as temp:
        folder = Path(temp)
        process = None
        streams = []
        log = (folder / 'server.log').open('w+')

        def start():
            nonlocal process
            if args.impl == 'api2':
                env = {**os.environ, 'PORT': port, 'DB_HOST': '127.0.0.1', 'DB_PORT': db_port,
                       'DB_NAME': 'auction', 'DB_USERNAME': 'auction', 'DB_PASSWORD': 'auction'}
                process = subprocess.Popen([node, str(entry)], cwd=ROOT / 'api2', env=env,
                                           stdout=log, stderr=subprocess.STDOUT)
            else:
                process = subprocess.Popen([
                    java, '-jar', str(jar), '--server.port=' + port,
                    '--spring.datasource.url=jdbc:postgresql://127.0.0.1:' + db_port + '/auction',
                    '--server.shutdown=immediate',
                    '--logging.level.root=WARN', '--logging.level.com.example.demo=INFO',
                    '--logging.level.org.hibernate.SQL=OFF',
                ], cwd=folder, stdout=log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError('API exited before startup')
                try:
                    status, _ = request(origin, '/api/dashboard')
                    if status == 200:
                        return
                except (URLError, TimeoutError, ConnectionError):
                    pass
                threading.Event().wait(0.2)
            raise RuntimeError('API startup timed out')

        def stop():
            nonlocal process
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            process = None

        def bid(name, amount, key=None):
            status, result = request(origin, '/api/bid', {'customerName': name, 'amount': amount}, key)
            assert status == 200, (status, result)
            return result

        try:
            start()
            status, empty = request(origin, '/api/dashboard')
            assert status == 200 and empty['summary'] == {
                'bidCount': 0, 'participantCount': 0, 'highestAmount': 0, 'highestBidderName': None}
            assert empty['participants'] == []
            streams = [Events(origin), Events(origin)]
            for stream in streams:
                stream.wait_for('ready', 1)

            first = bid(' 홍길동 ', 100, 'first')
            assert first['status'] == 'ACCEPTED' and first['highestAmount'] == 100
            assert bid('김민서', 100)['status'] == 'REJECTED'
            assert bid('김민서', 200)['status'] == 'ACCEPTED'
            assert bid('홍길동', 100, 'first') == first
            assert request(origin, '/api/bid', {'customerName': '홍길동', 'amount': 110}, 'first')[0] == 409
            assert request(origin, '/api/bid', {'customerName': 'invalid', 'amount': '300'})[0] == 400
            assert bid('홍길동', 300)['status'] == 'ACCEPTED'

            with ThreadPoolExecutor(max_workers=8) as pool:
                list(pool.map(lambda amount: bid('동시 참가자', amount), range(1000, 1020)))
            with ThreadPoolExecutor(max_workers=8) as pool:
                retries = list(pool.map(lambda _: bid('재송신 참가자', 2000, 'same-key'), range(10)))
            assert all(result == retries[0] for result in retries)
            for stream in streams:
                stream.wait_for('dashboard-changed', 25)
                assert stream.names.count('dashboard-changed') == 25

            status, before = request(origin, '/api/dashboard')
            assert status == 200 and before['summary'] == {
                'bidCount': 25, 'participantCount': 4, 'highestAmount': 2000, 'highestBidderName': '재송신 참가자'}
            assert [p['highestAcceptedAmount'] for p in before['participants']] == [2000, 1019, 300, 200]
            assert [p['rank'] for p in before['participants']] == [1, 2, 3, 4]
            assert sum(p['bidCount'] for p in before['participants']) == 25
            print('PASS HTTP: approval/rejection, normalized identity, strict input, retry/conflict, concurrent bids')
            print('PASS SSE: two subscribers each received ready + exactly 25 new-record events')

            stop()
            for stream in streams:
                stream.close_after_server_stop()
            streams = []
            start()
            assert request(origin, '/api/dashboard')[1] == before
            assert bid('홍길동', 100, 'first') == first
            assert request(origin, '/api/dashboard')[1] == before
            print('PASS persistence: restart restored identical summary/ranking/timestamps and original retry response')
            print('PASS isolated acceptance: 25 bids / 4 participants / highest 2,000 KRW; temporary DB cleaned')
        except Exception:
            log.flush()
            log.seek(0)
            print(log.read()[-12000:])
            raise
        finally:
            stop()
            for stream in streams:
                stream.close_after_server_stop()
            log.close()
            stop_postgres(container)


if __name__ == '__main__':
    main()
