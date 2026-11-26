const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { io } = createRequire('/usr/src/app/packages/core/shared/package.json')('socket.io-client');
const origin = process.env.W4_TEST_ORIGIN || 'http://127.0.0.1';
const state = JSON.parse(fs.readFileSync('/tmp/w4-test-users.json'));
const { owner, viewer, projectA, projectB } = state.fixture;
async function request(method, route, body, actor = owner) {
  const r = await fetch(origin + '/api' + route, { method, headers: { authorization: `Bearer ${actor.token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000) });
  const data = await r.json();
  if (!r.ok) { const error = new Error(`${method} ${route}: ${r.status} ${JSON.stringify(data.params || data.message || data).slice(0,400)}`); error.status = r.status; throw error; }
  return data;
}
async function socketFor(actor, projectId) {
  const socket = io(origin, { path: '/api/socket.io', transports: ['websocket'], auth: { token: actor.token, projectId }, reconnection: false });
  await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>{socket.close();reject(new Error('Socket connection timed out'));},10000);
    socket.once('connect',()=>{clearTimeout(timer);resolve();});
    socket.once('connect_error',error=>{clearTimeout(timer);socket.close();reject(error);});
  });
  return socket;
}
async function main() {
  const cross = await socketFor(owner, projectB.id).then(socket => { socket.close(); return false; }).catch(()=>true);
  assert.equal(cross,true); console.log('PASS Cross-organization WebSocket rejected');
  const viewerSocket = await socketFor(viewer, projectA.id);
  try {
    const revoked = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Suspended WebSocket remained connected')), 10000);
      viewerSocket.once('disconnect', () => { clearTimeout(timer); resolve(); });
    });
    await request('POST', `/v1/users/${viewer.id}`, { status: 'INACTIVE' });
    await revoked;
    console.log('PASS User suspension disconnects an existing WebSocket');
  } finally {
    viewerSocket.close();
    await request('POST', `/v1/users/${viewer.id}`, { status: 'ACTIVE' });
  }
  let flow=await request('POST','/v1/flows',{projectId:projectA.id,displayName:'W4 verified execution'});
  flow=await request('POST',`/v1/flows/${flow.id}`,{type:'UPDATE_TRIGGER',request:{name:'trigger',displayName:'Manual',type:'PIECE_TRIGGER',valid:true,settings:{pieceName:'@activepieces/piece-manual-trigger',pieceVersion:'~0.0.8',triggerName:'manual_trigger',input:{},propertySettings:{}}}});
  flow=await request('POST',`/v1/flows/${flow.id}`,{type:'ADD_ACTION',request:{parentStep:'trigger',action:{name:'step_1',type:'CODE',displayName:'W4 sum',valid:true,settings:{input:{},sourceCode:{code:'export const code = async () => ({ answer: 6 * 7, product: "W4-BoxesAI" });',packageJson:'{}'}}}}});
  flow=await request('POST',`/v1/flows/${flow.id}`,{type:'LOCK_AND_PUBLISH',request:{}});
  assert.ok(flow.publishedVersionId); console.log('PASS Flow editor operations and publication');
  const before = await request('GET',`/v1/w4/analytics?projectId=${projectA.id}`);
  const socket=await socketFor(owner,projectA.id);
  let run;
  try {
    run=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Manual run did not start')),45000);
      socket.once('MANUAL_TRIGGER_RUN_STARTED',data=>{clearTimeout(timer);resolve(data);});
      socket.emit('MANUAL_TRIGGER_RUN_STARTED',{flowVersionId:flow.publishedVersionId});
    });
    console.log('PASS Worker accepted a production run');
    const deadline=Date.now()+180000;
    while(Date.now()<deadline) {
      try { run=await request('GET',`/v1/flow-runs/${run.id}`); }
      catch(error) { if(error.status!==404)throw error; }
      if(run.finishTime)break;
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    assert.equal(run.status,'SUCCEEDED',`Flow status ${run.status}; ${JSON.stringify(run.error || run.internalError || {}).slice(0,500)}`);
    assert.equal(run.steps?.step_1?.output?.answer,42);
    console.log('PASS Sandboxed code executed and returned 42');
    const after=await request('GET',`/v1/w4/analytics?projectId=${projectA.id}`);
    assert.equal(after.runs.succeeded,before.runs.succeeded+1);
    assert.equal(after.runs.total,before.runs.total+1);
    assert.ok(after.averageDurationMs>=0); console.log('PASS Analytics counts the completed production run');
    fs.writeFileSync('/tmp/w4-flow-results.json',JSON.stringify({flowId:flow.id,runId:run.id,status:run.status,answer:42,analyticsIncrement:1},null,2));
  } finally { socket.close(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
