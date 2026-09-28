import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GeminiProvider } from '../src/infra/ai.js';

async function projectSettings(){
  let contents='';
  try{contents=await readFile(resolve('.env'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  return Object.fromEntries(contents.split(/\r?\n/).map((line)=>line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((match)=>[match[1],match[2].replace(/^(["'])(.*)\1$/,'$2')]));
}

const local=await projectSettings();
const apiKey=process.env.GEMINI_API_KEY||local.GEMINI_API_KEY;
const model=local.APP_GEMINI_MODEL||process.env.APP_GEMINI_MODEL||local.GEMINI_MODEL||process.env.GEMINI_MODEL||'gemini-3.5-flash';
if(!apiKey){console.error('Gemini API キーが見つかりません。');process.exitCode=1;}
else{
  try{
    const provider=new GeminiProvider({apiKey,model});
    const opening=await provider.generateOpening({session:{title:'週末の予定',purpose:'すれ違い整理'},sharedItems:[]});
    if(!opening.intro||!opening.firstQuestion)throw new Error('生成結果が空です');
    console.log(`Gemini API 接続成功: ${model}（架空の話題で確認）`);
    console.log('料金プランは API キーでは判定できません。Google AI Studio の Plan 表示を確認してください。');
  }catch(error){console.error(`Gemini API 接続失敗: ${String(error.message).slice(0,160)}`);process.exitCode=1;}
}
