import { access, cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';import { execFileSync } from 'node:child_process';
import { join } from 'node:path';import { pathToFileURL } from 'node:url';
const mode=process.argv[2];process.env.NODE_ENV='test';
const required=['src/server.js','src/worker.js','src/infra/d1-store.js','src/service.js','src/domain/mediation.js','public/index.html','public/app.js','public/styles.css','public/assets/moderator.png'];
if(mode==='typecheck'){for(const file of required){await access(file);if(file.startsWith('src/'))await import(pathToFileURL(join(process.cwd(),file)));}console.log('typecheck: PASS (ES module import validation)');}
else if(mode==='lint'){const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);e.isDirectory()?await walk(p):/\.(js|json)$/.test(p)&&files.push(p);}}await walk('src');await walk('public');for(const f of files){const t=await readFile(f,'utf8');if(/\beval\s*\(/.test(t))throw new Error(`unsafe eval: ${f}`);if(f.endsWith('.json'))JSON.parse(t);else execFileSync(process.execPath,['--check',f],{stdio:'pipe'});}console.log(`lint: PASS (${files.length} files)`);}
else if(mode==='build'){await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('src','dist/src',{recursive:true});await cp('public','dist/public',{recursive:true});await cp('package.json','dist/package.json');console.log('build: PASS');}
else throw new Error('mode must be typecheck, lint, or build');
