import { runNpm } from './lib/runtime.mjs';
const task = process.argv[2];
if (!['check', 'test', 'build', 'start', 'doctor', 'format'].includes(task)) {
  console.error('Task must be check, test, build, start, doctor, or format.');
  process.exitCode = 1;
} else {
  try {
    await runNpm(['run', task, '--', ...process.argv.slice(3)]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
