import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const environmentFile = join(frontendDir, '.env.backend-test');
const project = 'securityadvisor-integration';

function docker(args, { environment = process.env, label = 'Docker 확인', progress = false } = {}) {
  return new Promise((resolveCommand, reject) => {
    // 셸 문자열을 만들지 않아 Windows 경로의 공백과 명령 삽입을 함께 처리한다.
    const child = spawn('docker', args, {
      cwd: frontendDir,
      env: environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      if (output.length < 1_000_000) output += chunk.toString();
    });
    // 환경 파일 파싱 오류에도 비밀값이 노출되지 않도록 Docker 원문은 출력하지 않는다.
    child.stderr.resume();
    const timer = progress ? setInterval(() => console.info(`${label} 진행 중…`), 30_000) : null;
    child.once('error', () => {
      clearInterval(timer);
      reject(
        new Error('Docker 명령을 실행할 수 없습니다. Docker Desktop 설치·실행 상태를 확인하세요.'),
      );
    });
    child.once('close', (code) => {
      clearInterval(timer);
      if (code === 0) resolveCommand(output.trim());
      else reject(new Error(`${label}에 실패했습니다(종료 코드 ${code ?? '없음'}).`));
    });
  });
}

async function checkPrerequisites(backendPath) {
  let backendDir;
  try {
    backendDir = await realpath(resolve(backendPath));
    for (const file of [
      'compose.yaml',
      'Dockerfile',
      'build.gradle.kts',
      'docs/FRONTEND_HANDOFF.md',
    ]) {
      if (!(await stat(join(backendDir, file))).isFile()) throw new Error();
    }
  } catch {
    throw new Error(
      '--backend에 실제 Security-Advisor-Back 폴더를 지정하세요. 해당 PC에서 실행해야 합니다.',
    );
  }
  const version = await docker(['compose', 'version', '--short'], {
    label: 'Docker Compose 버전 확인',
  });
  const numbers = version
    .match(/(\d+)\.(\d+)\.(\d+)/)
    ?.slice(1)
    .map(Number);
  if (
    !numbers ||
    numbers[0] < 2 ||
    (numbers[0] === 2 && (numbers[1] < 24 || (numbers[1] === 24 && numbers[2] < 4)))
  ) {
    throw new Error('Docker Compose 2.24.4 이상이 필요합니다(!override 사용).');
  }
  const contextEndpoint = () =>
    docker(
      [
        'context',
        'inspect',
        ...(process.env.DOCKER_CONTEXT ? [process.env.DOCKER_CONTEXT] : []),
        '--format',
        '{{.Endpoints.docker.Host}}',
      ],
      { label: '로컬 Docker 연결 확인' },
    );
  // Docker CLI도 DOCKER_CONTEXT를 DOCKER_HOST보다 우선한다.
  const endpoint = process.env.DOCKER_CONTEXT
    ? await contextEndpoint()
    : process.env.DOCKER_HOST || (await contextEndpoint());
  if (
    !/^(unix:\/\/|npipe:\/\/\/\/\.\/pipe\/|tcp:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$)/.test(
      endpoint,
    )
  ) {
    throw new Error('이 실행기는 로컬 Docker 연결만 지원합니다. 로컬 Docker context를 선택하세요.');
  }
  await docker(['info', '--format', '{{.ServerVersion}}'], { label: 'Docker 엔진 연결 확인' });
  return backendDir;
}

