import { ROOT, option } from './lib/runtime.mjs';
import { backup, changes, updatePlan, applyUpdate, restore } from './lib/source.mjs';
import path from 'node:path';
try {
  const command = process.argv[2];
  let result;
  if (command === 'backup') result = await backup(ROOT);
  else if (command === 'changes') result = await changes(ROOT);
  else if (command === 'restore') result = await restore(ROOT, option('--backup'));
  else if (command === 'update-plan' || command === 'update-apply') {
    const from = option('--from');
    if (!from) throw new Error('--from 에 새 소스 폴더를 지정하세요.');
    if (command === 'update-plan') {
      const plan = await updatePlan(ROOT, path.resolve(from));
      result = { version: plan.version, changes: plan.changes, conflicts: plan.conflicts };
    } else result = await applyUpdate(ROOT, path.resolve(from));
    if (result.conflicts?.length) process.exitCode = 2;
  } else
    throw new Error('backup, changes, update-plan, update-apply, restore 중 하나를 사용하세요.');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', message: error.message }));
  process.exitCode = 1;
}
