import { spawn } from 'node:child_process';

const [command = 'dev', mode = 'mock', ...extra] = process.argv.slice(2);
const args = [];
for (let index = 0; index < extra.length; index += 1) {
  if (extra[index] === '--strictPort') continue;
  args.push(extra[index] === '--host' ? '--hostname' : extra[index]);
}
if (!args.includes('--hostname')) args.push('--hostname', '0.0.0.0');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', command, ...args], {
  stdio: 'inherit',
  env: { ...process.env, API_MODE: mode },
});
child.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
