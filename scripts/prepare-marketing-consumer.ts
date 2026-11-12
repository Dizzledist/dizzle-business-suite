import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Source-only integration fixture: this never merges/cherry-picks PR #5 into the task branch.
const revision = '2ad2e46e41dfdc73322c23536c695209b929df3e';
try { execFileSync('git', ['cat-file', '-e', revision + '^{commit}'], { stdio: 'pipe' }); }
catch { throw new Error('Pinned PR #5 commit missing. Fetch origin with full history before running integration checks.'); }
const target = resolve('test-results', 'marketing-auth-consumer'); mkdirSync(target, { recursive: true });
const archive = resolve('test-results', 'marketing-auth-consumer.tar');
writeFileSync(archive, execFileSync('git', ['archive', '--format=tar', revision, 'server/publishing', 'server/workflow.ts', 'server/fixtures.ts', 'shared/contracts.ts', 'shared/publishing.ts'], { maxBuffer: 4_000_000 }));
execFileSync('tar', ['-xf', archive, '-C', target]);
console.log('Prepared pinned PR #5 source fixture: ' + revision.slice(0, 7));
