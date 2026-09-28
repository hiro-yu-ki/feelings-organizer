import test from 'node:test';import assert from 'node:assert/strict';import { mkdtemp, rm } from 'node:fs/promises';import { tmpdir } from 'node:os';import { join } from 'node:path';
test('mobile-oriented main journey works over HTTP',async(t)=>{const dir=await mkdtemp(join(tmpdir(),'kimochi-e2e-'));process.env.NODE_ENV='test';process.env.DATA_FILE=join(dir,'data.json');process.env.AI_PROVIDER='mock';const{server}=await import(`../src/server.js?e2e=${Date.now()}`);await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise((resolve)=>server.close(resolve));await rm(dir,{recursive:true,force:true});});const base=`http://127.0.0.1:${server.address().port}`;
  async function client(){let cookie='',csrf='';return async(path,options={})=>{const r=await fetch(`${base}/api${path}`,{...options,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...options.headers}});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];const data=await r.json();if(data.csrfToken)csrf=data.csrfToken;assert.ok(r.ok,`${path}: ${JSON.stringify(data)}`);return data;};}
  const a=await client(),b=await client();await a('/auth/register',{method:'POST',body:JSON.stringify({email:'e2ea@example.test',password:'password-aaa',displayName:'Aさん'})});const session=await a('/sessions',{method:'POST',body:JSON.stringify({title:'週末の予定',purpose:'意思決定'})});await b('/auth/register',{method:'POST',body:JSON.stringify({email:'e2eb@example.test',password:'password-bbb',displayName:'Bさん'})});await b('/sessions/join',{method:'POST',body:JSON.stringify({inviteCode:session.inviteCode})});await a(`/sessions/${session.id}/prepare`,{method:'POST',body:JSON.stringify({rawText:'予定が決まらず不安だった。相談して決めたい。'})});const view=await a(`/sessions/${session.id}`),candidate=view.shares.find((x)=>x.approvalStatus==='pending');await a(`/sessions/${session.id}/shares/${candidate.id}`,{method:'PUT',body:JSON.stringify({action:'share'})});await a(`/sessions/${session.id}/turns`,{method:'POST',body:JSON.stringify({text:'一緒に予定を決めたいです'})});await b(`/sessions/${session.id}/turns`,{method:'POST',body:JSON.stringify({text:'土曜日なら時間があります'})});const summary=await a(`/sessions/${session.id}/complete`,{method:'POST',body:'{}'});assert.ok(summary.futureTopics.length);const bView=await b(`/sessions/${session.id}`);assert.equal(bView.preparations.length,0);assert.equal(Object.hasOwn(bView.shares[0],'generatedContent'),false);
  const page=await fetch(base,{headers:{'user-agent':'mobile-e2e'}});assert.match(await page.text(),/viewport/);
  const invitePage=await fetch(`${base}/invite/${session.inviteCode}`);assert.equal(invitePage.status,200);assert.match(await invitePage.text(),/viewport/);

  // A login in another browser tab rotates the cookie while the first tab can
  // still hold its previous CSRF token in memory. The client can safely recover
  // by reading /me with the current cookie and retrying once.
  const credentials={email:'csrf@example.test',password:'password-csrf',displayName:'CSRF test'};
  const firstAuth=await fetch(`${base}/api/auth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(credentials)});
  const firstData=await firstAuth.json();
  const staleCsrf=firstData.csrfToken;
  const secondAuth=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:credentials.email,password:credentials.password})});
  const currentCookie=secondAuth.headers.get('set-cookie').split(';')[0];
  const rejected=await fetch(`${base}/api/sessions`,{method:'POST',headers:{'content-type':'application/json',cookie:currentCookie,'x-csrf-token':staleCsrf},body:JSON.stringify({title:'stale token',purpose:'その他'})});
  assert.equal(rejected.status,403);
  assert.equal((await rejected.json()).error,'CSRF token is invalid');
  const me=await fetch(`${base}/api/me`,{headers:{cookie:currentCookie}});
  const currentCsrf=(await me.json()).csrfToken;
  const recovered=await fetch(`${base}/api/sessions`,{method:'POST',headers:{'content-type':'application/json',cookie:currentCookie,'x-csrf-token':currentCsrf},body:JSON.stringify({title:'recovered token',purpose:'その他'})});
  assert.equal(recovered.status,201);
});
