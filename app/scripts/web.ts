import { spawn } from 'node:child_process';
import electronApi from 'electron';
const child = spawn(electronApi as unknown as string, ['scripts/web-harness.cjs'], {
  stdio: 'inherit',
});
child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
process.once('SIGINT', () => child.kill('SIGINT'));
process.once('SIGTERM', () => child.kill('SIGTERM'));