async function readTestEnvironment(stop) {
  try {
    return parseEnv(await readFile(environmentFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('테스트 환경 파일을 읽을 수 없습니다.');
    if (stop) throw new Error('중지할 테스트 환경 파일(.env.backend-test)이 없습니다.');
  }
  const content = [
    '# 로컬 합성 데이터 시험 전용. 비밀번호를 콘솔·Git·채팅에 복사하지 않는다.',
    '# 기존 DB·계정의 비밀번호는 이 파일을 수정해도 자동 변경되지 않는다.',
    'POSTGRES_DB=securityadvisor_integration',
    'POSTGRES_USER=securityadvisor_test',
    `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`,
    `DEMO_ACCOUNT_PASSWORD=Demo9!${randomBytes(20).toString('hex')}`,
    'INSTITUTION_NAME=한국주택금융공사',
    'INSTITUTION_CODE=DEMO-INTEGRATION',
    'LLM_MODE=fake',
    'SECURITYADVISOR_FRONTEND_PORT=3001',
    'SECURITYADVISOR_BACKEND_PORT=8081',
    '',
  ].join('\n');
  try {
    // 동시에 실행해도 이미 생성된 환경 파일과 비밀번호를 덮어쓰지 않는다.
    await writeFile(environmentFile, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    console.info('로컬 테스트 환경 파일을 생성했습니다. 비밀번호는 해당 파일에서 확인하세요.');
  } catch (error) {
    if (error.code !== 'EEXIST') throw new Error('테스트 환경 파일을 생성할 수 없습니다.');
  }
  return parseEnv(await readFile(environmentFile, 'utf8'));
}

function validateEnvironment(environment) {
  for (const name of [
    'POSTGRES_DB',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'DEMO_ACCOUNT_PASSWORD',
  ]) {
    if (!environment[name]?.trim() || /[\r\n]/.test(environment[name])) {
      throw new Error(`테스트 환경 파일의 ${name} 설정을 확인하세요.`);
    }
  }
  if (!['fake', 'live'].includes(environment.LLM_MODE ?? 'fake')) {
    throw new Error('테스트 환경 파일의 LLM_MODE는 fake 또는 live여야 합니다.');
  }
  const ports = [
    environment.SECURITYADVISOR_FRONTEND_PORT ?? '3001',
    environment.SECURITYADVISOR_BACKEND_PORT ?? '8081',
  ];
  if (
    ports.some((port) => !/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) ||
    Number(ports[0]) === Number(ports[1])
  ) {
    throw new Error('테스트 포트는 서로 다른 1024~65535 정수여야 합니다.');
  }
  return { frontendPort: Number(ports[0]), backendPort: Number(ports[1]) };
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('서버 준비 중');
  return response.json();
}

async function verifyConnection(frontendOrigin, backendOrigin, environment) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const [health, direct, proxied] = await Promise.all([
        getJson(`${backendOrigin}/actuator/health`),
        getJson(`${backendOrigin}/api/installation`),
        getJson(`${frontendOrigin}/api/installation`),
      ]);
      if (
        health.status === 'UP' &&
        typeof direct.name === 'string' &&
        typeof direct.code === 'string' &&
        proxied.name === direct.name &&
        proxied.code === direct.code &&
        direct.name === (environment.INSTITUTION_NAME || '합성 시연 기관') &&
        direct.code === (environment.INSTITUTION_CODE || 'DEMO')
      )
        return;
    } catch {
      // 컨테이너 실행 상태와 API 준비 완료는 다르므로 제한 시간 동안 재확인한다.
    }
    await delay(2_000);
  }
  throw new Error(
    '실제 Back health 또는 Front 프록시의 기관 정보 검증에 실패했습니다. 컨테이너와 볼륨은 보존됩니다.',
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      backend: { type: 'string' },
      stop: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.info(
      'node tools/runBackendTestServer.mjs --backend <Back 폴더> [--stop]\n\n기본 주소: Front http://127.0.0.1:3001 / Back http://127.0.0.1:8081\nDocker Compose 2.24.4 이상이 필요합니다. --stop은 DB·업로드 볼륨을 보존합니다.\nFront의 .env.backend-test를 처음 한 번 생성하며 기존 환경 파일은 수정하지 않습니다.',
    );
    return;
  }
  if (!values.backend) throw new Error('--backend <Security-Advisor-Back 폴더>가 필요합니다.');
  const backendDir = await checkPrerequisites(values.backend);
  const testEnvironment = await readTestEnvironment(values.stop);
  const { frontendPort, backendPort } = validateEnvironment(testEnvironment);
  const environment = {
    ...process.env,
    ...testEnvironment,
    // 자격증명·경로의 실제 값은 Docker 인자로 전달하거나 출력하지 않는다.
    SECURITYADVISOR_FRONTEND_DIR: frontendDir,
    SECURITYADVISOR_TEST_ENV_FILE: environmentFile,
    COMPOSE_PROFILES: '',
  };
  const compose = [
    'compose',
    '--project-name',
    project,
    '--project-directory',
    backendDir,
    '--env-file',
    environmentFile,
    '-f',
    join(backendDir, 'compose.yaml'),
    '-f',
    join(frontendDir, 'compose.backend-test.yaml'),
  ];
  const run = (args, label, progress = false) =>
    docker([...compose, ...args], { environment, label, progress });
  await run(['config', '--quiet'], '연동 Compose 구성 확인');
  if (values.stop) {
    await run(['down'], '테스트 서버 중지');
    console.info('테스트 서버를 중지했습니다. DB·업로드 볼륨과 환경 파일은 보존했습니다.');
    return;
  }
  console.info('실제 Back·Front 이미지를 빌드합니다. 최초 실행은 이미지와 의존성을 내려받습니다.');
  await run(['build', 'app', 'front'], 'Back·Front 빌드', true);
  // Back 이미지는 비특권 app 사용자로 실행한다. 새 시험 볼륨의 소유권만 먼저 맞춘다.
  await run(
    [
      'run',
      '--rm',
      '--no-deps',
      '--user',
      'root',
      '--entrypoint',
      '/bin/sh',
      'app',
      '-c',
      'mkdir -p /data/storage && chown app:app /data/storage',
    ],
    '업로드 볼륨 초기화',
  );
  await run(
    ['up', '-d', '--wait', '--wait-timeout', '180', 'db', 'app', 'front'],
    '테스트 서버 시작',
    true,
  );
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  const backendOrigin = `http://127.0.0.1:${backendPort}`;
  console.info('Spring 상태와 Front → Back 프록시 응답을 확인합니다.');
  await verifyConnection(frontendOrigin, backendOrigin, testEnvironment);
  console.info(
    `연동 서버 준비 완료: ${frontendOrigin}\nBack Swagger: ${backendOrigin}/swagger-ui.html`,
  );
  console.info(
    `실제 Spring Boot·PostgreSQL 연결을 확인했습니다. AI 모드: ${testEnvironment.LLM_MODE ?? 'fake'}.`,
  );
  console.info(
    '인증·CSRF 연결 검사는 npm run test:connection으로 실행하세요. 업무 화면 전체 검증은 별도입니다.',
  );
}

main().catch((error) => {
  console.error(
    `테스트 서버 실행 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
  );
  process.exitCode = 1;
});
