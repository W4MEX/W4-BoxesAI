const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.env.W4_RUNTIME_ROOT||'/usr/src/app',target='/tmp/w4-notices',packages=new Map();
const extraLicenses=JSON.parse(fs.readFileSync('/tmp/w4-license-exceptions.json'));
fs.mkdirSync(target,{recursive:true});
function add(dir,scope){
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
 if(!manifest.name)return;
 const key=manifest.name+'@'+manifest.version;
 if(packages.has(key)){packages.get(key).scopes.push(scope);return;}
 const licenseFiles=fs.readdirSync(dir).filter(name=>/^(licen[sc]e|copying|notice|copyright)([._-]|$)/i.test(name)&&fs.statSync(path.join(dir,name)).isFile());
 const texts=licenseFiles.map(file=>({file,text:fs.readFileSync(path.join(dir,file),'utf8')}));
 const extra=extraLicenses.find(item=>item.name===manifest.name&&item.version===manifest.version);
 for(const file of extra?.files??[])if(!texts.some(item=>item.text===file.text))texts.push({file:file.file,text:file.text});
 const firstParty=dir.startsWith(root+'/packages/')||dir.startsWith('/tmp/w4-web-build/packages/');
 const license=firstParty?'MIT':manifest.license??(texts.some(item=>/Permission is hereby granted, free of charge/.test(item.text))?'MIT (license text)':texts.some(item=>/This is free and unencumbered software released into the public domain/.test(item.text))?'Unlicense':null);
 if(!firstParty&&license==='MIT'&&!texts.some(item=>/Permission is hereby granted, free of charge/.test(item.text))){
  const terms=fs.readFileSync('/usr/src/app/deploy/w4/LICENSE-W4','utf8').slice(fs.readFileSync('/usr/src/app/deploy/w4/LICENSE-W4','utf8').indexOf('Permission is hereby granted'));
  if(!terms.startsWith('Permission is hereby granted'))throw new Error('MIT terms missing');
  texts.push({file:'upstream-manifest-attribution-and-declared-MIT-terms',text:JSON.stringify({name:manifest.name,version:manifest.version,license:manifest.license,author:manifest.author,contributors:manifest.contributors,repository:manifest.repository},null,2)+'\n\nMIT terms for the upstream declared SPDX license; original copyright notices, where supplied, are preserved above.\n'+terms});
 }
 if(/Enterprise|SSPL|RSAL|Elastic|BUSL|UNLICENSED/i.test(JSON.stringify(license)))throw new Error('Excluded license: '+key);
 packages.set(key,{name:manifest.name,version:manifest.version,license,scopes:[scope],source:dir,texts});
}
for(const item of JSON.parse(fs.readFileSync('/tmp/w4-runtime-inventory.json')))add(path.join(root,item.path),'server');
for(const module of JSON.parse(fs.readFileSync('/tmp/w4-web-modules.json'))){
 if(!module.startsWith('/tmp/w4-web-build/')||!module.includes('/node_modules/'))continue;
 const prefix=module.slice(0,module.lastIndexOf('/node_modules/')+14);
 const segments=module.slice(prefix.length).split('/');
 const dir=prefix+segments.slice(0,segments[0].startsWith('@')?2:1).join('/');
 if(fs.existsSync(path.join(dir,'package.json')))add(dir,'web-bundle');
}
add('/usr/src/node_modules/isolated-vm','engine-native');add('/usr/src/node_modules/node-gyp-build','engine-native');
for(const source of JSON.parse(fs.readFileSync('/usr/src/app/dist/packages/engine/main.js.map')).sources){
 const module=path.resolve('/usr/src/app/dist/packages/engine',source);
 if(!module.includes('/node_modules/'))continue;
 const prefix=module.slice(0,module.lastIndexOf('/node_modules/')+14);
 const segments=module.slice(prefix.length).split('/');
 const name=segments.slice(0,segments[0].startsWith('@')?2:1).join('/');
 const folder=source.split('/.bun/')[1]?.split('/')[0];
 const version=folder?.slice(folder.lastIndexOf('@')+1).split('+')[0];
 const fallback=JSON.parse(fs.readFileSync('/tmp/w4-runtime-inventory.json')).find(item=>item.name===name&&item.version===version);
 const original=prefix+name;
 const dir=fs.existsSync(path.join(original,'package.json'))?original:fallback?path.join(root,fallback.path):null;
 if(!dir)throw new Error('Missing engine package metadata: '+name+'@'+version);
 add(dir,'engine-bundle');
}
const rows=[...packages.values()].sort((a,b)=>a.name.localeCompare(b.name));
const unresolved=rows.filter(row=>!row.license);
fs.writeFileSync(path.join(target,'dependency-inventory.json'),JSON.stringify(rows.map(({texts,...row})=>({...row,source:row.source.replace(root,'app').replace('/tmp/w4-web-build','web-build'),licenseFiles:texts.map(item=>({file:item.file,sha256:crypto.createHash('sha256').update(item.text).digest('hex')}))})),null,2));
fs.writeFileSync(path.join(target,'THIRD-PARTY-NOTICES.txt'),rows.map(row=>`${row.name} ${row.version}\nLicense: ${JSON.stringify(row.license)}\n${row.texts.map(item=>item.file+'\n'+item.text).join('\n')}\n`).join('\n============================================================\n'));
fs.writeFileSync(path.join(target,'unresolved.json'),JSON.stringify(unresolved.map(({texts,...row})=>row),null,2));
console.log(JSON.stringify({packages:rows.length,unresolved:unresolved.map(row=>row.name)}));
