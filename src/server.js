import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JsonStore } from './infra/store.js';
import { createAIProvider } from './infra/ai.js';
import { AppService } from './service.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))),publicDir=join(root,'public');
try { const config=await readFile(join(root,'.env'),'utf8'); for(const line of config.split(/\r?\n/)){const match=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(match&&process.env[match[1]]===undefined)process.env[match[1]]=match[2].replace(/^(["'])(.*)\1$/,'$2');} } catch(error){if(error.code!=='ENOENT')throw error;}
const secret=process.env.SESSION_SECRET||randomBytes(32).toString('hex');
const sessions=new Map(),streams=new Map(),rates=new Map();
const store=await new JsonStore().init();
const broadcast=(room,event,data)=>{for(const res of streams.get(room)||[]){res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}};
const service=new AppService(store,createAIProvider(),{emit:broadcast});

function sign(value){return`${value}.${createHmac('sha256',secret).update(value).digest('base64url')}`;}
function unsign(value){if(!value)return null;const i=value.lastIndexOf('.');if(i<1)return null;const raw=value.slice(0,i),expected=sign(raw);try{return timingSafeEqual(Buffer.from(value),Buffer.from(expected))?raw:null;}catch{return null;}}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map((x)=>x.trim().split('=').map(decodeURIComponent)).filter((x)=>x.length===2));}
function auth(req){const sid=unsign(cookies(req).sid),session=sessions.get(sid);if(!session)return null;return session;}
function send(res,status,body,headers={}){const data=body==null?'':JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(data),'x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",...headers});res.end(data);}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1_000_000)throw Object.assign(new Error('payload too large'),{status:413});}return raw?JSON.parse(raw):{};}
function rateLimit(req,key='api',max=120){const ip=req.socket.remoteAddress||'local',slot=`${ip}:${key}`,time=Date.now(),old=rates.get(slot)||[];const fresh=old.filter((x)=>time-x<60_000);if(fresh.length>=max)throw Object.assign(new Error('リクエストが多すぎます'),{status:429});fresh.push(time);rates.set(slot,fresh);}
function requireAuth(req){const session=auth(req);if(!session)throw Object.assign(new Error('認証が必要です'),{status:401});return session;}
function csrf(req,session){if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==session.csrf)throw Object.assign(new Error('CSRF token is invalid'),{status:403});}
function route(path,pattern){const m=path.match(pattern);return m?m.slice(1).map(decodeURIComponent):null;}

async function api(req,res,url){rateLimit(req);const path=url.pathname;let p;
  if(req.method==='POST'&&path==='/api/auth/register'){rateLimit(req,'auth',10);const user=await service.register(await body(req));return loginResponse(res,user);}
  if(req.method==='POST'&&path==='/api/auth/login'){rateLimit(req,'auth',10);const user=service.login(await body(req));return loginResponse(res,user);}
  if(req.method==='POST'&&path==='/api/auth/logout'){const s=requireAuth(req);csrf(req,s);sessions.delete(s.id);return send(res,200,{ok:true},{'set-cookie':'sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});}
  const session=requireAuth(req);csrf(req,session);const uid=session.userId;
  if(req.method==='GET'&&path==='/api/me')return send(res,200,{user:service.user(uid),csrfToken:session.csrf,aiProvider:service.ai.name,aiModel:service.ai.model});
  if(req.method==='GET'&&path==='/api/sessions')return send(res,200,service.listSessions(uid));
  if(req.method==='POST'&&path==='/api/sessions')return send(res,201,await service.createSession(uid,await body(req)));
  if(req.method==='POST'&&path==='/api/sessions/join')return send(res,200,await service.joinSession(uid,(await body(req)).inviteCode));
  if((p=route(path,/^\/api\/sessions\/([^/]+)$/))){if(req.method==='GET')return send(res,200,service.getSession(uid,p[0]));if(req.method==='DELETE')return send(res,200,await service.deleteSession(uid,p[0]));}
  if((p=route(path,/^\/api\/sessions\/([^/]+)\/events$/))&&req.method==='GET'){service.getSession(uid,p[0]);res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});res.write('event: ready\ndata: {}\n\n');const set=streams.get(p[0])||new Set();set.add(res);streams.set(p[0],set);const ping=setInterval(()=>res.write(': ping\n\n'),25000);req.on('close',()=>{clearInterval(ping);set.delete(res);});return;}
  if((p=route(path,/^\/api\/sessions\/([^/]+)\/prepare$/))&&req.method==='POST')return send(res,200,await service.prepare(uid,p[0],await body(req)));
  if((p=route(path,/^\/api\/sessions\/([^/]+)\/opening$/))&&req.method==='POST')return send(res,200,await service.createOpening(uid,p[0]));
  if((p=route(path,/^\/api\/sessions\/([^/]+)\/analysis$/))&&req.method==='PUT')return send(res,200,await service.confirmAnalysis(uid,p[0],(await body(req)).analysis));
  if((p=route(path,/^\/api\/sessions\/([^/]+)\/shares\/([^/]+)$/))&&req.method==='PUT')return send(res,200,await service.approveShare(uid,p[0],p[1],await body(req)));
  if((p=route(path,/^\/api\/sessions\/([^/]+)\/turns$/))&&req.method==='POST')return send(res,201,await service.addTurn(uid,p[0],await body(req)));
  if((p=route(path,/^\/api\/sessions\/([^/]+)\/turns\/([^/]+)$/))&&req.method==='PUT')return send(res,200,await service.editTurn(uid,p[0],p[1],(await body(req)).text));
  if((p=route(path,/^\/api\/sessions\/([^/]+)\/state$/))&&req.method==='PUT')return send(res,200,await service.setState(uid,p[0],(await body(req)).event));
  if((p=route(path,/^\/api\/sessions\/([^/]+)\/complete$/))&&req.method==='POST')return send(res,200,await service.complete(uid,p[0]));
  if((p=route(path,/^\/api\/sessions\/([^/]+)\/history$/))){if(req.method==='GET')return send(res,200,service.historicalContext(uid,p[0]));if(req.method==='POST')return send(res,201,await service.proposeHistory(uid,p[0],await body(req)));}
  if((p=route(path,/^\/api\/sessions\/([^/]+)\/history\/([^/]+)$/))&&req.method==='PUT')return send(res,200,await service.approveHistory(uid,p[0],p[1],Boolean((await body(req)).approved)));
  send(res,404,{error:'not_found'});
}
function loginResponse(res,user){const sid=randomBytes(24).toString('base64url'),csrfToken=randomBytes(24).toString('base64url');sessions.set(sid,{id:sid,userId:user.id,csrf:csrfToken,createdAt:Date.now()});send(res,200,{user,csrfToken},{'set-cookie':`sid=${encodeURIComponent(sign(sid))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${process.env.NODE_ENV==='production'?'; Secure':''}`});}
async function staticFile(req,res,url){let pathname=url.pathname==='/'||/^\/invite\/[A-Za-z0-9_-]{1,20}\/?$/.test(url.pathname)?'/index.html':url.pathname;if(pathname.includes('..'))return send(res,400,{error:'bad_path'});let file=normalize(join(publicDir,pathname));if(!file.startsWith(publicDir))return send(res,403,{error:'forbidden'});try{const info=await stat(file);if(info.isDirectory())file=join(file,'index.html');const data=await readFile(file);const type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'}[extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':type,'cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(data);}catch{send(res,404,{error:'not_found'});}}
export const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/'))await api(req,res,url);else await staticFile(req,res,url);}catch(error){if(error instanceof SyntaxError)return send(res,400,{error:'invalid_json'});send(res,error.status||500,{error:error.status?error.message:'internal_error'});}});
if(process.env.NODE_ENV!=='test'){const port=Number(process.env.PORT)||3000;server.listen(port,()=>console.log(`Kimochi Moderator: http://localhost:${port} (${service.ai.name})`));}
