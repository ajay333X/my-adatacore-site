#!/usr/bin/env node
/**
 * Encrypted backup support: stream all current Supabase Storage objects to an
 * ephemeral runner directory. The caller MUST encrypt the directory before
 * uploading an artifact. Never run against untrusted URLs or print credentials.
 * Requires Node.js 22+ and service-role credentials in trusted CI secrets.
 */
'use strict';
const {mkdir,writeFile,stat} = require('node:fs/promises');
const {createWriteStream,createReadStream} = require('node:fs');
const {pipeline} = require('node:stream/promises');
const {Readable} = require('node:stream');
const {createHash} = require('node:crypto');
const path = require('node:path');

const base = process.env.BACKUP_SUPABASE_URL;
const key = process.env.BACKUP_SERVICE_ROLE_KEY;
const destination = process.env.BACKUP_STORAGE_DEST;
if (!base || !key || !destination) {
  throw new Error('BACKUP_SUPABASE_URL, BACKUP_SERVICE_ROLE_KEY and BACKUP_STORAGE_DEST are required');
}
const origin = new URL(base);
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') {
  throw new Error('BACKUP_SUPABASE_URL must be an HTTPS origin');
}
const root = path.resolve(destination);
const prefix = origin.origin + '/storage/v1';

function safeName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' ||
      name.includes('/') || name.includes('\\') || /[\x00-\x1f]/.test(name)) {
    throw new Error('Unsafe Storage object name');
  }
  return name;
}
function encoded(str) {return str.split('/').map(encodeURIComponent).join('/');}
async function request(url, options={}) {
  const response = await fetch(url,{
    ...options,
    headers:{
      apikey:key,
      Authorization:'Bearer '+key,
      ...(options.body ? {'Content-Type':'application/json'} : {}),
      ...(options.headers||{})
    },
    signal:AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error('Storage backup API request failed: HTTP '+response.status);
  return response;
}
async function fileHash(file) {
  const h=createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
async function main() {
  await mkdir(root,{recursive:true,mode:0o700});
  const response = await request(prefix+'/bucket');
  const parsed = await response.json();
  const buckets = Array.isArray(parsed) ? parsed : parsed.buckets;
  if (!Array.isArray(buckets) || !buckets.length) throw new Error('No buckets returned; refusing incomplete backup');
  const manifest = {created_at:new Date().toISOString(),buckets:[],files:[]};
  let files = 0;
  for (const bucket of buckets) {
    const bucketId=safeName(bucket.id);
    let total=0;
    async function walk(directory='',depth=0) {
      if (depth>40) throw new Error('Unexpected Storage folder depth');
      let offset=0;
      const pageSize=100;
      while (true) {
        const reply=await request(prefix+'/object/list/'+encodeURIComponent(bucketId),{
          method:'POST',
          body:JSON.stringify({prefix:directory,limit:pageSize,offset,sortBy:{column:'name',order:'asc'}})
        });
        const rows=await reply.json();
        if (!Array.isArray(rows)) throw new Error('Invalid Storage list response');
        for (const row of rows) {
          const name=safeName(row.name);
          const objectPath=directory+name;
          if (row.id == null) {await walk(objectPath+'/',depth+1);continue;}
          const absolute=path.resolve(root,bucketId,...objectPath.split('/'));
          if (!absolute.startsWith(root+path.sep)) throw new Error('Object escaped backup root');
          await mkdir(path.dirname(absolute),{recursive:true,mode:0o700});
          const download=await request(prefix+'/object/authenticated/'+encodeURIComponent(bucketId)+'/'+encoded(objectPath));
          if (!download.body) throw new Error('Missing object body');
          await pipeline(Readable.fromWeb(download.body),createWriteStream(absolute,{flags:'wx',mode:0o600}));
          const size=(await stat(absolute)).size;
          manifest.files.push({bucket:bucketId,path:objectPath,size,sha256:await fileHash(absolute)});
          total++;files++;
        }
        offset+=rows.length;
        if (rows.length < pageSize) break;
      }
    }
    await walk();
    manifest.buckets.push({id:bucketId,count:total});
  }
  if (!files) throw new Error('No objects downloaded; refusing potentially empty backup');
  await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  console.log('Downloaded Storage objects for encrypted backup: '+files+
              ' across '+manifest.buckets.length+' buckets.');
}
main().catch(err=>{console.error('Storage backup failed:',err.message);process.exitCode=1;});
