import test from 'node:test';
import assert from 'node:assert/strict';
import { OllamaProvider } from '../src/infra/ai.js';

test('Ollama opening uses the local chat API and validates JSON output',async()=>{
  let request;
  const provider=new OllamaProvider({model:'test-model',fetchImpl:async(url,options)=>{request={url,body:JSON.parse(options.body)};return{ok:true,json:async()=>({message:{content:JSON.stringify({intro:'まず話題を選びましょう。',topics:['連絡'],firstQuestion:'何から話しますか？'})}})};}});
  const opening=await provider.generateOpening({session:{title:'連絡',purpose:'すれ違い整理'},sharedItems:[]});
  assert.equal(request.url,'http://127.0.0.1:11434/api/chat');
  assert.equal(request.body.stream,false);
  assert.equal(request.body.format.properties.firstQuestion.type,'string');
  assert.equal(opening.topics[0],'連絡');
});

test('Ollama provider refuses non-local endpoints',()=>{
  assert.throws(()=>new OllamaProvider({baseUrl:'https://example.com'}),/local HTTP/);
});
