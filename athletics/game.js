'use strict';
const $=s=>document.querySelector(s),KEY='rhythm-athletics-v1';
const ORDER=['triple','javelin','hurdles'];
const SPORTS={
 triple:{name:'삼단뛰기',icon:'👟',description:'다가오는 원이 가운데 초록 구간에 겹칠 때 홉 → 스텝 → 점프! 세 번의 박자로 거리가 달라져요.',unit:'m'},
 javelin:{name:'창던지기',icon:'🎯',description:'첫 번째는 파워, 두 번째는 각도를 고정해요. 높은 파워와 45도 안팎을 노려 멀리 던져요!',unit:'m'},
 hurdles:{name:'리듬 허들',icon:'🏃',description:'가운데 타이밍에 맞춰 여섯 번 점프! 너무 일찍 또는 늦게 뛰면 허들에 걸려 기록이 늘어나요.',unit:'초'}
};
const LEVELS={easy:{name:'연습',bpm:70,window:250,powerPeriod:2100,anglePeriod:2500},normal:{name:'기본',bpm:90,window:175,powerPeriod:1700,anglePeriod:2100},hard:{name:'챔피언',bpm:110,window:115,powerPeriod:1300,anglePeriod:1700}};
const JERSEYS={blue:'#659fce',coral:'#d98b78',mint:'#71b49d'};
const fresh=()=>({difficulty:'easy',jersey:'blue',muted:false,records:{},bestTotal:{easy:0,normal:0,hard:0}});
let saved=fresh();
try{const s=JSON.parse(localStorage.getItem(KEY));if(s){saved.difficulty=['easy','normal','hard'].includes(s.difficulty)?s.difficulty:'easy';saved.jersey=['blue','coral','mint'].includes(s.jersey)?s.jersey:'blue';saved.muted=s.muted===true;for(const d of Object.keys(LEVELS)){for(const sport of ORDER){const k=d+'-'+sport,r=s.records?.[k];if(r&&Number.isFinite(r.value)&&r.value>0&&r.value<=200&&Number.isInteger(r.medal)&&r.medal>=0&&r.medal<=3)saved.records[k]={value:r.value,medal:r.medal}}if(Number.isInteger(s.bestTotal?.[d])&&s.bestTotal[d]>=0&&s.bestTotal[d]<=9)saved.bestTotal[d]=s.bestTotal[d]}}}catch{}
const canvas=$('#game'),ctx=canvas.getContext('2d');
let selected='triple',mode='idle',run=null,tournament=null,lastFrame=0,resumeClock=0,resumeBeat=-1,audioCtx=null,lastMeterKind='',lastFramePaint=0;
function save(){try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}}
function format(value,sport){return value.toFixed(2)+(sport==='hurdles'?'초':'m')}
function medalIcon(m){return ['🎟️','🥉','🥈','🥇'][m]}
function recordKey(sport=selected,difficulty=saved.difficulty){return difficulty+'-'+sport}
function eventTime(){return run?Math.max(0,run.t-run.countdown):0}
function totalMedals(){return Object.values(saved.records).filter(r=>r.medal>0).length}
function setFeedback(text,perfect=false){$('#feedback').textContent=text;$('#feedback').className='feedback'+(perfect?' perfect':'')}
function renderSetup(){
 for(const b of document.querySelectorAll('[data-sport]')){b.classList.toggle('selected',b.dataset.sport===selected);b.setAttribute('aria-pressed',String(b.dataset.sport===selected))}
 for(const b of document.querySelectorAll('[data-difficulty]')){b.classList.toggle('selected',b.dataset.difficulty===saved.difficulty);b.setAttribute('aria-pressed',String(b.dataset.difficulty===saved.difficulty))}
 for(const b of document.querySelectorAll('[data-jersey]'))b.setAttribute('aria-pressed',String(b.dataset.jersey===saved.jersey));
 for(const sport of ORDER){const r=saved.records[recordKey(sport)];$('#best-'+sport).textContent=r?medalIcon(r.medal)+' '+format(r.value,sport):'최고 기록 없음'}
 $('#eventName').textContent=SPORTS[selected].icon+' '+SPORTS[selected].name;$('#eventDescription').textContent=SPORTS[selected].description;
 $('#sound').textContent=saved.muted?'🔇':'🔊';$('#sound').setAttribute('aria-label',saved.muted?'소리 켜기':'소리 끄기');$('#sound').setAttribute('aria-pressed',String(saved.muted));
 $('#eventLabel').textContent=(tournament?'3종 대회 '+(tournament.index+1)+'/3 · ':'')+SPORTS[selected].name;const best=saved.records[recordKey()];$('#recordLabel').textContent=best?'최고 '+format(best.value,selected):'메달 '+totalMedals()+' / 9';
}
function setMeter(kind,value=0,width=12){
 const meter=$('#meter');if(lastMeterKind!==kind){meter.className='meter '+kind;lastMeterKind=kind}
 const v=Math.max(-8,Math.min(108,value));$('#needle').style.left=v+'%';$('#fill').style.width=Math.max(0,Math.min(100,value))+'%';$('#fill').hidden=kind==='rhythm';
 if(kind==='power'){$('#sweet').style.left='88%';$('#sweet').style.width='12%';$('#meterText').textContent='오른쪽 초록 구간 = 높은 파워'}
 else if(kind==='angle'){$('#sweet').style.left=((42-10)/65*100)+'%';$('#sweet').style.width=(6/65*100)+'%';$('#meterText').textContent='초록 구간 = 45도 안팎'}
 else{$('#sweet').style.left=(50-width/2)+'%';$('#sweet').style.width=width+'%';$('#meterText').textContent='가운데 초록 구간에 맞춰 누르기!'}
 meter.setAttribute('aria-label',kind==='power'?'파워 게이지':kind==='angle'?'던지는 각도':'다가오는 박자');meter.setAttribute('aria-valuenow',String(Math.round(Math.max(0,Math.min(100,value)))));
}
function goHome(sport=selected){mode='idle';run=null;tournament=null;selected=sport;document.body.classList.remove('session');$('#overlay').hidden=true;$('#result').hidden=true;$('#controls').hidden=false;$('#home').hidden=true;$('#pause').disabled=true;$('#action').disabled=false;$('#action').textContent='▶ 도전 시작!';$('#progressLabel').textContent='준비됐나요?';$('#instruction').textContent=selected==='javelin'?'파워 → 각도, 두 번 누르기':'초록 구간에서 박자에 맞춰 누르기';$('#gaugeValue').textContent='';setMeter('rhythm',0);setFeedback('버튼 하나로 도전해요! 난이도와 유니폼도 골라 보세요.');renderSetup();window.scrollTo({top:0,behavior:'auto'})}
function createRun(sport){const level=LEVELS[saved.difficulty],beat=60000/level.bpm;return {sport,difficulty:saved.difficulty,level,beat,countdown:3*beat,t:0,phase:'countdown',lastBeat:-1,lastAction:-1000,notes:sport==='triple'?['홉','스텝','점프'].map((label,i)=>({label,target:(i+2)*beat,grade:null,quality:null,error:null})):sport==='hurdles'?Array.from({length:6},(_,i)=>({label:String(i+1),target:(2+i*2)*beat,cross:(2+i*2)*beat+400,grade:null,quality:null,error:null,checked:false,cleared:false})):[],combo:0,maxCombo:0,jumpAt:-10000,knockUntil:-1,lockedPower:null,angle:null,angleAt:0,launchAt:0,flight:null,landedAt:null,finished:false,flash:null,result:null}}
function startGame(sport=selected){selected=sport;run=createRun(sport);mode='playing';resumeClock=0;document.body.classList.add('session');$('#result').hidden=true;$('#controls').hidden=false;$('#home').hidden=false;$('#pause').disabled=false;$('#pause').textContent='Ⅱ';$('#pause').setAttribute('aria-label','경기 멈춤');$('#action').disabled=false;$('#action').textContent='준비…';$('#progressLabel').textContent='3박자 준비!';$('#instruction').textContent='박자를 듣고 준비해요!';$('#gaugeValue').textContent='';setFeedback('3 · 2 · 1, 준비가 끝나면 시작!');renderSetup();primeAudio();$('#arena').scrollIntoView({behavior:'auto',block:'start'});$('#action').focus({preventScroll:true});updateInterface();draw()}
function startSingle(){tournament=null;startGame(selected)}
function startTournament(){tournament={index:0,entries:[],difficulty:saved.difficulty};startGame(ORDER[0])}
function pauseGame(){if(mode!=='playing')return;mode='paused';$('#overlay').hidden=false;$('#overlayNumber').textContent='Ⅱ';$('#overlayText').textContent='편하게 쉬어요. 준비되면 계속하기';$('#action').disabled=false;$('#action').textContent='▶ 계속하기';$('#pause').textContent='▶';$('#pause').setAttribute('aria-label','경기 계속하기');setFeedback('경기와 박자가 모두 멈췄어요. 다시 누르면 두 박자 뒤 이어져요.');$('#action').focus({preventScroll:true})}
function resumeGame(){if(mode!=='paused')return;mode='resuming';resumeClock=0;resumeBeat=-1;$('#action').disabled=true;$('#action').textContent='다시 준비…';$('#pause').disabled=true;$('#overlayNumber').textContent='2';$('#overlayText').textContent='두 박자 뒤 이어서 시작!';primeAudio()}
function judge(error,windowMs){const a=Math.abs(error);return a<=windowMs*.35?{grade:'PERFECT',quality:1}:a<=windowMs?{grade:'GOOD',quality:.78}:a<=windowMs*2?{grade:'OK',quality:.45}:{grade:'MISS',quality:.08}}
function recordJudgement(note,error,miss=false){if(note.grade!==null)return false;const j=miss?{grade:'MISS',quality:.08}:judge(error,run.level.window);Object.assign(note,j,{error});if(j.quality>=.78)run.combo++;else run.combo=0;run.maxCombo=Math.max(run.maxCombo,run.combo);run.flash={text:j.grade,at:eventTime(),good:j.quality>=.78};setFeedback(j.grade==='MISS'?'박자를 놓쳤어요. 다음 원에 다시 맞춰 봐요!':`${j.grade}! ${note.label}${run.sport==='triple'?'!':'번째 점프!'}${run.combo>1?' · '+run.combo+'연속':''}`,j.grade==='PERFECT');effect(j.quality>=.78?'good':'soft');return true}
function powerAt(time,level){return .1+.9*(.5-.5*Math.cos(time/level.powerPeriod*Math.PI*2))}
function angleAt(time,level){return 10+65*(.5-.5*Math.cos(time/level.anglePeriod*Math.PI*2))}
function projectile(power,angle){const speed=11+18*power,radians=angle*Math.PI/180,vx=speed*Math.cos(radians),vy=speed*Math.sin(radians),height=2,gravity=9.81,flightTime=(vy+Math.sqrt(vy*vy+2*gravity*height))/gravity;return {power,angle,speed,vx,vy,height,gravity,flightTime,distance:vx*flightTime}}
function flightPosition(f,seconds){return {x:f.vx*seconds,y:Math.max(0,f.height+f.vy*seconds-.5*f.gravity*seconds*seconds),vy:f.vy-f.gravity*seconds}}
function jumpHeight(t,jumpAt){const dt=(t-jumpAt)/1000;return dt>=0&&dt<=.8?Math.max(0,7.2*dt-9*dt*dt):0}
function action(){
 if(mode==='idle'){startSingle();return}if(mode==='paused'){resumeGame();return}if(mode!=='playing'||!run||run.phase==='countdown'||run.finished)return;
 const t=eventTime();if(t-run.lastAction<140)return;
 if(run.sport==='javelin'){
  if(run.phase==='power'){run.lastAction=t;run.lockedPower=powerAt(t,run.level);run.angleAt=t;run.phase='angle';setFeedback('파워 '+Math.round(run.lockedPower*100)+'% 고정! 이제 45도 안팎에서 한 번 더!');effect('soft')}
  else if(run.phase==='angle'){run.lastAction=t;run.angle=angleAt(t-run.angleAt,run.level);run.flight=projectile(run.lockedPower,run.angle);run.launchAt=t;run.phase='flight';setFeedback(`던졌다! 파워 ${Math.round(run.lockedPower*100)}% · 각도 ${run.angle.toFixed(1)}°`);effect('throw')}
 }else{
  const note=run.notes.find(n=>n.grade===null);if(!note)return;const error=t-note.target;run.lastAction=t;
  if(error<-run.level.window*2){setFeedback('조금 더 기다려요! 원이 가운데에 올 때 눌러요.');return}
  if(run.sport==='hurdles'&&jumpHeight(t,run.jumpAt)>.08){setFeedback('착지한 다음에 다시 뛰어요!');return}
  if(recordJudgement(note,error)&&run.sport==='hurdles')run.jumpAt=t;
 }
 updateInterface();
}
function tripleParts(){return run.notes.map((n,i)=>[4,2.7,4.2][i]+(n.quality??.78)*[2.2,2,2.9][i])}
function triplePosition(t){const parts=tripleParts(),b=run.beat;let x=6,y=0,pose='run';if(t<2*b)x=6+14*Math.max(0,t/(2*b));else if(t<3*b){const u=(t-2*b)/b;x=20+parts[0]*u;y=Math.sin(u*Math.PI)*105;pose='jump'}else if(t<4*b){const u=(t-3*b)/b;x=20+parts[0]+parts[1]*u;y=Math.sin(u*Math.PI)*82;pose='jump'}else{const u=Math.min(1,(t-4*b)/(1.6*b));x=20+parts[0]+parts[1]+parts[2]*u;y=Math.sin(u*Math.PI)*145;pose=u>=1?'land':'jump'}return {x,y,pose,parts}}
function updateGame(){
 const t=eventTime();if(run.phase==='countdown'&&run.t>=run.countdown){run.phase=run.sport==='javelin'?'power':'run';setFeedback(run.sport==='javelin'?'파워가 오른쪽 초록 구간에 갈 때 누르세요!':'다가오는 원이 초록 구간에 겹칠 때 눌러요!')}
 if(run.phase==='countdown')return;
 if(run.sport==='triple'){
  for(const n of run.notes)if(n.grade===null&&t>n.target+run.level.window*2)recordJudgement(n,t-n.target,true);
  if(t>=5.6*run.beat&&run.landedAt===null){run.landedAt=t;effect('land');setFeedback('착지 성공! 세 박자의 합으로 기록이 정해져요.')}
  if(run.landedAt!==null&&t-run.landedAt>850)finishEvent();
 }else if(run.sport==='hurdles'){
  for(const n of run.notes){if(n.grade===null&&t>n.target+run.level.window*2)recordJudgement(n,t-n.target,true);if(!n.checked&&t>=n.cross){n.checked=true;n.cleared=jumpHeight(n.cross,run.jumpAt)>=.75;if(!n.cleared){if(n.grade===null)recordJudgement(n,t-n.target,true);n.quality=.08;n.grade='MISS';run.combo=0;run.knockUntil=t+550;effect('land');setFeedback('앗, 허들에 걸렸어요! 멈추지 말고 다음 박자!')}else setFeedback(`허들 ${run.notes.filter(n=>n.checked).length}/6 통과! ${n.grade||'좋아요!'}`,n.grade==='PERFECT')}}
  if(t>=run.notes.at(-1).cross+1000)finishEvent();
 }else if(run.phase==='flight'&&t-run.launchAt>=run.flight.flightTime*1000){run.phase='landed';run.landedAt=t;effect('land');setFeedback('착지! '+format(run.flight.distance,'javelin')+' 날아갔어요!')}
 else if(run.phase==='landed'&&t-run.landedAt>900)finishEvent();
}
function medalFor(sport,value,cleared=6){if(sport==='triple')return value>=16.8?3:value>=15?2:value>=13.5?1:0;if(sport==='javelin')return value>=75?3:value>=60?2:value>=45?1:0;return value<=13.6&&cleared===6?3:value<=14.8&&cleared>=4?2:value<=16.5&&cleared>=2?1:0}
function makeResult(){
 if(run.sport==='triple'){const parts=tripleParts(),value=parts.reduce((sum,p)=>sum+p,0);return {sport:run.sport,value,medal:medalFor(run.sport,value),details:parts.map((part,i)=>({value:part.toFixed(2)+'m',label:['홉','스텝','점프'][i]+' · '+run.notes[i].grade})),tip:'세 번 모두 PERFECT에 가까울수록 더 멀리 뛰어요. 원이 초록 구간 한가운데에 겹칠 때를 노려요!'}}
 if(run.sport==='javelin'){const value=run.flight.distance;return {sport:run.sport,value,medal:medalFor(run.sport,value),details:[{value:Math.round(run.lockedPower*100)+'%',label:'고정한 파워'},{value:run.angle.toFixed(1)+'°',label:'던진 각도'},{value:run.flight.flightTime.toFixed(2)+'초',label:'창이 날아간 시간'}],tip:'파워가 높고 각도가 45도 안팎이면 멀리 날아가요. 각도가 너무 낮거나 높으면 거리가 줄어요.'}}
 const cleared=run.notes.filter(n=>n.cleared).length,penalty=run.notes.reduce((sum,n)=>sum+(n.cleared?0:.8)+(1-n.quality)*.18,0),value=13.2+penalty;
 return {sport:run.sport,value,medal:medalFor(run.sport,value,cleared),details:[{value:cleared+'/6',label:'넘은 허들'},{value:run.maxCombo+'회',label:'최고 연속 GOOD 이상'},{value:'+'+penalty.toFixed(2)+'초',label:'실수 가산 기록'}],tip:'허들 6개를 넘는 타이밍 경기예요. 13.20초를 기준으로 걸림과 박자 실수를 가산한 게임 기록이며, 화면 재생 시간과는 달라요.'};
}
function finishEvent(){
 if(!run||run.finished||mode!=='playing')return;run.finished=true;const result=makeResult();run.result=result;const k=recordKey(run.sport,run.difficulty),old=saved.records[k],better=!old||(run.sport==='hurdles'?result.value<old.value-.00001:result.value>old.value+.00001);result.newBest=better;
 saved.records[k]={value:better?result.value:old.value,medal:Math.max(result.medal,old?.medal||0)};mode='result';if(tournament)tournament.entries[tournament.index]=result;save();$('#overlay').hidden=true;$('#controls').hidden=true;$('#result').hidden=false;$('#progressLabel').textContent='경기 완료!';renderSetup();renderResult(result);effect('win');$('#result').scrollIntoView({behavior:'auto',block:'start'});
}
function renderResult(result){
 const overall=tournament&&tournament.index===2;$('#retry').hidden=!!overall;$('#resultEyebrow').textContent=overall?'THREE-SPORT CHALLENGE':result.newBest?'NEW PERSONAL RECORD':'NICE CHALLENGE';
 if(overall){const points=tournament.entries.reduce((sum,r)=>sum+r.medal,0);saved.bestTotal[run.difficulty]=Math.max(saved.bestTotal[run.difficulty],points);save();$('#resultIcon').textContent=points>=8?'🏆':medalIcon(points>=5?2:points>=2?1:0);$('#resultTitle').textContent='육상 3종 대회 완주!';$('#resultRecord').textContent=points+' / 9 메달 포인트';$('#resultDescription').textContent=`금 3점 · 은 2점 · 동 1점 · ${LEVELS[run.difficulty].name} 최고 종합 ${saved.bestTotal[run.difficulty]}점`;$('#resultDetails').innerHTML=tournament.entries.map(r=>`<div class="detail"><strong>${medalIcon(r.medal)} ${format(r.value,r.sport)}</strong><span>${SPORTS[r.sport].name}</span></div>`).join('');$('#resultNext').textContent='🏆 다시 3종 대회';$('#resultNext').onclick=startTournament;
 }else{$('#resultIcon').textContent=medalIcon(result.medal);$('#resultTitle').textContent=result.newBest?'나의 새 기록!':SPORTS[result.sport].name+' 도전 완료!';$('#resultRecord').textContent=format(result.value,result.sport);$('#resultDescription').textContent=result.tip;$('#resultDetails').innerHTML=result.details.map(d=>`<div class="detail"><strong>${d.value}</strong><span>${d.label}</span></div>`).join('');$('#resultNext').textContent=tournament?'다음 종목: '+SPORTS[ORDER[tournament.index+1]].name:'다음 종목 해보기 →';$('#resultNext').onclick=()=>{if(tournament){tournament.index++;startGame(ORDER[tournament.index])}else goHome(ORDER[(ORDER.indexOf(selected)+1)%3])}}
 $('#retry').onclick=()=>startGame(selected);
}
function updateInterface(){
 if(!run||mode==='result')return;const t=eventTime();
 if(mode==='paused'||mode==='resuming')return;
 if(run.phase==='countdown'){$('#overlay').hidden=false;$('#overlayNumber').textContent=Math.max(1,3-Math.floor(run.t/run.beat));$('#overlayText').textContent='박자 듣고 준비!';$('#action').textContent='준비…';$('#action').disabled=true;$('#instruction').textContent=SPORTS[run.sport].name+' 준비';setMeter('rhythm',0);return}
 $('#overlay').hidden=true;$('#pause').disabled=false;$('#pause').textContent='Ⅱ';$('#action').disabled=false;
 if(run.sport==='javelin'){
  if(run.phase==='power'){const p=powerAt(t,run.level);setMeter('power',p*100);$('#instruction').textContent='① 높은 파워에서 누르기!';$('#gaugeValue').textContent=Math.round(p*100)+'%';$('#action').textContent='💪 파워 고정!';$('#progressLabel').textContent='파워 → 각도'}
  else if(run.phase==='angle'){const a=angleAt(t-run.angleAt,run.level);setMeter('angle',(a-10)/65*100);$('#instruction').textContent='② 45도 안팎에서 누르기!';$('#gaugeValue').textContent=a.toFixed(0)+'°';$('#action').textContent='🎯 이 각도로 던지기!';$('#progressLabel').textContent='파워 '+Math.round(run.lockedPower*100)+'% 고정'}
  else{$('#action').disabled=true;$('#action').textContent=run.phase==='landed'?'기록 확인 중…':'창이 날아가는 중!';$('#instruction').textContent=run.phase==='landed'?'착지! 기록을 확인해요':'멀리 날아가라!';$('#gaugeValue').textContent=run.angle.toFixed(1)+'°';$('#progressLabel').textContent='파워 '+Math.round(run.lockedPower*100)+'%'}
 }else{
  const next=run.notes.find(n=>n.grade===null),done=run.notes.filter(n=>n.grade!==null).length,value=next?50+(next.target-t)/run.beat*42:110,width=run.level.window/run.beat*84;
  setMeter('rhythm',value,width);$('#gaugeValue').textContent=run.combo>1?'🔥 '+run.combo+'연속':'';$('#progressLabel').textContent=done+'/'+run.notes.length+' 박자';$('#instruction').textContent=next?(run.sport==='triple'?next.label+'! 초록 구간에서 뛰기':(run.notes.indexOf(next)+1)+'번째 허들, 박자에 맞춰 뛰기'):'멋진 착지를 기다려요!';$('#action').textContent=run.sport==='triple'?(next?'👟 '+next.label+'!':'착지 중…'):'🏃 점프!';$('#action').disabled=!next;
 }
}
function primeAudio(){if(saved.muted)return;try{audioCtx??=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{})}catch{}}
function playTone(hz,duration=.12,type='triangle',volume=.05,delay=0){if(saved.muted||!audioCtx)return;try{const at=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(hz,at);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(volume,at+.006);g.gain.exponentialRampToValueAtTime(.0001,at+duration);o.connect(g);g.connect(audioCtx.destination);o.start(at);o.stop(at+duration+.01)}catch{}}
function beatSound(index){if(saved.muted||!audioCtx)return;playTone(index%4===0?130:190,.075,'sine',.065);if(index%2===0)playTone([523,659,784,659][Math.floor(index/2)%4],.065,'triangle',.025)}
function effect(kind){primeAudio();if(kind==='win'){[523,659,784,1047].forEach((f,i)=>playTone(f,.14,'triangle',.065,i*.08))}else if(kind==='good'){playTone(880,.08);playTone(1175,.08,'triangle',.03,.03)}else if(kind==='throw')playTone(650,.16);else if(kind==='land')playTone(110,.10,'sine',.06);else playTone(440,.06,'triangle',.03)}
function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h)}
function line(x1,y1,x2,y2,color,width=4){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
function drawBackground(camera=0){
 const sky=ctx.createLinearGradient(0,0,0,330);sky.addColorStop(0,'#bcdde1');sky.addColorStop(1,'#f3f2d9');ctx.fillStyle=sky;ctx.fillRect(0,0,960,540);ctx.fillStyle='#f8e6a7';ctx.beginPath();ctx.arc(810,70,36,0,Math.PI*2);ctx.fill();
 for(let i=0;i<6;i++){const x=((i*210-camera*.12)%1250+1250)%1250-80;ctx.fillStyle='#e6efdd';ctx.beginPath();ctx.ellipse(x,69+(i%2)*30,65,13,0,0,Math.PI*2);ctx.fill()}
 rect(0,142,960,115,'#a9c4a8');rect(0,145,960,8,'#658d7a');rect(0,180,960,5,'#8aa888');rect(0,218,960,5,'#8aa888');
 const colors=['#e5bd84','#9eb4c5','#d49691','#b9c798','#e6dba6'];for(let row=0;row<3;row++)for(let i=0;i<43;i++){const x=((i*27-camera*.18)%1150+1150)%1150-50,y=155+row*32;rect(x,y,8,8,['#bc916e','#ecd0a9','#b88367'][(i+row)%3]);rect(x-2,y+8,12,10,colors[(i+row*3)%5])}
 rect(0,257,960,22,'#f3e9cf');rect(0,274,960,6,'#85a388');ctx.font='bold 21px monospace';ctx.textAlign='center';ctx.fillStyle='#648879';ctx.fillText('RHYTHM ATHLETICS',480,272);
 rect(0,280,960,112,'#9fbd83');for(let i=0;i<8;i++)rect((i*165-camera*.28)%1200,334,80,3,'#b9cc96');rect(0,392,960,148,'#d7a17d');rect(0,394,960,7,'#e7c8a0');rect(0,449,960,3,'#f5e5c2');rect(0,505,960,3,'#f5e5c2');
 for(let i=0;i<4;i++){const x=((i*280-camera*.1)%1300+1300)%1300-60;rect(x,85,4,62,'#819d8c');rect(x+4,86,33,20,['#d5947c','#94b99a','#c5b16c','#9bacc7'][i])}
}
function athlete(x,feetY,pose='run',time=0){
 const stride=Math.sin(time*.015),jersey=JERSEYS[saved.jersey];ctx.save();ctx.translate(Math.round(x),Math.round(feetY));if(pose==='stumble')ctx.rotate(.22);
 ctx.fillStyle='#445f442e';ctx.beginPath();ctx.ellipse(0,4,24,5,0,0,Math.PI*2);ctx.fill();
 const jump=pose==='jump',throwing=pose==='throw',land=pose==='land',ready=pose==='ready',hipY=land?-43:-52;
 const legA=ready?0:jump?-1.1:land?-.8:stride*.7,legB=ready?0:jump?.7:land?.6:-stride*.7;
 for(const [angle,offset] of [[legA,-6],[legB,6]]){const kneeX=offset+Math.sin(angle)*22,kneeY=hipY+Math.cos(angle)*23,footX=kneeX+Math.sin(angle*.5)*21,footY=ready?0:kneeY+Math.cos(angle*.5)*23;line(offset,hipY,kneeX,kneeY,'#c99976',10);line(kneeX,kneeY,footX,footY,'#e3b38b',9);line(footX-2,footY,footX+10,footY,'#f5e9c7',10);line(footX-3,footY+4,footX+11,footY+4,'#567a70',3)}
 rect(-15,hipY-11,30,14,'#425c71');ctx.fillStyle=jersey;ctx.beginPath();ctx.moveTo(-16,hipY-10);ctx.lineTo(-13,hipY-38);ctx.lineTo(11,hipY-38);ctx.lineTo(17,hipY-10);ctx.closePath();ctx.fill();rect(-7,hipY-29,14,14,'#f5ecd6');ctx.fillStyle='#547b72';ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillText('7',0,hipY-17);
 const shoulderY=hipY-31,arm=ready?.2:throwing?-1.5:jump?-1.05:land?.8:-stride*.8;
 for(const side of [-1,1]){const endX=side*(20+Math.sin(arm)*13),endY=shoulderY+Math.cos(arm)*24-(throwing?side===1?38:0:0);line(side*12,shoulderY,endX,endY,'#e7bb91',8);if(throwing&&side===1)line(endX,endY,endX+20,endY-8,'#edc79f',7)}
 rect(-5,hipY-47,10,13,'#dca983');ctx.fillStyle='#efc49a';ctx.beginPath();ctx.arc(0,hipY-55,15,0,Math.PI*2);ctx.fill();rect(-14,hipY-69,27,9,'#56504b');rect(-15,hipY-62,7,15,'#56504b');rect(-15,hipY-63,29,5,'#f3df9b');rect(5,hipY-55,3,4,'#425b5a');line(4,hipY-45,9,hipY-45,'#b57865',2);ctx.restore();
}
function dust(x,y,age){if(age<0||age>700)return;ctx.save();ctx.globalAlpha=(1-age/700)*.5;for(let i=0;i<8;i++){const a=i*.7,spread=age/20;ctx.fillStyle='#f2d5a0';ctx.beginPath();ctx.arc(x+Math.cos(a)*spread,y-4-Math.abs(Math.sin(a))*spread*.4,5+age/110,0,Math.PI*2);ctx.fill()}ctx.restore()}
function drawTriple(t){const p=triplePosition(t),scale=24,camera=Math.max(0,p.x*scale-270);drawBackground(camera);const pitX=28*scale-camera;rect(pitX,395,15*scale,70,'#e4ca91');rect(pitX,395,15*scale,7,'#b39365');for(let i=0;i<50;i++)rect(pitX+i*11,413+(i%3)*14,3,2,'#d0ad75');const board=20*scale-camera;rect(board-5,390,10,70,'#fff7df');for(let m=0;m<=25;m++){const x=(20+m)*scale-camera;if(x<-30||x>990)continue;rect(x,465,2,m%5===0?17:7,'#fff0c8');if(m%5===0){ctx.font='bold 18px monospace';ctx.fillStyle='#8c785c';ctx.textAlign='center';ctx.fillText(m+'m',x,505)}}athlete(p.x*scale-camera,392-p.y,p.pose,t);if(run.landedAt!==null)dust(p.x*scale-camera,395,t-run.landedAt)}
function drawJavelin(t){const inFlight=run.flight&&['flight','landed'].includes(run.phase),flightT=inFlight?Math.min(run.flight.flightTime,Math.max(0,(t-run.launchAt)/1000)):0,p=inFlight?flightPosition(run.flight,flightT):null,scale=10,camera=p?Math.max(0,(14+p.x)*scale-760):0;drawBackground(camera);rect(0,395,960,145,'#a9c589');for(let m=0;m<=120;m+=10){const x=(14+m)*scale-camera;if(x<-40||x>1000)continue;rect(x,394,2,112,'#deead0');ctx.font='bold 18px monospace';ctx.fillStyle='#6d926d';ctx.textAlign='center';ctx.fillText(m+'m',x+15,475)}const actorX=140-camera;rect(actorX+21,390,5,130,'#f7edcf');athlete(actorX,392,inFlight&&flightT<.5?'throw':inFlight?'ready':run.phase==='countdown'?'ready':'throw',t);
 if(p){for(let i=1;i<12;i++){const time=flightT-i*.07;if(time<0)continue;const tail=flightPosition(run.flight,time);ctx.globalAlpha=(1-i/12)*.5;rect((14+tail.x)*scale-camera,392-tail.y*10-70*(1-time/run.flight.flightTime),4,4,'#fff8c5')}ctx.globalAlpha=1;const x=(14+p.x)*scale-camera,y=392-p.y*10-70*(1-flightT/run.flight.flightTime),angle=Math.atan2(-p.vy*10+70/run.flight.flightTime,run.flight.vx*10);ctx.save();ctx.translate(x,y);ctx.rotate(angle);line(-30,0,23,0,'#d2ac5d',4);line(8,0,24,0,'#ecebc8',4);ctx.fillStyle='#6c8585';ctx.beginPath();ctx.moveTo(31,0);ctx.lineTo(21,-4);ctx.lineTo(21,4);ctx.closePath();ctx.fill();ctx.restore();if(run.landedAt!==null)dust(x,395,t-run.landedAt)}else line(actorX-22,303,actorX+64,287,'#ad8b47',4);
}
function drawHurdles(t){const worldX=5+8*t/1000,scale=23,camera=Math.max(0,worldX*scale-220);drawBackground(camera);for(const n of run.notes){const x=(5+8*n.cross/1000)*scale-camera;if(x<-80||x>1040)continue;ctx.save();ctx.translate(x,394);if(n.checked&&!n.cleared)ctx.rotate(1.25);rect(-4,-47,8,47,'#eae8d4');rect(21,-47,7,47,'#b2c9b1');rect(-5,-52,34,8,'#f4e8c8');rect(-4,-52,13,8,'#c8886d');rect(-10,-4,23,5,'#6f8e7c');ctx.restore();ctx.font='bold 20px monospace';ctx.fillStyle='#8d765d';ctx.textAlign='center';ctx.fillText(n.label,x+12,493)}
 const finish=(5+8*(run.notes.at(-1).cross+800)/1000)*scale-camera;for(let i=0;i<6;i++)for(let j=0;j<2;j++)rect(finish+i*10,394+j*12,10,12,(i+j)%2?'#f4ebce':'#627f71');const h=jumpHeight(t,run.jumpAt)*60;athlete(worldX*scale-camera,392-h,t<run.knockUntil?'stumble':h>.5?'jump':'run',t);if(t<run.knockUntil){pixelSpark(worldX*scale-camera-28,263,'#e4ba5a');pixelSpark(worldX*scale-camera+25,274,'#f0d48b')}}
function pixelSpark(x,y,color){rect(x-2,y-9,4,18,color);rect(x-9,y-2,18,4,color);rect(x-6,y-6,12,12,color)}
function draw(){ctx.imageSmoothingEnabled=false;if(!run){drawBackground(0);athlete(250,392,'ready',0);if(selected==='javelin')line(225,304,330,286,'#b29152',4);if(selected==='hurdles'){rect(600,340,8,52,'#ede7cd');rect(600,340,43,8,'#c9846c')}ctx.font='bold 38px system-ui';ctx.fillStyle='#577e6c';ctx.textAlign='center';ctx.fillText(SPORTS[selected].name,575,334);return}const t=eventTime();if(run.sport==='triple')drawTriple(t);else if(run.sport==='javelin')drawJavelin(t);else drawHurdles(t);if(run.flash&&t-run.flash.at<650){ctx.save();ctx.globalAlpha=Math.max(0,1-(t-run.flash.at)/650);ctx.font='900 46px system-ui';ctx.textAlign='center';ctx.fillStyle=run.flash.good?'#a77b2e':'#886e5c';ctx.fillText(run.flash.text,555,335-(t-run.flash.at)/60);ctx.restore()}}
function frame(now){const dt=lastFrame?Math.min(now-lastFrame,60):0;lastFrame=now;
 if(mode==='playing'){run.t+=dt;const beat=Math.floor(run.t/run.beat);if(beat!==run.lastBeat){run.lastBeat=beat;beatSound(beat)}updateGame();updateInterface()}
 else if(mode==='resuming'){resumeClock+=dt;const b=Math.floor(resumeClock/run.beat);if(b!==resumeBeat&&b<2){resumeBeat=b;beatSound(b)}$('#overlayNumber').textContent=Math.max(1,2-b);if(resumeClock>=run.beat*2){mode='playing';$('#overlay').hidden=true;$('#pause').disabled=false;$('#pause').textContent='Ⅱ';$('#pause').setAttribute('aria-label','경기 멈춤');setFeedback('이어서 도전! 다음 박자를 봐요.');updateInterface();canvas.focus({preventScroll:true})}}
 if(now-lastFramePaint>=25){draw();lastFramePaint=now}requestAnimationFrame(frame);
}
for(const b of document.querySelectorAll('[data-sport]'))b.addEventListener('click',()=>{if(mode==='idle')goHome(b.dataset.sport)});
for(const b of document.querySelectorAll('[data-difficulty]'))b.addEventListener('click',()=>{if(mode!=='idle')return;saved.difficulty=b.dataset.difficulty;save();renderSetup()});
for(const b of document.querySelectorAll('[data-jersey]'))b.addEventListener('click',()=>{if(mode!=='idle')return;saved.jersey=b.dataset.jersey;save();renderSetup()});
$('#action').addEventListener('pointerdown',e=>{e.preventDefault();if(!$('#action').disabled)action()});$('#action').addEventListener('click',e=>{if(e.detail===0&&!$('#action').disabled)action()});
$('#pause').addEventListener('click',()=>mode==='paused'?resumeGame():pauseGame());$('#home').addEventListener('click',()=>goHome());$('#tournament').addEventListener('click',startTournament);$('#resultHome').addEventListener('click',()=>goHome());
$('#sound').addEventListener('click',()=>{saved.muted=!saved.muted;save();renderSetup();if(!saved.muted)effect('good');if(mode==='playing'||mode==='resuming')canvas.focus({preventScroll:true})});
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.altKey||e.metaKey)return;if(e.code==='Space'){if(e.target instanceof HTMLButtonElement&&e.target.id!=='action')return;e.preventDefault();if(!e.repeat)action()}else if(e.key==='Escape'&&!e.repeat){if(mode==='playing')pauseGame();else if(mode==='paused')resumeGame()}});
window.addEventListener('blur',()=>{if(mode==='playing'||mode==='resuming'){mode='playing';pauseGame()}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&(mode==='playing'||mode==='resuming')){mode='playing';pauseGame()}});
goHome();requestAnimationFrame(frame);
