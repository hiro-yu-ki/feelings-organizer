const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

export function createAiProgress(doc){
  const overlay=doc.createElement('div');
  overlay.className='ai-progress-screen hidden';
  overlay.innerHTML=`<div class="ai-progress-card" role="status" aria-live="polite">
    <div class="ai-progress-portrait" aria-hidden="true">
      <img src="/assets/moderator.png" alt="" width="150" height="150">
      <span class="ai-thought-dots"><i></i><i></i><i></i></span>
    </div>
    <p class="eyebrow">AI司会者 よはく</p>
    <h2 class="ai-progress-title"></h2>
    <p class="ai-progress-detail">入力を受け付けました。少しお待ちください。</p>
    <div class="ai-progress-track" role="progressbar" aria-label="処理の進み具合の目安" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
    <strong class="ai-progress-value" aria-hidden="true">0%</strong>
    <p class="ai-progress-note">進み具合は待ち時間の目安です。処理が終わると100%になります。</p>
    <button type="button" class="secondary ai-progress-close hidden">閉じる</button>
  </div>`;
  doc.body.append(overlay);
  const title=overlay.querySelector('.ai-progress-title');
  const detail=overlay.querySelector('.ai-progress-detail');
  const track=overlay.querySelector('.ai-progress-track');
  const fill=track.querySelector('span');
  const value=overlay.querySelector('.ai-progress-value');
  const close=overlay.querySelector('.ai-progress-close');
  let active=false;
  const update=(percent)=>{const rounded=Math.max(0,Math.min(100,Math.round(percent)));fill.style.width=`${rounded}%`;value.textContent=`${rounded}%`;track.setAttribute('aria-valuenow',String(rounded));};
  const hide=()=>{overlay.classList.add('hidden');overlay.classList.remove('is-complete','is-error');close.classList.add('hidden');};
  close.onclick=hide;
  return async function runAiTask({button,label,action,delay=0}){
    if(active)return;
    active=true;
    const previous=button?.textContent;
    if(button){button.disabled=true;button.textContent='処理中…';}
    title.textContent=label;
    detail.textContent='入力を受け付けました。よはくが整理しています。';
    update(0);
    let shown=false,timer;
    const started=Date.now();
    const show=()=>{
      if(shown)return;
      shown=true;
      overlay.classList.remove('hidden');
      update(5);
      timer=setInterval(()=>{
        const elapsed=Date.now()-started;
        update(Math.min(95,5+90*(1-Math.exp(-elapsed/24000))));
      },500);
    };
    const delayTimer=delay>0?setTimeout(show,delay):(show(),null);
    try{
      const result=await action();
      clearTimeout(delayTimer);
      if(shown){clearInterval(timer);update(100);overlay.classList.add('is-complete');detail.textContent='処理が完了しました。';await wait(650);hide();}
      return result;
    }catch(error){
      clearTimeout(delayTimer);
      show();
      clearInterval(timer);
      overlay.classList.add('is-error');
      title.textContent='処理を完了できませんでした';
      detail.textContent=error?.message||'入力内容はそのままです。閉じてからもう一度お試しください。';
      close.classList.remove('hidden');
      throw error;
    }finally{
      active=false;
      if(button){button.disabled=false;button.textContent=previous;}
    }
  };
}
