'use strict';
const $=s=>document.querySelector(s),KEY='olympus-quiz-v1',QUESTION_MAP=new Map(QUESTIONS.map(q=>[q.id,q]));
const fresh=()=>({xp:0,mastered:[],mistakes:[],best:{},mixedBest:0,muted:false,run:null});
let data=fresh(),view='home',lastResult=null,audioCtx=null;
function shuffled(items){const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
function unlockedCount(){let n=1;for(let i=0;i<5;i++){if((data.best[i]?.correct||0)<6)break;n++}return n}
function collectedCards(){return new Set(data.mastered.flatMap(id=>QUESTION_MAP.get(id).tags))}
function validRun(raw){
 if(!raw||!['chapter','review','mixed'].includes(raw.kind)||!Array.isArray(raw.ids)||raw.ids.length<1||raw.ids.length>12||new Set(raw.ids).size!==raw.ids.length||raw.ids.some(id=>!QUESTION_MAP.has(id)))return null;
 if(raw.kind==='chapter'&&(!Number.isInteger(raw.chapter)||raw.chapter<0||raw.chapter>=unlockedCount()||raw.ids.length!==10||raw.ids.some(id=>QUESTION_MAP.get(id).chapter!==raw.chapter)))return null;
 if(raw.kind==='mixed'&&Object.keys(data.best).filter(k=>data.best[k].correct>=6).length<6)return null;
 if(!Number.isInteger(raw.cursor)||raw.cursor<0||raw.cursor>=raw.ids.length||!Array.isArray(raw.answers)||![raw.cursor,raw.cursor+1].includes(raw.answers.length))return null;
 if(!Array.isArray(raw.orders)||raw.orders.length!==raw.ids.length||raw.orders.some(order=>!Array.isArray(order)||order.length!==4||[...order].sort().join(',')!=='0,1,2,3'))return null;
 if(!Array.isArray(raw.hints)||raw.hints.length!==raw.ids.length||raw.hints.some(h=>!Array.isArray(h)||![0,2].includes(h.length)||new Set(h).size!==h.length||h.some(n=>!Number.isInteger(n)||n<1||n>3))||raw.hints.filter(h=>h.length>0).length>2)return null;
 if(raw.answers.some((a,i)=>!a||!Number.isInteger(a.choice)||a.choice<0||a.choice>3||raw.hints[i].includes(a.choice)))return null;
 return {kind:raw.kind,chapter:raw.kind==='chapter'?raw.chapter:-1,ids:[...raw.ids],cursor:raw.cursor,answers:raw.answers.map(a=>({choice:a.choice})),orders:raw.orders.map(o=>[...o]),hints:raw.hints.map(h=>[...h])};
}
try{
 const raw=JSON.parse(localStorage.getItem(KEY));
 if(raw&&Number.isSafeInteger(raw.xp)&&raw.xp>=0&&Array.isArray(raw.mastered)&&Array.isArray(raw.mistakes)){
  data.xp=raw.xp;data.mastered=[...new Set(raw.mastered.filter(id=>QUESTION_MAP.has(id)))];data.mistakes=[...new Set(raw.mistakes.filter(id=>QUESTION_MAP.has(id)))];data.muted=raw.muted===true;
  for(let i=0;i<6;i++){const best=raw.best?.[i];if(best&&Number.isInteger(best.correct)&&best.correct>=0&&best.correct<=10&&Number.isSafeInteger(best.score)&&best.score>=0)data.best[i]={correct:best.correct,score:best.score}}
  data.mixedBest=Number.isSafeInteger(raw.mixedBest)&&raw.mixedBest>=0?raw.mixedBest:0;data.run=validRun(raw.run);
 }
}catch{}
function save(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch{}}
function notice(message){$('#notice').textContent=message}
function runName(run=data.run){return run.kind==='chapter'?CHAPTERS[run.chapter].name:run.kind==='review'?'오답 다시 도전':'신화왕 종합 도전'}
function totals(run=data.run){let correct=0,score=0,combo=0,maxCombo=0;run.answers.forEach((a,i)=>{if(a.choice===0){correct++;combo++;score+=run.hints[i].length?6:10+Math.min(combo-1,4)*2;maxCombo=Math.max(maxCombo,combo)}else combo=0});return {correct,score,combo,maxCombo}}
function rating(correct){return correct>=9?3:correct>=8?2:correct>=6?1:0}
function renderStats(){
 const cards=collectedCards(),count=data.mastered.length,rank=count>=72?'신화 박사':count>=54?'올림포스 현자':count>=30?'신화 길잡이':count>=12?'신화 탐험가':'신화 입문자';
 $('#level').textContent='Lv.'+(1+Math.floor(data.xp/100));$('#xp').textContent=`경험치 ${data.xp%100}/100`;
 $('#temples').textContent=Object.values(data.best).filter(b=>b.correct>=6).length+' / 6';$('#collection').textContent=cards.size+' / 24';$('#titleRank').textContent=rank;$('#wrongCount').textContent=data.mistakes.length;
 $('#sound').textContent=data.muted?'🔇':'🔊';$('#sound').setAttribute('aria-label',data.muted?'효과음 켜기':'효과음 끄기');$('#sound').setAttribute('aria-pressed',String(data.muted));
}
function show(name,scroll=true){
 view=name;for(const key of ['home','quiz','book','wrong','result'])$('#'+key+'View').hidden=key!==name;
 for(const key of ['home','book','wrong'])$('#'+key+'Tab').setAttribute('aria-pressed',String(key===name||key==='home'&&['quiz','result'].includes(name)));
 renderStats();if(name==='home')renderHome();if(name==='quiz')renderQuiz();if(name==='book')renderBook();if(name==='wrong')renderWrong();
 if(scroll){if(name==='quiz'){document.querySelector('#quizView').scrollIntoView({behavior:'instant',block:'start'});window.scrollBy(0,-65)}else window.scrollTo({top:0,behavior:'instant'})}
}
function renderHome(){
 const open=unlockedCount(),busy=!!data.run;$('#resumeBox').hidden=!busy;
 if(busy)$('#resumeText').textContent=`${runName()} · ${data.run.answers.length}/${data.run.ids.length}문제 답했어요. 해설과 힌트도 저장되어 있어요.`;
 $('#chapters').innerHTML=CHAPTERS.map((ch,i)=>{const locked=i>=open,best=data.best[i],stars=rating(best?.correct||0);return `<article class="chapter ${locked?'locked':''}" style="--chapter:${ch.color}"><span class="chapter-index">TEMPLE ${i+1}</span><div class="chapter-icon">${locked?'🔒':ch.icon}</div><h3>${ch.name}</h3><p>${ch.subtitle}</p><div class="chapter-stars">${'★'.repeat(stars)+'☆'.repeat(3-stars)}</div><p>${best?'최고 정답 '+best.correct+'/10 · 최고 '+best.score+'점':'10문제 중 6개 이상 정답이면 통과'}</p><button data-chapter="${i}" ${locked||busy?'disabled':''} class="${!locked&&!busy?'open':''}">${locked?'앞 신전을 먼저 통과해요':busy?'풀이 중인 탐험을 이어가요':best?.correct>=6?'다시 도전하기':'탐험 시작 →'}</button></article>`}).join('');
 for(const b of document.querySelectorAll('[data-chapter]'))b.addEventListener('click',()=>startRun('chapter',Number(b.dataset.chapter)));
 const allClear=Object.values(data.best).filter(b=>b.correct>=6).length===6;$('#mixed').disabled=!allClear||busy;$('#mixed').textContent=allClear?(busy?'풀이 중인 탐험이 있어요':'종합 12문제 도전!'):'신전부터 탐험해요';$('#mixedDescription').textContent=allClear?`여섯 신전의 문제를 섞었어요. ${data.mixedBest?'최고 기록 '+data.mixedBest+'점!':'신화왕의 실력을 보여 주세요!'}`:'여섯 신전을 통과하면 열려요. 모든 주제에서 12문제!';
}
function pickQuestions(pool,count){
 // Unseen questions appear before familiar ones; errors get another chance, too.
 const unseen=shuffled(pool.filter(q=>!data.mastered.includes(q.id))),familiar=shuffled(pool.filter(q=>data.mastered.includes(q.id)));return [...unseen,...familiar].slice(0,count).map(q=>q.id);
}
function startRun(kind,chapter=-1){
 if(data.run){show('quiz');return}
 let ids;if(kind==='chapter'){if(!Number.isInteger(chapter)||chapter<0||chapter>=unlockedCount())return;ids=pickQuestions(QUESTIONS.filter(q=>q.chapter===chapter),10)}
 else if(kind==='review'){if(!data.mistakes.length)return;ids=shuffled(data.mistakes).slice(0,10)}
 else if(kind==='mixed'){if(Object.values(data.best).filter(b=>b.correct>=6).length!==6)return;ids=shuffled(CHAPTERS.flatMap((_,i)=>shuffled(QUESTIONS.filter(q=>q.chapter===i)).slice(0,2).map(q=>q.id)))}else return;
 data.run={kind,chapter,ids,cursor:0,answers:[],orders:ids.map(()=>shuffled([0,1,2,3])),hints:ids.map(()=>[])};save();show('quiz');notice('정답을 고르면 해설을 읽어요. 힌트는 문제 묶음마다 두 번 사용할 수 있어요.');
}
function renderQuiz(){
 if(!data.run){show('home');return}const run=data.run,q=QUESTION_MAP.get(run.ids[run.cursor]),answer=run.answers[run.cursor],sum=totals(run),hintsLeft=2-run.hints.filter(h=>h.length).length;
 $('#quizCategory').textContent=CHAPTERS[q.chapter].icon+' '+CHAPTERS[q.chapter].subtitle;$('#quizTitle').textContent=runName();$('#questionProgress').textContent=`${run.cursor+1} / ${run.ids.length} 문제`;$('#combo').textContent=sum.combo>1?'🔥 '+sum.combo+'연속 정답':'차근차근 도전!';$('#points').textContent=sum.score+'점';$('#progressBar').style.width=(run.answers.length/run.ids.length*100)+'%';$('#questionNumber').textContent='QUESTION '+String(run.cursor+1).padStart(2,'0');$('#question').textContent=q.question;
 $('#choices').replaceChildren();run.orders[run.cursor].forEach((originalIndex,displayIndex)=>{
  const b=document.createElement('button');b.className='answer';b.dataset.option=originalIndex;b.dataset.number=displayIndex+1;
  const number=document.createElement('span');number.className='number';number.textContent=displayIndex+1;const label=document.createElement('span');label.textContent=q.options[originalIndex];b.append(number,label);
  const eliminated=run.hints[run.cursor].includes(originalIndex);b.disabled=!!answer||eliminated;if(eliminated)b.classList.add('eliminated');if(answer&&originalIndex===0)b.classList.add('correct');if(answer&&originalIndex===answer.choice&&answer.choice!==0)b.classList.add('wrong');b.addEventListener('click',()=>answerQuestion(originalIndex));$('#choices').append(b);
 });
 const used=run.hints[run.cursor].length>0;$('#hint').disabled=!!answer||hintsLeft===0||used;$('#hint').textContent=used?'💡 이 문제에 50:50 힌트를 썼어요':`💡 50:50 힌트 (${hintsLeft}회) · 정답 6점`;
 $('#explanation').hidden=!answer;$('#next').hidden=!answer;$('#next').textContent=run.cursor===run.ids.length-1?'탐험 결과 보기 →':'해설 읽었어요 · 다음 문제 →';
 if(answer){const right=answer.choice===0;$('#explanation').className='explanation'+(right?'':' wrong');$('#answerStatus').textContent=right?(used?'정답! 힌트와 함께 배웠어요 · +6점':`정답! ${sum.combo>1?sum.combo+'연속 · ':''}+${10+Math.min(sum.combo-1,4)*2}점`):'아쉽지만 괜찮아요. 이 이야기를 기억해 봐요!';$('#answerText').textContent='정답: '+q.options[0];$('#answerExplanation').textContent=q.explanation}
}
function answerQuestion(originalIndex){
 const run=data.run;if(view!=='quiz'||!run||run.answers[run.cursor]||!Number.isInteger(originalIndex)||originalIndex<0||originalIndex>3||run.hints[run.cursor].includes(originalIndex))return;
 const id=run.ids[run.cursor],q=QUESTION_MAP.get(id),right=originalIndex===0;run.answers.push({choice:originalIndex});
 if(right){const first=!data.mastered.includes(id);if(first)data.mastered.push(id);data.xp+=first?10:2;data.mistakes=data.mistakes.filter(x=>x!==id);notice(first?(q.tags.length?'새 이야기를 익혔어요! 관련 신화 도감도 확인해 보세요.':'새 이야기를 익혔어요! 지식 경험치 +10'):'다시 맞혔어요! 기억이 더 튼튼해졌어요. 경험치 +2');}
 else{if(!data.mistakes.includes(id))data.mistakes.push(id);data.xp++;notice('오답 노트에 모았어요. 해설을 읽고 다시 도전하면 노트에서 사라져요.')}
 save();renderStats();renderQuiz();tone(right?'correct':'wrong');$('#explanation').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
}
function useHint(){const run=data.run;if(view!=='quiz'||!run||run.answers[run.cursor]||run.hints[run.cursor].length||run.hints.filter(h=>h.length).length>=2)return;run.hints[run.cursor]=shuffled([1,2,3]).slice(0,2);save();renderQuiz();notice('틀린 보기 두 개를 지웠어요. 남은 단서를 비교해 보세요! 힌트 정답은 6점이에요.')}
function nextQuestion(){const run=data.run;if(!run||!run.answers[run.cursor])return;if(run.cursor===run.ids.length-1){finishRun();return}run.cursor++;save();renderQuiz();$('#quizView').scrollIntoView({behavior:'instant',block:'start'});window.scrollBy(0,-65)}
function finishRun(early=false){
 if(!data.run)return;const run=data.run;if(!early&&run.answers.length!==run.ids.length)return;const sum=totals(run),passed=!early&&sum.correct>=6;let newlyUnlocked=false;
 if(!early&&run.kind==='chapter'){const openBefore=unlockedCount(),old=data.best[run.chapter]||{correct:0,score:0};data.best[run.chapter]={correct:Math.max(old.correct,sum.correct),score:Math.max(old.score,sum.score)};newlyUnlocked=unlockedCount()>openBefore}
 if(!early&&run.kind==='mixed')data.mixedBest=Math.max(data.mixedBest,sum.score);
 lastResult={...sum,total:run.ids.length,answered:run.answers.length,kind:run.kind,chapter:run.chapter,passed,early,newlyUnlocked};data.run=null;save();renderResult();show('result');tone(sum.correct>=6?'win':'correct');
}
function renderResult(){
 const r=lastResult,allClear=Object.values(data.best).filter(b=>b.correct>=6).length===6,chapter=r.kind==='chapter';$('#resultIcon').textContent=r.early?'📖':chapter&&r.passed?'🏛️':r.kind==='mixed'&&r.correct>=10?'🏆':'🦉';
 $('#resultTitle').textContent=r.early?'잠시 쉬어 가는 탐험':chapter?(r.passed?CHAPTERS[r.chapter].name+' 정복!':'이야기를 더 알아볼까요?'):r.kind==='review'?'오답 다시 도전 완료!':r.correct>=10?'올림포스의 신화왕!':'종합 탐험 완료!';
 $('#resultMessage').textContent=r.early?`지금까지 푼 ${r.answered}문제의 배움과 도감은 저장했어요. 신전은 열 문제를 모두 풀어 통과해요.`:chapter?(r.newlyUnlocked?'다음 신전이 열렸어요! 새로운 이야기로 떠나 볼까요?':r.passed?(allClear?'여섯 신전 정복! 이제 신화왕 종합 도전에 도전할 수 있어요.':'이미 통과한 신전의 기록을 더 단단하게 만들었어요.'): '10문제 중 6개 이상 맞히면 통과해요. 해설과 오답 노트로 준비하면 다음에는 더 잘할 수 있어요.'):r.kind==='review'?'다시 맞힌 문제는 오답 노트에서 지웠어요. 배운 이야기가 차곡차곡 쌓여요.':'서로 다른 이야기의 단서를 연결했어요. 도감도 함께 읽어 보세요.';
 const stars=r.early?0:rating(r.correct/r.total*10);$('#resultStars').textContent='★'.repeat(stars)+'☆'.repeat(3-stars);$('#resultCorrect').textContent=`${r.correct}/${r.total}`;$('#resultPoints').textContent=r.score;$('#resultCombo').textContent=r.maxCombo;
 const button=$('#resultPrimary');button.textContent=chapter&&r.passed&&r.chapter<5?'다음 신전 탐험 →':chapter&&r.passed&&allClear?'신화왕 종합 도전 →':data.mistakes.length?'오답 노트에서 복습하기':'도감 보러 가기';
 button.onclick=()=>{if(chapter&&r.passed&&r.chapter<5)startRun('chapter',r.chapter+1);else if(chapter&&r.passed&&allClear)startRun('mixed');else show(data.mistakes.length?'wrong':'book')};
 $('#resultTip').textContent=`익힌 이야기 ${data.mastered.length}/72 · 모은 도감 ${collectedCards().size}/24 ${r.kind==='chapter'?' · 별: 6~7개 정답 ★ / 8개 ★★ / 9~10개 ★★★':' · 별은 정답 비율 60% / 80% / 90%에서 늘어나요.'}`;
}
function renderBook(){
 const owned=collectedCards();$('#bookProgress').innerHTML=`<div style="width:${owned.size/CARDS.length*100}%"></div>`;$('#bookProgress').setAttribute('aria-label',`도감 ${owned.size}/${CARDS.length} 수집`);
 $('#bookCards').innerHTML=CARDS.map(c=>{const open=owned.has(c.id);return `<article class="book-card ${open?'':'sealed'}"><div class="book-symbol">${open?c.icon:'🔒'}</div><h3>${c.name}</h3><p class="roman">${open?(c.roman?'로마 이름 · '+c.roman:'영웅과 신비한 존재'): '아직 봉인된 카드'}</p><p>${open?c.fact:'관련 문제를 맞히면 이야기와 그림이 열려요.'}</p></article>`}).join('');
}
function renderWrong(){
 $('#review').disabled=!data.mistakes.length||!!data.run;$('#review').textContent=data.run?'풀이 중인 탐험부터 이어가요':data.mistakes.length?'오답 '+Math.min(10,data.mistakes.length)+'문제 다시 풀기 →':'아직 오답이 없어요';$('#reviewDescription').textContent=data.mistakes.length?`총 ${data.mistakes.length}개 이야기를 다시 도전할 수 있어요. 한 번에 최대 10문제씩 풀어요.`:'틀린 문제는 여기에 모여요. 걱정 없이 탐험을 시작해 보세요!';
 $('#wrongList').replaceChildren();if(!data.mistakes.length){const p=document.createElement('p');p.className='empty';p.textContent='깨끗한 오답 노트! 🦉 신전에서 새로운 이야기를 찾아봐요.';$('#wrongList').append(p);return}
 for(const id of [...data.mistakes].reverse()){const q=QUESTION_MAP.get(id),d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('p');s.textContent=q.question;p.textContent='정답: '+q.options[0]+' · '+q.explanation;d.append(s,p);$('#wrongList').append(d)}
}
function tone(kind){if(data.muted)return;try{audioCtx??=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});const notes=kind==='win'?[523,659,784,1047]:kind==='correct'?[659,880]:[330,294];notes.forEach((hz,i)=>{const at=audioCtx.currentTime+i*.08,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='triangle';o.frequency.value=hz;g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.05,at+.012);g.gain.exponentialRampToValueAtTime(.0001,at+.14);o.connect(g);g.connect(audioCtx.destination);o.start(at);o.stop(at+.15)})}catch{}}
for(const key of ['home','book','wrong'])$('#'+key+'Tab').addEventListener('click',()=>show(key));
$('#resume').addEventListener('click',()=>show('quiz'));$('#endRun').addEventListener('click',()=>finishRun(true));$('#rest').addEventListener('click',()=>show('home'));$('#mixed').addEventListener('click',()=>startRun('mixed'));$('#review').addEventListener('click',()=>startRun('review'));$('#hint').addEventListener('click',useHint);$('#next').addEventListener('click',nextQuestion);$('#resultHome').addEventListener('click',()=>show('home'));
$('#sound').addEventListener('click',()=>{data.muted=!data.muted;save();renderStats();if(!data.muted)tone('correct')});
document.addEventListener('keydown',e=>{if(view!=='quiz'||e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;if(/^[1-4]$/.test(e.key)){e.preventDefault();const b=document.querySelector('[data-number="'+e.key+'"]');if(b&&!b.disabled)b.click()}});
show('home',false);if(data.run)notice('풀이 중인 문제까지 저장되어 있어요. 이어 풀기를 눌러 계속해요.');
