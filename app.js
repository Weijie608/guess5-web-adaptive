import {isValidGuess} from './engine.js';

const $=selector=>document.querySelector(selector);
const el={attemptCount:$('#attempt-count'),form:$('#guess-form'),input:$('#guess-input'),
  guessButton:$('#guess-button'),inputError:$('#input-error'),status:$('#status'),
  resultPanel:$('#result-panel'),resultKicker:$('#result-kicker'),revealedSecret:$('#revealed-secret'),
  resultCopy:$('#result-copy'),newGame:$('#new-game'),giveUp:$('#give-up'),
  historyList:$('#history-list'),historyCaption:$('#history-caption'),levelNote:$('#level-note'),
  retry:$('#retry-load'),difficulty:$('#difficulty-options')};
const levels=[...document.querySelectorAll('[data-lambda]')];
let lambda=0,attempts=0,phase='loading',busy=false,session=0,requestId=0,worker=null;
const pending=new Map();

function controls() {
  const playable=(phase==='ready'||phase==='playing')&&!busy;
  el.input.disabled=!playable;el.guessButton.disabled=!playable;el.giveUp.disabled=!playable;
  el.newGame.disabled=busy||phase==='loading'||phase==='error';
  levels.forEach(button=>{button.disabled=phase!=='ready'||busy;button.setAttribute('aria-pressed',String(Number(button.dataset.lambda)===lambda));});
  const selected=levels.find(b=>Number(b.dataset.lambda)===lambda);
  el.levelNote.textContent=phase==='ready'?'Choose before your first guess.':`This round: ${selected.dataset.label} (λ = ${lambda}). Locked.`;
  if(phase==='loading')el.levelNote.textContent='Loading the game…';
  if(phase==='error')el.levelNote.textContent='Reload to try again.';
  el.form.setAttribute('aria-busy',String(busy));
}
function clearError(){el.inputError.textContent='';el.input.removeAttribute('aria-invalid');}
function showError(message){
  el.inputError.textContent=message;el.input.setAttribute('aria-invalid','true');
  el.input.classList.remove('shake');void el.input.offsetWidth;el.input.classList.add('shake');
}
function rpc(type,data={}) {
  const id=++requestId;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      pending.delete(id);reject(new Error('The game took too long to respond. Reload and try again.'));
    },45000);
    pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,session,...data});
  });
}
function fatal(error) {
  phase='error';busy=false;worker?.terminate();
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();
  el.status.textContent='The game could not load or respond. Check your connection, then reload.';
  el.retry.hidden=false;controls();
}
function resetRound() {
  session++;attempts=0;phase='ready';busy=false;
  el.attemptCount.textContent='0';el.status.textContent='Choose your difficulty, then make your first guess.';
  el.historyCaption.textContent='No guesses yet';el.historyList.replaceChildren();
  el.resultPanel.hidden=true;delete el.resultPanel.dataset.state;
  el.revealedSecret.textContent='';el.resultCopy.textContent='';el.input.value='';clearError();controls();
}
async function startIfNeeded() {
  if(phase==='ready'){await rpc('start',{lambda});phase='playing';}
}
function history(guess,result) {
  const item=document.createElement('li');item.className='history-item';
  // guess has already passed the strict ASCII-digit validator.
  item.innerHTML=`<span class="history-number">${String(attempts).padStart(2,'0')}</span>
    <span class="history-code" aria-label="Guess ${guess}">${[...guess].map(d=>`<span class="history-digit">${d}</span>`).join('')}</span>
    <span class="feedback" aria-label="${result.r} r, ${result.s} s"><strong class="feedback-r">${result.r}<i>r</i></strong><strong class="feedback-s">${result.s}<i>s</i></strong></span>`;
  el.historyList.prepend(item);el.historyCaption.textContent=`${attempts} valid ${attempts===1?'guess':'guesses'}`;
}
function finish(secret,won) {
  phase='ended';el.resultPanel.hidden=false;el.revealedSecret.textContent=secret;
  el.resultPanel.dataset.state=won?'won':'revealed';
  if(won){el.status.textContent='Exact match — 5r, 5s.';el.resultKicker.textContent='Code cracked';el.resultCopy.textContent=`Solved in ${attempts} ${attempts===1?'attempt':'attempts'}.`;}
  else{el.status.textContent='Round ended. This answer fits every clue.';el.resultKicker.textContent='One possible answer';el.resultCopy.textContent='This code is consistent with all your guesses and replies.';}
}
el.form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!['ready','playing'].includes(phase))return;
  const guess=el.input.value;clearError();
  if(!isValidGuess(guess)){showError('Enter exactly five different ASCII digits.');return;}
  busy=true;controls();el.status.textContent='Choosing a reply…';
  try {
    await startIfNeeded();const result=await rpc('guess',{guess});
    attempts++;el.attemptCount.textContent=String(attempts);history(guess,result);el.input.value='';
    if(result.won)finish(guess,true);else el.status.textContent=`${result.r}r, ${result.s}s — keep going.`;
    busy=false;controls();if(!result.won)el.input.focus({preventScroll:true});
  }catch(error){fatal(error);}
});
el.input.addEventListener('input',clearError);
levels.forEach(button=>button.addEventListener('click',()=>{if(phase==='ready'&&!busy){lambda=Number(button.dataset.lambda);controls();}}));
el.newGame.addEventListener('click',()=>{if(!busy){resetRound();el.input.focus({preventScroll:true});}});
el.giveUp.addEventListener('click',async()=>{
  if(busy||!['ready','playing'].includes(phase))return;
  busy=true;controls();
  try{await startIfNeeded();const result=await rpc('reveal');finish(result.secret,false);busy=false;controls();}catch(error){fatal(error);}
});
el.retry.addEventListener('click',()=>location.reload());
async function initialize() {
  controls();
  try {
    if(location.protocol==='file:')throw new Error('Open through the included local server or an HTTPS website.');
    worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);
      if(data.session!==session)p.reject(new Error('A stale reply was discarded.'));
      else if(data.ok)p.resolve(data.result);else p.reject(new Error(data.error));
    };
    worker.onerror=()=>fatal(new Error('Background game could not start.'));
    await rpc('prepare');resetRound();
  }catch(error){fatal(error);}
}
if('serviceWorker' in navigator&&window.isSecureContext&&location.protocol!=='file:') {
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
initialize();
