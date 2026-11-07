'use strict';
const SpeechEngine=window.SpeechRecognition||window.webkitSpeechRecognition||null;
const MAX_RECORD_MS=7000;
let recordPhase='idle',capture=null,lastRecording=null,captureEpoch=0,readingAudioContext=null;
function recordingSupported(){return !!(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder)}
function ensureAudio(){try{readingAudioContext??=new(window.AudioContext||window.webkitAudioContext)();if(readingAudioContext.state==='suspended')readingAudioContext.resume().catch(()=>{});return readingAudioContext}catch{return null}}
function normalizedText(text){return String(text).normalize('NFC').toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z0-9]/g,'')}
function readingUnits(text){const out=[];for(const char of normalizedText(text)){const code=char.charCodeAt(0)-0xac00;if(code>=0&&code<11172){out.push('i'+Math.floor(code/588),'v'+Math.floor(code%588/28));if(code%28)out.push('f'+code%28)}else out.push(char)}return out}
function textMatch(expected,heard){const a=normalizedText(expected),b=normalizedText(heard);if(!a||!b)return 0;if(a===b)return 100;const x=readingUnits(a),y=readingUnits(b);let prev=Array.from({length:y.length+1},(_,i)=>i);for(let i=1;i<=x.length;i++){const row=[i];for(let j=1;j<=y.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));prev=row}return Math.max(0,Math.round((1-prev[y.length]/Math.max(x.length,y.length))*100))}
function bestTranscript(expected,candidates){let best={text:'',score:0};for(const raw of candidates){const text=String(raw).trim().slice(0,160);if(!normalizedText(text))continue;const score=textMatch(expected,text);if(!best.text||score>best.score)best={text,score}}return best}
function starsForMatch(score){return score===100?3:score>=80?2:score>=55?1:0}
function recordingExtension(mime){return /mp4|m4a/i.test(mime)?'m4a':/ogg/i.test(mime)?'ogg':'webm'}
function stopModel(){try{window.speechSynthesis?.cancel()}catch{}}
function releaseStream(stream){for(const track of stream?.getTracks?.()||[])try{track.stop()}catch{}}
function stopRecognizer(cap,abort=false){if(!cap?.recognizer)return;try{abort?cap.recognizer.abort():cap.recognizer.stop()}catch{}}
function releaseCapture(cap){if(!cap)return;clearTimeout(cap.maxTimer);clearTimeout(cap.autoTimer);clearTimeout(cap.forceTimer);releaseStream(cap.stream);try{cap.source?.disconnect();cap.analyser?.disconnect()}catch{}stopRecognizer(cap,true)}
function clearRecording(){cancelCapture(false);const audio=document.querySelector('#audio');audio.pause();audio.removeAttribute('src');audio.load();if(lastRecording?.url)URL.revokeObjectURL(lastRecording.url);lastRecording=null;renderRecordingResult()}
function cancelCapture(tell=true){captureEpoch++;const cap=capture;capture=null;recordPhase='idle';if(cap){try{if(cap.recorder.state!=='inactive')cap.recorder.stop()}catch{}releaseCapture(cap)}if(typeof renderRecorder==='function')renderRecorder();if(tell&&cap)notice('녹음을 멈췄어요. 체력은 쓰지 않았어요.')}
function transcriptCandidates(results){let choices=[''];for(let i=0;i<results.length;i++){const r=results[i];if(!r.isFinal)continue;const alternatives=[];for(let j=0;j<Math.min(3,r.length);j++)if(String(r[j].transcript).trim())alternatives.push(String(r[j].transcript).trim());if(!alternatives.length)continue;choices=choices.flatMap(prefix=>alternatives.map(text=>(prefix+' '+text).trim())).slice(0,18)}return choices.filter(Boolean)}
function startRecognizer(cap){
 if(cap.mode!=='auto'||!SpeechEngine){cap.resolveRecognition();return}
 try{const recognition=new SpeechEngine();cap.recognizer=recognition;recognition.lang='ko-KR';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=3;
  recognition.onresult=e=>{if(cap.epoch!==captureEpoch)return;cap.candidates=new Set(transcriptCandidates(e.results));clearTimeout(cap.autoTimer);let unfinished=false;for(let i=0;i<e.results.length;i++)if(!e.results[i].isFinal&&e.results[i][0]?.transcript.trim())unfinished=true;const target=WORD_MAP.get(cap.itemId).text;if(!unfinished&&bestTranscript(target,[...cap.candidates]).score===100&&!cap.stopRequested)cap.autoTimer=setTimeout(()=>{if(capture===cap&&recordPhase==='recording')stopCapture()},550)};
  recognition.onerror=e=>{cap.recognitionError=e.error||'unavailable';cap.resolveRecognition()};recognition.onend=()=>cap.resolveRecognition();recognition.start();
 }catch{cap.recognitionError='unavailable';cap.resolveRecognition()}
}
async function beginCapture(){
 if(recordPhase!=='idle')return;if(!recordingSupported()){notice('이 브라우저에서는 녹음을 지원하지 않아요. 마이크 녹음은 HTTPS 게임 주소에서 열어 주세요.');return}
 recoverEnergy();if(data.energy<=0){show('rest');notice('게임 체력이 비었어요. 물 마시고 잠깐 쉬면 무료로 충전돼요!');return}
 clearRecording();stopModel();const epoch=++captureEpoch;recordPhase='asking';renderRecorder();const context=ensureAudio();let stream;
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  if(epoch!==captureEpoch||view!=='practice'){releaseStream(stream);return}
  // Give the model voice a moment to stop so it cannot be counted as the child's reading.
  await new Promise(resolve=>setTimeout(resolve,240));if(epoch!==captureEpoch||view!=='practice'){releaseStream(stream);return}
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported?.(t));const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
  let resolveRecognition;const recognitionDone=new Promise(resolve=>{resolveRecognition=resolve});const cap={epoch,itemId:data.current,mode:data.mode,stream,recorder,chunks:[],startedAt:performance.now(),stoppedAt:0,loudMs:0,maxVolume:0,meterAvailable:false,source:null,analyser:null,buffer:null,candidates:new Set(),recognitionDone,resolveRecognition,stopRequested:false,finalizing:false,recognizer:null,recognitionError:null};capture=cap;
  if(context)try{cap.source=context.createMediaStreamSource(stream);cap.analyser=context.createAnalyser();cap.analyser.fftSize=1024;cap.buffer=new Uint8Array(cap.analyser.fftSize);cap.source.connect(cap.analyser);cap.meterAvailable=context.state==='running'}catch{}
  recorder.ondataavailable=e=>{if(e.data.size)cap.chunks.push(e.data)};recorder.onerror=()=>{cap.recordError=true;if(capture===cap)stopCapture()};recorder.onstop=()=>finalizeCapture(cap);recorder.start(200);recordPhase='recording';cap.startedAt=performance.now();cap.maxTimer=setTimeout(()=>{if(capture===cap)stopCapture()},MAX_RECORD_MS);startRecognizer(cap);renderRecorder();notice('지금 보이는 글자를 읽어요! 다 읽으면 정지 버튼을 눌러요.');
 }catch(error){releaseStream(stream);if(epoch!==captureEpoch)return;if(capture){releaseCapture(capture);capture=null}recordPhase='idle';renderRecorder();const name=error?.name;notice(name==='NotAllowedError'||name==='SecurityError'?'마이크 사용을 허용해야 녹음할 수 있어요. 주소 옆 마이크 설정을 확인해 주세요.':name==='NotFoundError'?'마이크를 찾지 못했어요. 마이크가 있는 기기에서 다시 열어 주세요.':name==='NotReadableError'?'다른 앱이 마이크를 쓰고 있을 수 있어요. 녹음 앱을 닫고 다시 해 봐요.':'녹음을 시작하지 못했어요. 체력은 그대로예요. 다시 눌러 주세요.')}
}
function stopCapture(){const cap=capture;if(!cap||recordPhase!=='recording')return;cap.stopRequested=true;cap.stoppedAt=performance.now();recordPhase='processing';clearTimeout(cap.maxTimer);clearTimeout(cap.autoTimer);stopRecognizer(cap);renderRecorder();try{cap.recorder.stop()}catch{finalizeCapture(cap)}cap.forceTimer=setTimeout(()=>{if(!cap.finalizing)finalizeCapture(cap)},1300)}
async function finalizeCapture(cap){
 if(cap.finalizing)return;cap.finalizing=true;clearTimeout(cap.maxTimer);clearTimeout(cap.autoTimer);clearTimeout(cap.forceTimer);cap.stoppedAt||=performance.now();releaseStream(cap.stream);try{cap.source?.disconnect()}catch{}stopRecognizer(cap);
 if(cap.mode==='auto')await Promise.race([cap.recognitionDone,new Promise(resolve=>setTimeout(resolve,900))]);stopRecognizer(cap,true);
 if(cap.epoch!==captureEpoch||capture!==cap){releaseCapture(cap);return}
 const item=WORD_MAP.get(cap.itemId),mime=cap.recorder.mimeType||cap.chunks[0]?.type||'audio/webm',blob=new Blob(cap.chunks,{type:mime}),duration=(cap.stoppedAt-cap.startedAt)/1000,match=bestTranscript(item.text,[...cap.candidates]),sound=cap.loudMs>=100||!!match.text,valid=blob.size>0&&duration>=.35&&!cap.recordError,canGrade=valid&&(sound||!cap.meterAvailable);
 lastRecording={itemId:cap.itemId,mode:cap.mode,blob,url:blob.size?URL.createObjectURL(blob):null,mime,duration,transcript:match.text,score:match.score,valid,canGrade,hasSound:sound,meterAvailable:cap.meterAvailable,listened:false,claimed:false,source:cap.mode==='auto'&&match.text?'auto':'manual',selectedStars:cap.mode==='auto'&&match.text?starsForMatch(match.score):null,recognitionError:cap.recognitionError};capture=null;recordPhase='idle';releaseCapture(cap);renderRecorder();renderRecordingResult();if(!valid)notice('조금 더 길게 읽어 볼까요? 체력은 아직 쓰지 않았어요.');else if(!canGrade)notice('소리가 작거나 들리지 않았어요. 마이크를 확인하고 다시 읽어 봐요. 체력은 그대로예요.');else notice(match.text?'읽은 말을 확인했어요! 결과를 보고 읽기 선물을 받아요.':'녹음은 잘 담았어요! 내 목소리를 듣고 보호자와 별을 골라요.');document.querySelector('#playback').scrollIntoView({behavior:'auto',block:'nearest'});
}
function updateMicrophone(now,dt){const cap=capture;if(recordPhase!=='recording'||!cap)return;let volume=0;if(cap.analyser&&cap.buffer&&readingAudioContext?.state==='running')try{cap.analyser.getByteTimeDomainData(cap.buffer);let energy=0;for(const byte of cap.buffer)energy+=((byte-128)/128)**2;const rms=Math.sqrt(energy/cap.buffer.length);volume=Math.min(100,Math.round(rms*390));if(rms>.015)cap.loudMs+=dt;cap.maxVolume=Math.max(cap.maxVolume,volume);cap.meterAvailable=true}catch{cap.meterAvailable=false}else cap.meterAvailable=false;document.querySelector('#volumeBar').style.width=volume+'%';document.querySelector('#volumeTrack').setAttribute('aria-valuenow',String(volume));document.querySelector('#recordTime').textContent=Math.min(7,(now-cap.startedAt)/1000).toFixed(1)+' / 7초';}
