import json,posixpath,tarfile,sys
archive=sys.argv[1] if len(sys.argv)>1 else '/tmp/w4-runtime-final.tar'
output=sys.argv[2] if len(sys.argv)>2 else '/tmp/w4-archive-audit.json'
entries={}
with tarfile.open(archive,'r') as package:
    for member in package:
        entries[member.name]=member
errors=[]
for name,member in entries.items():
    if any(part in name for part in ['/packages/ee/','/packages/server/api/src/app/ee/','/packages/server/api/dist/src/app/ee/','Sentient-Variable','redis-memory-server','ee-embed-sdk']):
        errors.append('Excluded artifact: '+name)
    if posixpath.basename(name).startswith('.env'):
        errors.append('Environment file: '+name)
    if name.startswith('/') or '..' in name.split('/'):
        errors.append('Escaping archive path: '+name)
    if member.issym():
        resolved=posixpath.normpath(posixpath.join(posixpath.dirname(name),member.linkname))
        if member.linkname.startswith('/') or resolved.startswith('../') or not resolved.startswith(('runtime/','engine-native/')):
            errors.append('Escaping symlink: '+name)
report={'entries':len(entries),'excludedArtifacts':len(errors),'errors':errors}
json.dump(report,open(output,'w'),indent=2)
print(json.dumps(report))
if errors:raise SystemExit(1)
