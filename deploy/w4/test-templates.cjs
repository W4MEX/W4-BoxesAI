const fs=require('node:fs'),assert=require('node:assert/strict');
const state=JSON.parse(fs.readFileSync('/tmp/w4-test-users.json'));
const {owner,platformB,viewer}=state.fixture;
const base=process.env.W4_TEST_ORIGIN||'http://127.0.0.1';
async function request(method,route,body,actor=owner,statuses=[200,201,204]){
 const res=await fetch(base+'/api/v1'+route,{method,headers:{...(actor?{authorization:`Bearer ${actor.token}`}:{}) ,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
 const data=await res.text();assert.ok(statuses.includes(res.status),`${method} ${route}: ${res.status} ${data.slice(0,300)}`);return data?JSON.parse(data):null;
}
async function main(){
 const tested=JSON.parse(fs.readFileSync('/tmp/w4-flow-results.json'));
 const flow=await request('GET','/flows/'+tested.flowId);
 const {displayName,trigger,schemaVersion,notes,valid}=flow.version;
 const template=await request('POST','/templates',{type:'CUSTOM',name:'W4 private test',summary:'Tenant-only template',description:'W4 independent template test',categories:[],tags:[],author:'W4',flows:[{displayName,trigger,schemaVersion,notes,valid}]});
 await request('GET','/templates/'+template.id,undefined,owner);
 await request('GET','/templates/'+template.id,undefined,viewer);
 await request('GET','/templates/'+template.id,undefined,platformB,[403,404]);
 await request('GET','/templates/'+template.id,undefined,null,[403,404]);
 const a=await request('GET','/templates?type=CUSTOM',undefined,owner);
 const b=await request('GET','/templates?type=CUSTOM',undefined,platformB);
 assert.ok(a.data.some(item=>item.id===template.id));assert.ok(!b.data.some(item=>item.id===template.id));
 await request('POST','/templates/'+template.id,{name:'forbidden'},platformB,[403,404]);
 await request('DELETE','/templates/'+template.id,undefined,platformB,[403,404]);
 await request('DELETE','/templates/'+template.id,undefined,owner);
 console.log('PASS Private templates: read/list/update/delete and anonymous access isolated');
 fs.writeFileSync('/tmp/w4-template-results.json',JSON.stringify({passed:8,privateTemplatesIsolated:true},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
