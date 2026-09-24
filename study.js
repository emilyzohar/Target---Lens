/* jsPsych recording study. Qualtrics supplies rid and optionally task_order / first_A,B,C. */
const EXPERIMENT_ID = 'ZWaZjR15uPrl';
const TRIAL_MS = 10000;
const params = new URLSearchParams(location.search);
const qualtrics_id = params.get('rid');
const subject_id = crypto.randomUUID();
// Provide a Qualtrics continuation or follow-up survey URL in this constant, or pass ?return_url=... from Qualtrics.
const QUALTRICS_RETURN_URL = 'https://utorontopsych.az1.qualtrics.com/jfe/form/SV_aaUYdNgmdgq4ACy';
function buildReturnUrl(){
 const raw=params.get('return_url')||QUALTRICS_RETURN_URL;
 if(!raw)return null;
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||!(url.hostname==='qualtrics.com'||url.hostname.endsWith('.qualtrics.com')))return null;
  url.searchParams.set('rid',qualtrics_id);
  url.searchParams.set('study_id',subject_id);
  return url.href;
 }catch{return null}
}
const jsPsych = initJsPsych({
  extensions:[{type:jsPsychExtensionPipe,params:{experiment_id:EXPERIMENT_ID,filename:()=>`${subject_id}.csv`,stream:true}}],
  on_finish:()=>{
   stopCamera();
   const content=document.querySelector('#jspsych-content');
   content.innerHTML=wrap('Tasks complete','Return to Qualtrics');
   const area=content.querySelector('#content');
   const link=buildReturnUrl();
   const note=document.createElement('p');
   note.textContent=link?'Your tasks are complete. Continue to Qualtrics to finish the study.':'Your tasks are complete. Return to the original Qualtrics tab to finish the study. The researcher has not configured a return link.';
   area.append(note);
   if(link){const a=document.createElement('a');a.className='return-link';a.href=link;a.textContent='Continue to Qualtrics';area.append(a)}
  }
});
jsPsych.data.addProperties({subject_id,qualtrics_id});
let camera;
let faceMonitor=null;
const TASK_NAMES={A:'Add-N',B:'Button pressing',C:'Anagrams'};
const WORDS={low:['CAT','DOG','SUN','MAP'],high:['PAINTER','TEACHER','PICTURE','CAPTAIN']};
const SCRAMBLES={CAT:'TAC',DOG:'GDO',SUN:'NSU',MAP:'PAM',PAINTER:'RPAIENT',TEACHER:'RTEACHE',PICTURE:'TURCEPI',CAPTAIN:'TAINCAP'};
const ALTERNATE_SOLUTIONS={CAT:['ACT'],DOG:['GOD'],MAP:['AMP'],TEACHER:['CHEATER']};
const button=(label,fn,cls='primary')=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.onclick=fn;return b};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const shuffle=a=>jsPsych.randomization.shuffle(a);
const wrap=(title,eyebrow='Effort study')=>`<section class="card"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><div id="content"></div></section>`;
function stopCamera(){
 faceMonitor?.stop();faceMonitor=null;
 camera?.getTracks().forEach(t=>t.stop());camera=null;
}
// Samples the live camera on device. If the model cannot load, the checklist still applies.
async function setupFaceMonitor(stream){
 const warning=document.getElementById('face-warning');
 const video=document.createElement('video');
 video.autoplay=true;video.muted=true;video.playsInline=true;video.className='monitor-video';video.srcObject=stream;document.body.append(video);
 await video.play();
 let detector;
 try{
  const {FaceDetector,FilesetResolver}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm');
  const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
  detector=await FaceDetector.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'},runningMode:'VIDEO',minDetectionConfidence:0.5});
 }catch(error){video.remove();console.warn('Face monitor unavailable:',error);return null}
 let active=false,misses=0,alertCount=0,sampleCount=0,busy=false;
 const timer=setInterval(()=>{
  if(busy||video.readyState<2)return;
  busy=true;
  try{
   const faces=detector.detectForVideo(video,performance.now()).detections||[];
   if(active){
    sampleCount++;
    misses=faces.length===0?misses+1:0;
    const message=faces.length>1?'More than one face is in frame. Please sit alone.':misses>=2?'Your face is not visible. Please return to the frame.':'';
    if(message&&!warning.textContent)alertCount++;
    warning.textContent=message;warning.hidden=!message;
   }
  }catch(error){console.warn('Face monitoring stopped:',error);clearInterval(timer);warning.hidden=true;warning.textContent=''}
  finally{busy=false}
 },1200);
 return {
  begin(){active=true;misses=0;alertCount=0;sampleCount=0;warning.hidden=true;warning.textContent=''},
  end(){active=false;warning.hidden=true;warning.textContent='';return {face_alert_count:alertCount,face_samples:sampleCount,face_monitor_status:'active'}},
  stop(){clearInterval(timer);detector.close();video.remove();warning.hidden=true;warning.textContent=''}
 };
}
function orderFromQualtrics(){
 const supplied=params.get('task_order');const order=supplied?.split(',')||shuffle(['A','B','C']);
 if(order.length!==3||new Set(order).size!==3||order.some(t=>!['A','B','C'].includes(t)))throw Error('Invalid task_order. Use A,B,C in any order.');
 const trials=[];
 for(const task of order){
  const specified=params.get(`first_${task}`);
  if(specified&&!['high','low'].includes(specified))throw Error(`Invalid first_${task}`);
  const first=specified||shuffle(['high','low'])[0];
  for(const condition of [first,first==='high'?'low':'high'])for(let n=1;n<=4;n++)trials.push({task,condition,within_condition:n,trial:trials.length+1,first_condition:first,task_order:order.join(',')});
 }
 return trials;
}
function supportedMime(){return ['video/webm;codecs=vp8','video/webm','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m))}
function startRecording(){
 const mime=supportedMime();if(!mime)throw Error('This browser cannot record video. Use current Chrome or Edge.');
 const chunks=[];const recorder=new MediaRecorder(camera,{mimeType:mime,videoBitsPerSecond:550000});
 const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onerror=e=>reject(e.error||Error('Recording failed'));recorder.onstop=()=>resolve(new Blob(chunks,{type:mime.split(';')[0]}))});
 recorder.start();return {stop:()=>{if(recorder.state==='recording')recorder.stop();return finished}};
}
function asBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(r.error);r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(blob)})}
async function sendVideo(blob,filename,status){
 if(blob.size>18*1024*1024)throw Error('Video exceeded 18 MB. Contact the researcher.');
 const encoded=await asBase64(blob);
 for(;;){
  status.textContent=`Uploading video (${(blob.size/1048576).toFixed(1)} MB). Keep this tab open.`;
  try{
   const res=await fetch('https://pipe.jspsych.org/api/base64/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({experimentID:EXPERIMENT_ID,filename,data:encoded})});
   const info=await res.json();
   if(res.status===201||res.status===202)return res.status;
   if(info.error==='FILE_EXISTS')throw Error('A video with this filename already exists. Please contact the researcher before continuing.');
   status.textContent=`Upload rejected: ${info.error||res.status}. Check your connection or contact the researcher.`;
  }catch(e){if(e.message.startsWith('A video with'))throw e;status.textContent=`Upload could not be confirmed: ${e.message}. If unsure whether it arrived, contact the researcher.`}
  const retry=button('Retry upload',()=>wake(),'secondary');status.after(retry);let wake;await new Promise(resolve=>wake=resolve);retry.remove();
 }
}
function rating(display){return new Promise(resolve=>{
 display.innerHTML=wrap('How much effort did you exert?','Trial complete');const area=display.querySelector('#content');area.innerHTML='<p>Rate the effort you actually exerted in that trial.</p><div class="scale"><span>None at all</span><div id="scale-buttons"></div><span>A great deal</span></div>';
 for(let i=1;i<=7;i++)area.querySelector('#scale-buttons').append(button(String(i),()=>resolve(i),'scale-button'));
 })}
function addDigits(digits,n){return [...digits].map(d=>(Number(d)+n)%10).join('')}
function prepareTask(t){
 if(t.task==='A')return {kind:'add',n:t.condition==='high'?3:0,digits:String(1000+Math.floor(Math.random()*9000))};
 if(t.task==='B')return {kind:'press',target:t.condition==='high'?60:10};
 const word=WORDS[t.condition][t.within_condition-1];return {kind:'anagram',word,scramble:SCRAMBLES[word]};
}
function trialFeedback(stimulus,result){
 if(stimulus.kind==='add')return result.response_status==='correct'
   ? {success:true,title:'Correct',detail:`${stimulus.digits} → ${addDigits(stimulus.digits,stimulus.n)}`}
   : {success:false,title:result.response_status==='blank'?'No answer submitted':'Incorrect',detail:`The answer was ${addDigits(stimulus.digits,stimulus.n)}.`};
 if(stimulus.kind==='press')return result.press_count>=stimulus.target
   ? {success:true,title:'Target reached',detail:`You pressed ${result.press_count} of ${stimulus.target} times.`}
   : {success:false,title:'Target not reached',detail:`You pressed ${result.press_count} of ${stimulus.target} times.`};
 return result.correct_count===1
   ? {success:true,title:'Correct',detail:`You solved the anagram.`}
   : {success:false,title:'Not solved',detail:`One answer was ${stimulus.word}.`};
}
async function runActivity(area,t,stimulus){
 const started=performance.now(),responses=[];let clicks=0,cleanup=()=>{},answer='',firstKeyMs=null,lastKeyMs=null;
 const timer=document.createElement('div');timer.className='timer';area.append(timer);
 const feedback=document.createElement('div');feedback.className='task-feedback';feedback.setAttribute('aria-live','polite');
 const drawTimer=()=>{timer.textContent=`${Math.max(0,Math.ceil((TRIAL_MS-(performance.now()-started))/1000))} seconds remaining`};
 drawTimer();const timerId=setInterval(drawTimer,100);
 if(stimulus.kind==='press'){
  area.insertAdjacentHTML('beforeend',`<p>Press the button <strong>${stimulus.target} times</strong> within 10 seconds.</p><div class="press-progress"><div id="press-fill"></div></div><div class="press-count" id="press-count">0 / ${stimulus.target}</div>`);
  const b=button('PRESS',()=>{
   if(clicks>=stimulus.target)return;
   clicks++;area.querySelector('#press-count').textContent=`${clicks} / ${stimulus.target}`;
   area.querySelector('#press-fill').style.width=`${100*clicks/stimulus.target}%`;
   responses.push({time_ms:Math.round(performance.now()-started),press:clicks});
   b.classList.remove('tap');void b.offsetWidth;b.classList.add('tap');
   if(clicks===stimulus.target){b.remove();feedback.textContent='Target reached! Wait for the timer to finish.'}
  },'press-button');area.append(b,feedback);cleanup=()=>b.remove();
 }else if(stimulus.kind==='anagram'){
  area.insertAdjacentHTML('beforeend',`<p>Unscramble the letters into an English word.</p><div class="stimulus">${stimulus.scramble}</div><label for="answer">Your answer</label><input id="answer" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12"><p class="hint">Submit a guess. You may try again until the timer ends.</p>`);
  const input=area.querySelector('#answer');const submit=button('Submit guess',()=>{
   const guess=input.value.trim().toUpperCase();if(!guess||submit.disabled)return;
   const correct=[stimulus.word,...(ALTERNATE_SOLUTIONS[stimulus.word]||[])].includes(guess);
   responses.push({answer:guess,correct,time_ms:Math.round(performance.now()-started)});
   feedback.className=`task-feedback ${correct?'good':'bad'}`;feedback.textContent=correct?'Correct!':'Not quite — try again.';
   input.value='';if(correct){input.disabled=true;submit.remove()}else input.focus();
  },'secondary');area.append(submit,feedback);
  const key=e=>{if(e.key==='Enter'){e.preventDefault();submit.click()}};
  input.addEventListener('keydown',key);input.focus();cleanup=()=>{input.removeEventListener('keydown',key);input.disabled=true;submit.remove()};
 }else{
  area.insertAdjacentHTML('beforeend',`<p>Add <strong>${stimulus.n}</strong> to each digit. If the sum is 10 or more, keep only its last digit.</p><div class="digit-sequence" id="digit-sequence" aria-live="polite"></div><div class="answer-panel" id="answer-panel" hidden><label for="answer">Enter all four resulting digits, in order</label><input id="answer" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" aria-label="Four-digit answer"><p class="hint">You have until the timer reaches zero.</p></div>`);
  const sequence=area.querySelector('#digit-sequence'),panel=area.querySelector('#answer-panel'),input=area.querySelector('#answer');
  sequence.textContent='Get ready';const scheduled=[];
  for(let i=0;i<4;i++)scheduled.push(setTimeout(()=>{sequence.innerHTML=`<span class="digit">${stimulus.digits[i]}</span><span class="digit-position">Digit ${i+1} of 4</span>`},(i+1)*1000));
  scheduled.push(setTimeout(()=>{sequence.hidden=true;panel.hidden=false;input.focus()},5000));
  const onInput=()=>{input.value=input.value.replace(/\D/g,'').slice(0,4);if(input.value){const elapsed=Math.round(performance.now()-started);firstKeyMs??=elapsed;lastKeyMs=elapsed}};input.addEventListener('input',onInput);
  cleanup=()=>{scheduled.forEach(clearTimeout);answer=input.value.trim();input.removeEventListener('input',onInput);input.disabled=true};
 }
 await sleep(TRIAL_MS);clearInterval(timerId);cleanup();
 const expected=stimulus.kind==='add'?addDigits(stimulus.digits,stimulus.n):null;
 const status=stimulus.kind==='add'?(answer===''?'blank':answer===expected?'correct':'incorrect'):null;
 if(stimulus.kind==='add')responses.push({answer,expected,status,first_key_ms:firstKeyMs,last_key_ms:lastKeyMs});
 return {responses,press_count:clicks,target:stimulus.target??null,correct_count:stimulus.kind==='add'?Number(status==='correct'):stimulus.kind==='anagram'?Number(responses.some(r=>r.correct)):null,response_status:status,first_key_ms:firstKeyMs,last_key_ms:lastKeyMs};
}
const PRACTICE=[
 {task:'A',condition:'low',stimulus:{kind:'add',n:0,digits:'2468'}},
 {task:'A',condition:'high',stimulus:{kind:'add',n:3,digits:'1374'}},
 {task:'A',condition:'high',stimulus:{kind:'add',n:3,digits:'5829'}},
 {task:'B',condition:'low',stimulus:{kind:'press',target:10}},
 {task:'B',condition:'high',stimulus:{kind:'press',target:60}},
 {task:'B',condition:'low',stimulus:{kind:'press',target:10}},
 {task:'C',condition:'low',stimulus:{kind:'anagram',word:'HAT',scramble:'TAH'}},
 {task:'C',condition:'high',stimulus:{kind:'anagram',word:'FARMING',scramble:'GMNIFAR'}},
 {task:'C',condition:'high',stimulus:{kind:'anagram',word:'DOLPHIN',scramble:'PHDILON'}}
];
const PRACTICE_INSTRUCTIONS={
 A:`<div class="instructions">
  <p>In this task, you will see four digits, one at a time. Each digit appears briefly and then disappears. After the fourth digit, a text box appears. Remember the digits and enter a four-digit answer in the same order.</p>
  <p>There are two versions. For <strong>Add 0</strong>, add zero to each digit and type the four digits you saw. For <strong>Add 3</strong>, mentally add three to each digit. If a sum is 10 or more, keep only its last digit: for example, 9 + 3 becomes 2.</p>
  <div class="instruction-example"><span>Example</span><strong>4 1 7 9</strong><span>Add 0 → <strong>4179</strong></span><span>Add 3 → <strong>7402</strong></span></div>
  <p>The first digit appears after one second; the next three follow one second apart. The answer box appears after the fourth digit and disappears when the 10-second trial ends. <strong>Do not press Enter</strong>; simply type all four digits before time runs out.</p>
  <p>You will practice both Add 0 and Add 3. After all practice tasks, the camera check begins; practice trials are not recorded.</p>
 </div>`,
 B:`<div class="instructions">
  <p>In this task, press the large on-screen button as quickly as you can. You will have <strong>10 seconds</strong> on each trial.</p>
  <p>Some trials have a target of <strong>10 presses</strong>; others have a target of <strong>60 presses</strong>. A count and progress bar show how close you are. When you reach the target, the button disappears. The trial still lasts the full 10 seconds.</p>
  <p>Use your mouse or trackpad to click the button. Try to reach the target, and keep working until the button disappears or the timer ends. You will practice both target levels. These practice trials are not recorded.</p>
 </div>`,
 C:`<div class="instructions">
  <p>In this task, you will see a scrambled set of letters. Rearrange them to make an English word, then type your guess into the answer box and select <strong>Submit guess</strong> or press Enter.</p>
  <p>Some trials use <strong>three letters</strong>; others use <strong>seven letters</strong>. You have 10 seconds for each anagram. After every submitted guess, you will see whether it is correct. If it is incorrect, you can try again while time remains. Once you solve it, wait for the timer to finish.</p>
  <p>For example, <strong>TAC</strong> can be rearranged as <strong>CAT</strong>. You will practice both lengths. These practice trials are not recorded.</p>
 </div>`
};
class PracticeTrial{
 static info={name:'practice-trial',version:'0.1.0',parameters:{},data:{}};
 constructor(jsPsych){this.jsPsych=jsPsych}
 async trial(display,t){
  display.innerHTML=wrap(TASK_NAMES[t.task],`Practice ${t.practice_number} of 3 · no recording`);
  let area=display.querySelector('#content');
  if(t.practice_number===1)area.insertAdjacentHTML('beforeend',PRACTICE_INSTRUCTIONS[t.task]);
  const specific=document.createElement('p');specific.className='practice-cue';specific.textContent=t.stimulus.kind==='add'?`This practice trial is Add ${t.stimulus.n}.`:t.stimulus.kind==='press'?`This practice trial has a target of ${t.stimulus.target} presses.`:`This practice trial has ${t.stimulus.word.length} letters.`;area.append(specific);
  await new Promise(resolve=>area.append(button('Start practice',resolve)));
  area.replaceChildren();const result=await runActivity(area,t,t.stimulus);
  const summary=trialFeedback(t.stimulus,result);
  display.innerHTML=wrap(summary.title,`Practice ${t.practice_number} of 3`);
  area=display.querySelector('#content');const detail=document.createElement('p');detail.textContent=summary.detail;area.append(detail);
  await new Promise(resolve=>area.append(button('Continue',resolve)));
  return {phase:'practice',task:t.task,task_name:TASK_NAMES[t.task],condition:t.condition,practice_number:t.practice_number,practice_correct:result.correct_count,practice_response_status:result.response_status,practice_press_count:t.stimulus.kind==='press'?result.press_count:null,video_filename:null,effort:null};
 }
}
class RecordingTrial{
 static info={name:'recording-trial',version:'0.2.0',parameters:{},data:{}};
 constructor(jsPsych){this.jsPsych=jsPsych}
 async trial(display,t){
  try{
   if(t.baseline){
    display.innerHTML=wrap('Camera check','Before you begin');const area=display.querySelector('#content');area.innerHTML='<p>We will record a short neutral-face clip now and a separate webcam clip during each task. Check your framing in the preview.</p>';
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera access requires HTTPS or localhost and a supported browser.');
    camera=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:24}},audio:false});
    if(!supportedMime())throw Error('This browser cannot record video. Use current Chrome or Edge.');
    const monitorStatus=document.createElement('p');monitorStatus.className='hint';monitorStatus.textContent='Checking live face alerts…';area.append(monitorStatus);
    faceMonitor=await setupFaceMonitor(camera);
    monitorStatus.textContent=faceMonitor?'Face alerts are active; an alert will appear if your face is not detected during a recorded trial.':'Automatic face alerts are unavailable on this device. Please keep your face visible throughout the recorded trials.';
    const preview=document.createElement('video');preview.className='video-preview';preview.autoplay=true;preview.muted=true;preview.playsInline=true;preview.srcObject=camera;area.append(preview);await preview.play();
    const settings=camera.getVideoTracks()[0].getSettings();if(settings.width<320||settings.height<240)throw Error('Camera resolution is too low. Choose another camera.');
    const checks=['My face is centered and clearly visible.','My head and shoulders are visible.','The lighting makes my face easy to see.','I am the only person in the frame.','I will keep these conditions for all 24 recorded trials.'];
    const list=document.createElement('div');list.className='checklist';area.append(list);
    for(const label of checks){const row=document.createElement('label');const box=document.createElement('input');box.type='checkbox';row.append(box,document.createTextNode(' '+label));list.append(row)}
    const status=document.createElement('p');status.className='status';area.append(status);
    const start=button('Record 5-second neutral baseline',()=>go());start.disabled=true;area.append(start);
    list.addEventListener('change',()=>{start.disabled=[...list.querySelectorAll('input')].some(x=>!x.checked)});
    let go;await new Promise(resolve=>go=resolve);start.disabled=true;status.textContent='Look at the camera with a neutral expression. Recording…';
    const rec=startRecording();await sleep(5000);const blob=await rec.stop();preview.remove();
    const filename=`${subject_id}_baseline.${blob.type==='video/mp4'?'mp4':'webm'}`;const upload_status=await sendVideo(blob,filename,status);
    return {phase:'baseline',trial_key:`${subject_id}_baseline`,video_filename:filename,upload_status,quality_confirmation:'five_checks_confirmed',camera_width:settings.width,camera_height:settings.height,face_monitor_status:faceMonitor?'active':'unavailable'};
   }
   const stimulus=prepareTask(t);
   display.innerHTML=wrap(TASK_NAMES[t.task],`Trial ${t.trial} of 24`);let area=display.querySelector('#content');
   area.innerHTML=`<p class="framing">Keep your face centered, your head and shoulders visible, and the lighting clear. Stay alone in the frame.</p><p>On this trial: <strong>${stimulus.kind==='add'?`add ${stimulus.n} to each number`:stimulus.kind==='press'?`press the button ${stimulus.target} times in 10 seconds`:`solve a ${stimulus.word.length}-letter anagram`}</strong>.</p>`;
   const ready=button('Start 10-second trial',()=>resolveReady());area.append(ready);let resolveReady;await new Promise(resolve=>resolveReady=resolve);
   area.innerHTML='';const rec=startRecording();faceMonitor?.begin();let result,blob,faceStats;
   try{result=await runActivity(area,t,stimulus)}finally{faceStats=faceMonitor?.end()||{face_alert_count:null,face_samples:null,face_monitor_status:'unavailable'};blob=await rec.stop()}
   const summary=trialFeedback(stimulus,result);
   display.innerHTML=wrap(summary.title,`Trial ${t.trial} of 24`);area=display.querySelector('#content');area.className=`feedback-screen ${summary.success?'success':'needs-work'}`;
   const detail=document.createElement('p');detail.className='feedback-detail';detail.textContent=summary.detail;
   const status=document.createElement('p');status.className='status';area.append(detail,status);
   const trial_key=`${subject_id}_trial_${String(t.trial).padStart(2,'0')}_${t.task}_${t.condition}`;
   const filename=`${trial_key}.${blob.type==='video/mp4'?'mp4':'webm'}`;
   const upload_status=await sendVideo(blob,filename,status);const effort=await rating(display);
   const guesses=stimulus.kind==='anagram'?result.responses:[];
   const lastPress=stimulus.kind==='press'&&result.press_count===stimulus.target?result.responses.at(-1):null;
   const firstCorrect=guesses.find(g=>g.correct);
   return {
    phase:'task',trial_key,task:t.task,task_name:TASK_NAMES[t.task],condition:t.condition,trial_number:t.trial,
    within_condition:t.within_condition,first_condition:t.first_condition,task_order:t.task_order,
    video_filename:filename,upload_status,effort,trial_duration_ms:TRIAL_MS,...faceStats,
    add_n:stimulus.kind==='add'?stimulus.n:null,
    add_digits:stimulus.kind==='add'?stimulus.digits:null,
    add_expected:stimulus.kind==='add'?addDigits(stimulus.digits,stimulus.n):null,
    add_response:stimulus.kind==='add'?result.responses[0].answer:null,
    add_status:stimulus.kind==='add'?result.response_status:null,
    add_first_key_ms:stimulus.kind==='add'?result.first_key_ms:null,
    add_last_key_ms:stimulus.kind==='add'?result.last_key_ms:null,
    press_target:stimulus.kind==='press'?stimulus.target:null,
    press_count:stimulus.kind==='press'?result.press_count:null,
    press_reached_target:stimulus.kind==='press'?Number(result.press_count>=stimulus.target):null,
    press_time_to_target_ms:lastPress?.time_ms??null,
    anagram_letters:stimulus.kind==='anagram'?stimulus.scramble:null,
    anagram_target_word:stimulus.kind==='anagram'?stimulus.word:null,
    anagram_guess_count:stimulus.kind==='anagram'?guesses.length:null,
    anagram_first_guess:guesses[0]?.answer??null,
    anagram_last_guess:guesses.at(-1)?.answer??null,
    anagram_correct:stimulus.kind==='anagram'?result.correct_count:null,
    anagram_solve_time_ms:firstCorrect?.time_ms??null
   };
  }catch(error){stopCamera();display.innerHTML=wrap('Study paused');display.querySelector('#content').textContent=`${error.message} Please contact the researcher using the details in the consent form.`;throw error}
 }
}
async function main(){
 try{
  if(!qualtrics_id||!/^[A-Za-z0-9_-]{1,100}$/.test(qualtrics_id))throw Error('Missing Qualtrics ResponseID: use ?rid=...');
  const trials=orderFromQualtrics();
  const practices=PRACTICE.map((p,i)=>({type:PracticeTrial,...p,practice_number:i%3+1}));
  await jsPsych.run([...practices,{type:RecordingTrial,baseline:true},...trials.map(t=>({type:RecordingTrial,...t}))]);
 }catch(e){stopCamera();console.error(e);if(!document.querySelector('.card'))document.body.innerHTML='<main class="card"><h1>Study could not start</h1><p>Check the study link or contact the researcher.</p></main>'}
}
main();
