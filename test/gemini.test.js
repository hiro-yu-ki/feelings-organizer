import test from 'node:test';
import assert from 'node:assert/strict';
import { createAIProvider, GeminiProvider } from '../src/infra/ai.js';

test('Gemini sends a structured server-side request for private analysis',async()=>{
  let request;
  const analysis=Object.fromEntries(['events','perceptions','interpretations','emotions','needs','values','requests','uncertainties','possibleTopics'].map((key)=>[key,key==='emotions'?['寂しかった']:[]]));
  const provider=new GeminiProvider({apiKey:'test-only',model:'gemini-3.5-flash',fetchImpl:async(url,options)=>{
    request={url,options,body:JSON.parse(options.body)};
    return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(analysis)}]}}]})};
  }});
  const result=await provider.analyzePrivateInput('返事がなくて寂しかった');
  assert.deepEqual(result.emotions,['寂しかった']);
  assert.equal(request.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
  assert.equal(request.options.headers['x-goog-api-key'],'test-only');
  assert.equal(request.body.generationConfig.responseMimeType,'application/json');
  assert.deepEqual(request.body.generationConfig.responseJsonSchema.required,Object.keys(analysis));
  assert.match(request.body.systemInstruction.parts[0].text,/中立な司会者/);
  assert.deepEqual(JSON.parse(request.body.contents[0].parts[0].text),{text:'返事がなくて寂しかった'});
});

test('project Gemini model overrides a stale global model',()=>{
  const provider=createAIProvider({AI_PROVIDER:'gemini',GEMINI_API_KEY:'test-only',GEMINI_MODEL:'gemini-2.5-flash',APP_GEMINI_MODEL:'gemini-3.5-flash'});
  assert.equal(provider.model,'gemini-3.5-flash');
});

test('Gemini opening stays anchored to the approved topic',async()=>{
  const provider=new GeminiProvider({apiKey:'test-only',fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({intro:'ゆっくり話しましょう。',topics:['予定の伝え方'],firstQuestion:'何から話しますか？'})}]}}]})})});
  const result=await provider.generateOpening({session:{title:'週末の予定',purpose:'すれ違い整理'},sharedItems:['伝え方を相談したい']});
  assert.match(result.intro,/週末の予定/);
  assert.match(result.firstQuestion,/週末の予定/);
});

test('Gemini failures do not masquerade as a successful model response',async()=>{
  const provider=new GeminiProvider({apiKey:'test-only',fetchImpl:async()=>({ok:false,status:429})});
  await assert.rejects(provider.analyzePrivateInput('確認'),/429/);
});

test('Gemini uses another Flash model when the first model is rate limited',async()=>{
  const models=[];
  const provider=new GeminiProvider({apiKey:'test-only',model:'gemini-3.6-flash',fetchImpl:async(url)=>{
    models.push(url);
    if(url.includes('gemini-3.6-flash'))return{ok:false,status:429};
    return{ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'{"message":"ok"}'}]}}]})};
  }});
  const response=await provider.call('test',{}, {type:'object',properties:{message:{type:'string'}}});
  assert.equal(response.message,'ok');
  assert.equal(provider.model,'gemini-3.5-flash');
  assert.ok(models.some((url)=>url.includes('gemini-3.5-flash')));
});

test('Gemini retries after both Flash models are temporarily unavailable',async()=>{
  let calls=0;
  const provider=new GeminiProvider({apiKey:'test-only',model:'gemini-3.6-flash',retryDelayMs:1,fetchImpl:async()=>{
    calls++;
    if(calls<=2)return{ok:false,status:503};
    return{ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'{"message":"recovered"}'}]}}]})};
  }});
  const response=await provider.call('test',{}, {type:'object',properties:{message:{type:'string'}}});
  assert.equal(response.message,'recovered');
  assert.equal(calls,3);
});

test('Gemini stops within its total time budget when upstream hangs',async()=>{
  const models=[];
  const provider=new GeminiProvider({apiKey:'test-only',model:'gemini-3.6-flash',timeBudgetMs:100,attemptTimeoutMs:55,fetchImpl:async(url,{signal})=>{
    models.push(url);
    return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  }});
  const started=Date.now();
  await assert.rejects(provider.call('test',{},{}),/unavailable/);
  assert.ok(Date.now()-started<180);
  assert.equal(models.length,2);
  assert.match(provider.lastFailure,/timeout/);
});

test('Gemini calls a receiver-sensitive fetch function without rebinding it',async()=>{
  const fetchImpl=async function(){assert.equal(this,undefined);return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"message":"ok"}'}]}}]})};};
  const provider=new GeminiProvider({apiKey:'test-only',fetchImpl});
  assert.deepEqual(await provider.call('test',{},{}),{message:'ok'});
});
