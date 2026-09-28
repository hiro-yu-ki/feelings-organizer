import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const collections = ['users','sessions','participants','privatePreparations','shareCandidates','turns','interventions','conversationStates','fairnessStates','summaries','historyApprovals','aiRequests'];
export function emptyDatabase() { return Object.fromEntries(collections.map((key) => [key, []])); }

export class JsonStore {
  constructor(file = process.env.DATA_FILE || './data/app.json') { this.file = resolve(file); this.data = emptyDatabase(); this.queue = Promise.resolve(); }
  async init() { await mkdir(dirname(this.file), { recursive:true }); try { const parsed=JSON.parse(await readFile(this.file,'utf8')); this.data={...emptyDatabase(),...parsed}; } catch (e) { if(e.code!=='ENOENT') throw e; await this.flush(); } return this; }
  snapshot() { return structuredClone(this.data); }
  async mutate(fn) { const operation=this.queue.then(async()=>{const draft=structuredClone(this.data);const result=await fn(draft);this.data=draft;await this.flush();return result;});this.queue=operation.catch(()=>{});return operation; }
  async flush() { const temp=`${this.file}.tmp`;await writeFile(temp,JSON.stringify(this.data,null,2),'utf8');await rename(temp,this.file); }
}

export class MemoryStore {
  constructor(seed={}) { this.data={...emptyDatabase(),...structuredClone(seed)}; }
  async init(){return this;} snapshot(){return structuredClone(this.data);}
  async mutate(fn){const draft=structuredClone(this.data);const result=await fn(draft);this.data=draft;return result;}
}
