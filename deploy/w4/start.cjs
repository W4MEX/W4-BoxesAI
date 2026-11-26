const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
for (const [name, expected] of Object.entries({ AP_EDITION: 'ce', AP_DB_TYPE: 'POSTGRES', AP_EXECUTION_MODE: 'SANDBOX_CODE_ONLY' })) {
  if (process.env[name] !== expected) throw new Error(`This W4 distribution requires ${name}=${expected}`);
}

const mode = process.env.AP_CONTAINER_TYPE || 'WORKER_AND_APP';
const port = process.env.AP_PORT || '80';
const children = [];
let stopping = false;
const workerToken = process.env.AP_WORKER_TOKEN || jwt.sign(
  { id: crypto.randomUUID(), type: 'WORKER' }, process.env.AP_JWT_SECRET,
  { expiresIn: '100d', keyid: '1', algorithm: 'HS256', issuer: 'activepieces' },
);

function launch(file, env) {
  const child = spawn(process.execPath, [file], { env: { ...process.env, ...env }, stdio: 'inherit' });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(JSON.stringify({ component: file, event: 'unexpected-child-exit', code, signal }));
      stopping = true;
      for (const other of children) if (other !== child) other.kill('SIGTERM');
      process.exitCode = code || 1;
    }
  });
}
if (mode === 'APP' || mode === 'WORKER_AND_APP') launch('packages/server/api/dist/w4-bootstrap.cjs', { AP_CONTAINER_TYPE: 'APP' });
if (mode === 'WORKER' || mode === 'WORKER_AND_APP') launch('packages/server/worker/dist/src/bootstrap.js', {
  AP_CONTAINER_TYPE: 'WORKER',
  AP_PORT: mode === 'WORKER_AND_APP' ? '0' : port,
  AP_WORKER_TOKEN: workerToken,
  AP_FRONTEND_URL: mode === 'WORKER_AND_APP' ? `http://127.0.0.1:${port}` : process.env.AP_FRONTEND_URL,
});
if (!children.length) throw new Error('Unsupported W4 container mode');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stopping = true;
  for (const child of children) child.kill(signal);
});
