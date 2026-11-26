const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const source='/usr/src/app',root='/tmp/w4-clean-runtime',queue=[root+'/packages/server/api',root+'/packages/server/worker'],visited=new Set(queue),inventory=[];
function resolve(dir,name){for(let current=dir;current!==path.dirname(current);current=path.dirname(current)){const candidate=path.join(current,'node_modules',name);if(fs.existsSync(path.join(candidate,'package.json')))return fs.realpathSync(candidate);}return null;}
for(let index=0;index<queue.length;index++){
 const dir=queue[index],pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json'))),relative=path.relative(root,dir);
 if(relative.startsWith('..')||/packages\/ee\/|src\/app\/ee\//.test(relative)||pkg.name==='ee-embed-sdk'||pkg.name==='redis-memory-server')throw new Error('Excluded runtime dependency: '+pkg.name);
 inventory.push({name:pkg.name,version:pkg.version,license:pkg.license??null,path:relative});
 for(const name of Object.keys({...pkg.dependencies,...pkg.optionalDependencies})){const dependency=resolve(dir,name);if(!dependency){if(!pkg.optionalDependencies?.[name])throw new Error('Missing dependency: '+name);continue;}if(!visited.has(dependency)){visited.add(dependency);queue.push(dependency);}}
}
const previous=JSON.parse(fs.readFileSync('/tmp/w4-runtime-baseline.json'));
const versions=new Set(previous.map(item=>item.name+'@'+item.version));
const current=new Set(inventory.map(item=>item.name+'@'+item.version));
fs.writeFileSync('/tmp/w4-dependency-resolution-diff.json',JSON.stringify({added:[...current].filter(item=>!versions.has(item)),removed:[...versions].filter(item=>!current.has(item))},null,2));
fs.writeFileSync('/tmp/w4-runtime-inventory.json',JSON.stringify(inventory,null,2));
const files=[];
for(const item of inventory.filter(item=>item.path.startsWith('packages/'))){
 if(item.name==='api')files.push(item.path+'/dist/w4-bootstrap.cjs',item.path+'/src/assets/piece-upgrade-register.json');
 else if(fs.existsSync(source+'/'+item.path+'/dist'))files.push(item.path+'/dist');
}
files.push('dist/packages/engine','deploy/w4/schema-initial.sql','deploy/w4/schema-initial-down.sql','deploy/w4/start.cjs');
fs.writeFileSync('/tmp/w4-firstparty-files.txt',files.join('\n')+'\n');
execFileSync('tar',['-cf','/tmp/w4-firstparty.tar','--exclude=*.map','--exclude=*.ts','-C',source,'-T','/tmp/w4-firstparty-files.txt']);
execFileSync('tar',['-xf','/tmp/w4-firstparty.tar','-C',root]);
fs.rmSync(root+'/dist/packages/web',{recursive:true,force:true});
execFileSync('cp',['-a','/tmp/w4-web-build/dist/packages/web',root+'/dist/packages/web']);
fs.copyFileSync(source+'/LICENSE',root+'/LICENSE-ACTIVEPIECES');
console.log(JSON.stringify({runtimePackages:inventory.length,prepared:root}));
