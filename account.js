(() => {
const $=id=>document.getElementById(id);

// Go Live setup preview controls; the existing live-creation pipeline remains the source of truth.
const setupState={stream:null,muted:false,cameraOff:false,front:true,filter:0,beauty:false,mode:'live'};
const setupStatus=msg=>{const el=$('setup-status');if(el)el.textContent=msg;};
async function setupPreview(){
 if(setupState.stream||setupState.cameraOff)return;
 try{setupState.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:setupState.front?'user':'environment'},audio:false});const v=$('setup-camera-preview');v.srcObject=setupState.stream;$('setup-camera-placeholder').hidden=true;await v.play().catch(()=>{});setupStatus('Camera preview ready');}
 catch(e){setupStatus('Camera preview unavailable. Start Live can still request camera access.');}
}
function stopSetupPreview(){if(setupState.stream){setupState.stream.getTracks().forEach(t=>t.stop());setupState.stream=null;}const v=$('setup-camera-preview');if(v)v.srcObject=null;}

/* Reliable capture-phase wiring for the Go Live setup controls. */
document.addEventListener('click',async event=>{
 const button=event.target.closest('#setup-start-live,#setup-camera,#setup-mic,#setup-flip,#setup-beauty,#setup-filter,#setup-video-tab,#setup-call-tab,#setup-back');
 if(!button)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 try{
  if(button.id==='setup-start-live'){
   if(setupState.mode==='call'){setupStatus('Video Call selected. Use the existing 1-to-1 Video Call section below.');return;}
   const title=$('setup-title')?.value.trim();
   if(!title){setupStatus('Please enter a live title first.');$('setup-title')?.focus();return;}
   $('room-title').value=title;
   const kind=$('room-kind');if(kind)kind.value='live';
   setupStatus('Starting your live…');
   stopSetupPreview();
   $('create')?.click();
   return;
  }
  if(button.id==='setup-camera'){
   setupState.cameraOff=!setupState.cameraOff;
   if(setupState.cameraOff){
    stopSetupPreview();
    const placeholder=$('setup-camera-placeholder');if(placeholder){placeholder.hidden=false;const small=placeholder.querySelector('small');if(small)small.textContent='Camera is off';}
    button.classList.add('disabled');setupStatus('Camera preview turned off.');
   }else{
    const placeholder=$('setup-camera-placeholder');if(placeholder){const small=placeholder.querySelector('small');if(small)small.textContent='Tap Camera to enable preview';}
    button.classList.remove('disabled');await setupPreview();
   }
   return;
  }
  if(button.id==='setup-mic'){
   setupState.muted=!setupState.muted;button.classList.toggle('disabled',setupState.muted);
   setupStatus(setupState.muted?'Microphone selected as muted for the preview.':'Microphone selected as on.');
   return;
  }
  if(button.id==='setup-flip'){
   setupState.front=!setupState.front;stopSetupPreview();setupStatus('Switching camera…');await setupPreview();return;
  }
  if(button.id==='setup-beauty'){
   setupState.beauty=!setupState.beauty;
   const preview=$('setup-camera-preview');if(preview)preview.style.filter=setupState.beauty?'brightness(1.08) saturate(1.12) contrast(1.03)':'none';
   button.classList.toggle('selected',setupState.beauty);setupStatus(setupState.beauty?'Beauty effect enabled.':'Beauty effect disabled.');return;
  }
  if(button.id==='setup-filter'){
   setupState.filter=(setupState.filter+1)%4;
   const filters=['none','sepia(.16) saturate(1.15)','saturate(1.3) hue-rotate(-8deg)','grayscale(.12) contrast(1.06)'];
   const preview=$('setup-camera-preview');if(preview)preview.style.filter=filters[setupState.filter];
   button.classList.toggle('selected',setupState.filter!==0);setupStatus('Filter '+(setupState.filter===0?'off':'changed')+'.');return;
  }
  if(button.id==='setup-video-tab'||button.id==='setup-call-tab'){
   setupState.mode=button.id==='setup-call-tab'?'call':'live';
   $('setup-video-tab')?.classList.toggle('active',setupState.mode==='live');
   $('setup-call-tab')?.classList.toggle('active',setupState.mode==='call');
   $('setup-start-live').innerHTML=setupState.mode==='live'?'<span>◉</span> Start Live':'<span>📞</span> Continue to Video Call';
   setupStatus(setupState.mode==='live'?'Video Live selected':'Video Call selected. Use the existing 1-to-1 Video Call section below.');return;
  }
  if(button.id==='setup-back'){stopSetupPreview();location.hash='rooms';}
 }catch(error){setupStatus('Button error: '+(error?.message||'Please retry.'));}
},true);
if($('setup-start-live'))$('setup-start-live').addEventListener('click',async()=>{
 if(setupState.mode==='call'){setupStatus('Video Call selected. Use the existing 1-to-1 Video Call section below.');return;}
 const title=$('setup-title').value.trim();if(!title){setupStatus('Please enter a live title first.');$('setup-title').focus();return;}
 $('room-title').value=title;const kind=$('room-kind');if(kind)kind.value='live';
 setupStatus('Starting your live…');stopSetupPreview();$('create').click();
});
if($('setup-video-tab'))$('setup-video-tab').onclick=()=>{setupState.mode='live';$('setup-video-tab').classList.add('active');$('setup-call-tab').classList.remove('active');$('setup-start-live').innerHTML='<span>◉</span> Start Live';setupStatus('Video Live selected');};
if($('setup-call-tab'))$('setup-call-tab').onclick=()=>{setupState.mode='call';$('setup-call-tab').classList.add('active');$('setup-video-tab').classList.remove('active');$('setup-start-live').innerHTML='<span>📞</span> Continue to Video Call';setupStatus('Video Call selected. Use the existing 1-to-1 Video Call section below.');};
if($('setup-camera'))$('setup-camera').onclick=async()=>{setupState.cameraOff=!setupState.cameraOff;if(setupState.cameraOff){stopSetupPreview();$('setup-camera-placeholder').hidden=false;$('setup-camera-placeholder').querySelector('small').textContent='Camera is off';$('setup-camera').classList.add('disabled');}else{$('setup-camera-placeholder').querySelector('small').textContent='Tap Camera to enable preview';$('setup-camera').classList.remove('disabled');await setupPreview();}};
if($('setup-mic'))$('setup-mic').onclick=()=>{setupState.muted=!setupState.muted;$('setup-mic').classList.toggle('disabled',setupState.muted);setupStatus(setupState.muted?'Microphone will start muted':'Microphone will start on');};
if($('setup-flip'))$('setup-flip').onclick=async()=>{setupState.front=!setupState.front;stopSetupPreview();setupStatus('Switching camera…');await setupPreview();};
if($('setup-beauty'))$('setup-beauty').onclick=()=>{setupState.beauty=!setupState.beauty;$('setup-camera-preview').style.filter=setupState.beauty?'brightness(1.08) saturate(1.12) contrast(1.03)':'none';$('setup-beauty').classList.toggle('selected',setupState.beauty);};
if($('setup-filter'))$('setup-filter').onclick=()=>{setupState.filter=(setupState.filter+1)%4;const filters=['none','sepia(.16) saturate(1.15)','saturate(1.3) hue-rotate(-8deg)','grayscale(.12) contrast(1.06)'];$('setup-camera-preview').style.filter=filters[setupState.filter];$('setup-filter').classList.toggle('selected',setupState.filter!==0);};
if($('setup-back'))$('setup-back').onclick=()=>{stopSetupPreview();location.hash='rooms';};



// Use the single established Start Live handler below; avoid duplicate capture-phase interception.
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let endpoint=localStorage.getItem('golive_api_endpoint')||'https://go-live-stream-api.onrender.com';
let token=sessionStorage.getItem('golive_token')||localStorage.getItem('golive_token')||'';
let mediaClient=null,localTracks=[],socket=null,selectedCallUser=null,activeCallId=null,incomingPoll=null,AgoraRTCRef=null,screenTrack=null,musicTrack=null,musicElement=null,musicContext=null,musicObjectUrl=null,currentHostUserId=null,beautyIndex=0,effectIndex=0;

let giftSoundEnabled=localStorage.getItem('fun_live_gift_sound')!=='off';
let giftAudioContext=null;
function playGiftSound(kind='chime'){
 if(!giftSoundEnabled)return;
 try{
   const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
   giftAudioContext=giftAudioContext||new Ctx();
   if(giftAudioContext.state==='suspended')giftAudioContext.resume().catch(()=>{});
   const ctx=giftAudioContext;const now=ctx.currentTime;
   const notes=kind==='fanfare'?[523.25,659.25,783.99,1046.5]:kind==='sparkle'?[880,1174.66,1567.98]:kind==='pop'?[440,660]:[659.25,880,1174.66];
   notes.forEach((freq,i)=>{
     const osc=ctx.createOscillator(),gain=ctx.createGain();
     osc.type=kind==='fanfare'?'triangle':'sine';osc.frequency.setValueAtTime(freq,now+i*.105);
     gain.gain.setValueAtTime(.0001,now+i*.105);gain.gain.exponentialRampToValueAtTime(.12,now+i*.105+.018);gain.gain.exponentialRampToValueAtTime(.0001,now+i*.105+.24);
     osc.connect(gain);gain.connect(ctx.destination);osc.start(now+i*.105);osc.stop(now+i*.105+.26);
   });
 }catch(e){/* Sound is optional; gift sending must continue if audio is unavailable. */}
}
document.addEventListener('pointerdown',()=>{if(giftAudioContext?.state==='suspended')giftAudioContext.resume().catch(()=>{});},{passive:true});
function setGiftSoundButton(){
 document.querySelectorAll('.gift-sound-toggle').forEach(b=>{b.textContent=giftSoundEnabled?'🔊 Gift sound: ON':'🔇 Gift sound: OFF';b.setAttribute('aria-pressed',String(giftSoundEnabled));});
}
function setupPrivateCallPrivacy(){
 const root=document.querySelector('.private-call-ui');if(!root||root.dataset.privacyReady)return;
 root.dataset.privacyReady='1';
 const note=document.createElement('p');note.className='private-call-privacy-note';note.textContent='🔒 Private call: screenshots and recordings are not allowed. Web browsers cannot fully block device-level capture.';
 const controls=root.querySelector('.private-call-controls');if(controls)controls.before(note);
 root.addEventListener('contextmenu',e=>e.preventDefault());
 root.addEventListener('dragstart',e=>e.preventDefault());
 const obscure=()=>root.classList.add('privacy-obscured');
 const restore=()=>root.classList.remove('privacy-obscured');
 document.addEventListener('visibilitychange',()=>{if(document.hidden)obscure();else restore();});
 window.addEventListener('pagehide',obscure);
 window.addEventListener('pageshow',restore);
}
function status(s){
 let el=$('status');
 const rooms=$('rooms');
 if(rooms && getComputedStyle(rooms).display!=='none'){
   el=$('rooms-status');
   if(!el){el=document.createElement('p');el.id='rooms-status';el.setAttribute('role','status');el.className='note';el.style.cssText='display:block;padding:12px;margin:12px 0;border-radius:12px;background:#24182f;color:#fff;border:1px solid #ff329d;white-space:pre-wrap;overflow-wrap:anywhere';rooms.prepend(el);}
 }else if(!el){return}
 el.textContent=s;
 el.style.cssText='display:block;padding:12px;margin:12px 0;border-radius:12px;background:#24182f;color:#fff;border:1px solid #ff329d;white-space:pre-wrap;overflow-wrap:anywhere';
}
async function call(path,method='GET',body){
 if(!endpoint)throw Error('API address is missing.');
 const response=await fetch(endpoint+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const json=await response.json().catch(()=>({error:'Invalid API response'}));
 if(!response.ok)throw Error(json.error||'Request failed');return json;
}
async function action(fn){try{await fn()}catch(e){status('⚠️ '+(e.message||'Something went wrong.'));const visibleStatus=$('rooms-status')||$('status');visibleStatus?.scrollIntoView({behavior:'smooth',block:'center'});}}
function accountLabel(user){const u=typeof user==='string'?{username:user}:user; $('account').textContent='Signed in as '+u.username+(u.id?' · FUN LIVE ID: '+String(7000000+Number(u.id)):''); if(u.id){localStorage.setItem('golive_user',JSON.stringify({id:u.id,username:u.username,email:u.email||''}));$('logout').hidden=false;}else $('logout').hidden=true;}
$('register').onclick=()=>action(async()=>{
 const r=await call('/api/auth/register','POST',{email:$('email').value,password:$('password').value,gender:$('register-gender')?.value||'unspecified'});
 token=r.token;sessionStorage.setItem('golive_token',token);localStorage.setItem('golive_token',token);accountLabel(r.user);$('password').value='';$('profile-gender').value=r.user.gender||$('register-gender').value;status('Account created with email. You are signed in.');window.location.replace('account.html#rooms');
});
$('login').onclick=()=>action(async()=>{
 const r=await call('/api/auth/login','POST',{email:$('email').value,password:$('password').value});
 token=r.token;sessionStorage.setItem('golive_token',token);localStorage.setItem('golive_token',token);accountLabel(r.user);await loadProfileGender();status('Signed in successfully.');window.location.replace('account.html#rooms');
});
async function loadWithdrawalSummary(){
 const box=$('withdrawal-summary');if(!box)return;
 try{
  const r=await call('/api/withdrawal/summary');
  const diamonds=Number(r.diamonds)||0, minimum=Number(r.minimumDiamonds)||10000;
  const perUsd=Number(r.diamondsPerUSD)||9500, usdRate=Number(r.usdInrRate)||95;
  const usd=diamonds/perUsd, inr=usd*usdRate;
  const display=$('withdrawal-diamond-display');
  if(display)display.innerHTML='💎 '+diamonds.toLocaleString()+' <small>diamonds available</small>';
  box.innerHTML='<h3>💱 Conversion Rate</h3>'+
   '<div class="withdrawal-rate-row"><span class="withdrawal-rate-icon">💎</span><span><b>'+perUsd.toLocaleString()+' diamonds = $1 USD</b></span></div>'+
   '<div class="withdrawal-rate-row"><span class="withdrawal-rate-icon">₹</span><span><b>$1 USD = ₹'+usdRate.toLocaleString('en-IN')+' INR</b></span></div>'+
   '<div class="withdrawal-rate-row"><span class="withdrawal-rate-icon">💰</span><span>Available value: <b>$'+usd.toFixed(2)+' · ₹'+inr.toFixed(2)+'</b></span></div>';
  const estimate=$('withdrawal-estimate');
  if(estimate)estimate.textContent='10,000 diamonds ≈ $'+(10000/perUsd).toFixed(2)+' USD ≈ ₹'+((10000/perUsd)*usdRate).toFixed(2)+' INR';
  const amount=$('withdrawal-diamonds');
  if(amount){amount.min=String(minimum);amount.placeholder='Minimum '+minimum.toLocaleString()+' diamonds';}
  const history=$('withdrawal-history');
  if(history){
   history.innerHTML=(r.requests||[]).length?(r.requests.map(x=>'<div class="withdrawal-history-card"><div><strong>'+Number(x.diamonds).toLocaleString()+' diamonds</strong> · ₹'+Number(x.inrAmount||0).toFixed(2)+'</div><div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px"><span>$'+Number(x.usdAmount||0).toFixed(2)+' USD</span><span class="withdrawal-status-pill">'+safe(x.status||'pending').toUpperCase()+'</span></div><small>'+safe(x.createdAt||x.created_at||'')+'</small></div>').join('')):'<p class="note">No withdrawal requests yet.</p>';
  }
 }catch(e){box.textContent='Sign in to view your diamonds and conversion rate. '+(e.message||'');}
}
$('withdrawal-diamonds')?.addEventListener('input',()=>{
 const n=Math.max(0,Number($('withdrawal-diamonds').value)||0);
 const summary=$('withdrawal-summary');
 const rateText=summary?.textContent||'';
 const perUsd=Number(rateText.match(/([\d,]+) diamonds = \$1 USD/)?.[1]?.replace(/,/g,''))||9500;
 const usdRate=Number(rateText.match(/\$1 USD = ₹([\d,]+)/)?.[1]?.replace(/,/g,''))||95;
 const estimate=$('withdrawal-estimate');
 if(estimate)estimate.textContent=n?('Estimated: '+n.toLocaleString()+' diamonds ≈ $'+(n/perUsd).toFixed(2)+' USD ≈ ₹'+((n/perUsd)*usdRate).toFixed(2)+' INR'):'Enter an amount to see the estimated USD and INR value.';
});
$('submit-withdrawal')?.addEventListener('click',()=>action(async()=>{
 const diamonds=Number($('withdrawal-diamonds').value);
 const payout=$('withdrawal-payout').value.trim();
 if(!Number.isInteger(diamonds)||diamonds<10000)throw Error('Minimum withdrawal is 10,000 diamonds.');
 if(!payout)throw Error('Enter your UPI ID or bank payout details.');
 const button=$('submit-withdrawal');button.disabled=true;button.textContent='Submitting request…';
 try{
  const result=await call('/api/withdrawals','POST',{diamonds,payoutDetails:payout});
  status('Withdrawal request submitted. It is pending manual review; no automatic payout has been made.');
  $('withdrawal-diamonds').value='';await loadWithdrawalSummary();
 }finally{button.disabled=false;button.textContent='Request Withdrawal →';}
}));
$('save-gender').onclick=()=>action(async()=>{
 const gender=$('profile-gender').value;
 if(!['male','female','other'].includes(gender))throw Error('Choose Male, Female, or Other.');
 const r=await call('/api/me','PATCH',{gender});
 $('profile-gender').value=r.user.gender;
 status('Profile gender saved.');
});
async function loadProfileGender(){try{const r=await call('/api/me');if(r.user?.gender)$('profile-gender').value=r.user.gender;}catch{} await loadWithdrawalSummary();}
$('logout').onclick=async()=>{await leaveMedia();token='';sessionStorage.removeItem('golive_token');localStorage.removeItem('golive_token');accountLabel('Signed out.');localStorage.removeItem('golive_user');status('You have signed out.')};
$('refresh').onclick=()=>action(async()=>{
 const r=await call('/api/rooms');const lives=r.rooms.filter(x=>x.kind==='live');$('room-list').innerHTML=lives.length?lives.map(x=>'<div class="row"><span>'+safe(x.title)+'</span><small>Live #'+safe(x.id)+' · '+safe(x.host)+'</small><button class="primary" data-join="'+safe(x.id)+'">Watch Live</button></div>').join(''):'<p>No live streams right now.</p>';status('Live streams refreshed.');
});
$('create').onclick=()=>action(async()=>{
 const btn=$('create');const original=btn.textContent;btn.disabled=true;btn.textContent='Connecting…';
 try{
  if(!token){status('Signing you in securely…');const guest=await call('/api/auth/guest','POST',{});if(!guest?.token)throw Error('Guest sign-in failed. Please reload and try again.');token=guest.token;sessionStorage.setItem('golive_token',token);localStorage.setItem('golive_token',token);if(guest.user)accountLabel(guest.user);}
  const title=$('room-title').value.trim();if(!title)throw Error('Pehle live title likho.');
  status('Creating your live room…');const r=await call('/api/rooms','POST',{title,kind:'live'});if(!r?.room?.id)throw Error('Room create nahi hua. Please retry.');
  $('room-id').value=r.room.id;$('room-id-label').textContent='Live room #'+r.room.id+' — share this number with viewers.';status('Room created. Connecting camera and microphone…');await joinMedia(r.room.id);await loadRooms();
 }catch(e){status('❌ Live start nahi hua: '+(e.message||'Unknown error')+'. Camera permission aur internet check karke try karo.');throw e;}finally{btn.disabled=false;btn.textContent=original;}
});
async function loadRooms(){const r=await call('/api/rooms');$('room-list').innerHTML=r.rooms.length?r.rooms.map(x=>'<div class="row"><span>'+safe(x.title)+' ('+safe(x.kind)+')</span><small>Room #'+safe(x.id)+' · '+safe(x.host)+'</small><button class="primary" data-join="'+safe(x.id)+'">Join media</button></div>').join(''):'<p>No rooms yet.</p>'}
$('history').onclick=()=>action(async()=>{
 const id=$('room-id').value.trim();if(!/^\d+$/.test(id))throw Error('Enter a numeric room ID.');
 const r=await call('/api/rooms/'+id+'/messages');
 $('messages').innerHTML=r.messages.map(m=>'<div class="chat"><b>'+safe(m.username)+':</b> '+safe(m.body)+'</div>').join('');status('Saved messages loaded.');
});
async function ensureScript(src,globalName){if(window[globalName])return;await new Promise((resolve,reject)=>{const s=document.createElement('script');let settled=false;const finish=(err)=>{if(settled)return;settled=true;clearTimeout(timer);s.onload=null;s.onerror=null;err?reject(err):resolve()};const timer=setTimeout(()=>finish(Error('Chat library download timed out. Check internet connection and reload.')),10000);s.src=src;s.onload=()=>finish();s.onerror=()=>finish(Error('Could not load chat library. Check internet connection.'));document.head.appendChild(s)})}
async function setupLiveChat(roomId){
 if(!token)throw Error('Sign in again to connect live chat.');
 if(!/^\d+$/.test(String(roomId||'')))throw Error('Live room ID is missing.');
 await ensureScript(endpoint.replace(/\/$/, '')+'/socket.io/socket.io.js','io');
 if(!socket||!socket.connected){
   if(socket)try{socket.disconnect()}catch{}
   socket=window.io(endpoint,{auth:{token},transports:['polling','websocket'],upgrade:true,rememberUpgrade:false,timeout:10000,reconnection:true,reconnectionAttempts:5,reconnectionDelay:800,forceNew:true});
   await new Promise((resolve,reject)=>{
     let settled=false;
     const finish=(err)=>{if(settled)return;settled=true;clearTimeout(timer);socket.off('connect',onConnect);socket.off('connect_error',onError);err?reject(err):resolve()};
     const onConnect=()=>finish();
     const onError=e=>finish(Error('Chat connection failed: '+(e.message||'server unreachable')));
     const timer=setTimeout(()=>finish(Error('Chat server did not respond within 8 seconds.')),8000);
     socket.on('connect',onConnect);
     socket.on('connect_error',onError);
   });
 }
 socket.__activeLiveRoom=String(roomId);
 const emitAck=(event,payload)=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error(event+' acknowledgement timed out.')),5000);
   socket.emit(event,payload,result=>{clearTimeout(timer);resolve(result||{});});
 });
 const joined=await emitAck('room:join',{roomId:String(roomId)});
 if(joined?.error)throw Error(joined.error);
 const liveJoined=await emitAck('live:join',{roomId:String(roomId)});
 if(liveJoined?.error)throw Error(liveJoined.error);
 const countEl=$('host-viewer-count');
 if(countEl){countEl.dataset.count=String(Math.max(0,Number(liveJoined.count||1)-1));countEl.textContent=countEl.dataset.count+' viewers';}
 if(socket.__liveCountHandler)socket.off('live:count',socket.__liveCountHandler);
 socket.__liveCountHandler=payload=>{
   if(String(payload.roomId)!==String(roomId))return;
   const viewerCount=$('host-viewer-count');
   if(viewerCount)viewerCount.textContent=Math.max(0,Number(payload.count||0)-1)+' viewers';
 };
 socket.on('live:count',socket.__liveCountHandler);
 if(socket.__liveViewersHandler)socket.off('live:viewers',socket.__liveViewersHandler);
 socket.__liveViewersHandler=payload=>{
   if(String(payload.roomId)!==String(roomId))return;
   const list=$('host-viewer-list');if(!list)return;
   const viewers=Array.isArray(payload.viewers)?payload.viewers:[];
   list.innerHTML=viewers.length?'<b>👥 In this live ('+viewers.length+')</b>'+viewers.map(v=>'<div class="host-viewer-entry"><span class="host-viewer-dot"></span>'+safe(v.username)+'</div>').join(''):'<b>👥 Viewers</b><div class="host-viewer-empty">Waiting for viewers…</div>';
 };
 socket.on('live:viewers',socket.__liveViewersHandler);
 if(socket.__liveViewerEnterHandler)socket.off('live:viewer-enter',socket.__liveViewerEnterHandler);
 socket.__liveViewerEnterHandler=payload=>{
   if(String(payload.roomId)!==String(roomId))return;
   const overlay=$('host-chat-overlay');if(!overlay)return;
   const line=document.createElement('div');line.className='host-chat-message host-viewer-join-notice';
   line.textContent='👋 '+String(payload.username||'Viewer')+' joined the live';
   overlay.appendChild(line);while(overlay.children.length>4)overlay.firstElementChild.remove();
 };
 socket.on('live:viewer-enter',socket.__liveViewerEnterHandler);
 if(socket.__liveChatHandler)socket.off('room:message',socket.__liveChatHandler);
 socket.__liveChatHandler=message=>{
   const messageRoom=String(message.room_id??message.roomId??'');
   if(messageRoom!==String(roomId))return;
   const overlays=[$('host-chat-overlay'),$('viewer-chat-overlay')].filter(Boolean);
   overlays.forEach(overlay=>{
     const id=String(message.id??'');
     if(id&&overlay.querySelector('[data-message-id="'+CSS.escape(id)+'"]'))return;
     const line=document.createElement('div');line.className='host-chat-message';
     if(id)line.dataset.messageId=id;
     const rawName=String(message.username||'User');const displayName=/^guest_[a-f0-9]+$/i.test(rawName)?'Subha':rawName;const name=document.createElement('b');name.textContent=displayName+' ';
     name.style.cssText='font-weight:800;color:#fff';
     const level=document.createElement('span');level.textContent='Lv.1';level.setAttribute('aria-label','Level 1');level.style.cssText='display:inline-block;margin:0 5px 0 2px;padding:1px 6px;border-radius:8px;background:linear-gradient(90deg,#ff329d,#8b5cf6);color:#fff;font-size:10px;font-weight:800;vertical-align:middle';
     const colon=document.createTextNode(': ');
     const body=document.createElement('span');body.textContent=String(message.body||'');
     line.append(name,level,colon,body);overlay.appendChild(line);
     while(overlay.children.length>4)overlay.firstElementChild.remove();
   });
 };
 socket.on('room:message',socket.__liveChatHandler);
 if(socket.__liveGiftHandler)socket.off('live:gift',socket.__liveGiftHandler);
 socket.__liveGiftHandler=gift=>{
   if(String(gift.room_id)!==String(roomId))return;
   const overlay=$('host-chat-overlay')||$('viewer-chat-overlay');
   if(overlay){const line=document.createElement('div');line.className='host-chat-message';line.textContent=(gift.emoji||'🎁')+' '+String(gift.sender||'Viewer')+' sent '+String(gift.label||gift.gift_key||'a gift');overlay.appendChild(line);while(overlay.children.length>4)overlay.firstElementChild.remove();}
   const history=$('host-gift-history');
   if(history){if(history.textContent==='No gifts yet.')history.textContent='';const item=document.createElement('p');item.textContent=(gift.emoji||'🎁')+' '+String(gift.sender||'Viewer')+' · '+String(gift.label||gift.gift_key)+' (host +'+String(gift.hostCoins??Math.floor((Number(gift.coins)||0)*0.6))+' coins)';history.prepend(item);while(history.children.length>10)history.lastElementChild.remove();}
   const liveBox=document.querySelector('.host-live-ui,.live-viewer-ui');if(liveBox){const burst=document.createElement('div');burst.className='gift-burst';burst.textContent=gift.emoji||'🎁';liveBox.appendChild(burst);setTimeout(()=>burst.remove(),1600);}
   playGiftSound(gift.sound||((Number(gift.coins)||0)>=500?'fanfare':'chime'));
 };
 socket.on('live:gift',socket.__liveGiftHandler);
}
// Always prevent the comment form's native submit/reload, even when chat connection is offline.
document.addEventListener('submit',async e=>{
 const form=e.target;
 if(!form || form.id!=='host-comment-form')return;
 e.preventDefault();
 e.stopPropagation();
 const input=form.querySelector('#host-comment-input');
 const send=form.querySelector('button[type="submit"]');
 const body=(input?.value||'').trim();
 if(!body)return;
 // Prefer the room ID passed into joinMedia: the shared account form field can be stale
 // when the live UI has been rendered or a previous room was left.
 let roomId=String(form.dataset.roomId||form.closest('[data-live-room-id]')?.dataset.liveRoomId||window.__funLiveActiveRoomId||socket?.__activeLiveRoom||$('room-id')?.value.trim()||'').trim();
 // Last-resort recovery from the room number visibly rendered on this exact live card.
 if(!/^\d+$/.test(roomId)){
   const liveCard=form.closest('.host-live-ui,.live-viewer-ui')||document.querySelector('.host-live-ui,.live-viewer-ui');
   const visibleRoom=[...(liveCard?.querySelectorAll('.host-room-strip span')||[])].map(el=>el.textContent||'').join(' ');
   const match=visibleRoom.match(/Room\s*#?\s*(\d+)/i);
   if(match)roomId=match[1];
 }
 if(!socket||!socket.connected){
   const note=document.createElement('div');
   note.className='live-comment-notice';
   note.setAttribute('role','status');
   note.style.cssText='padding:8px;margin-top:6px;border:1px solid #ff3297;border-radius:10px;background:#24132e;color:#fff;font-size:12px';
   note.textContent='Reconnecting live chat…';
   form.insertAdjacentElement('afterend',note);
   try{await setupLiveChat(roomId)}catch(err){note.textContent='Comment not sent: '+(err.message||'chat is offline')+'. Live remains on.';return;}
   if(!socket||!socket.connected){note.textContent='Comment not sent: chat is offline. Live remains on.';return;}
 }
 if(!/^\d+$/.test(roomId)){
   const fallback=String(form.dataset.roomId||form.closest('.host-live-ui,.live-viewer-ui')?.dataset.liveRoomId||'').trim();
   if(/^\d+$/.test(fallback)){
     roomId=fallback;window.__funLiveActiveRoomId=fallback;
   }else{
     const note=form.parentElement?.querySelector('.live-comment-notice')||form.nextElementSibling;
     if(note?.classList.contains('live-comment-notice'))note.textContent='Comment not sent: live room ID is missing. Close this live and start a fresh room.';
     else status('Comment not sent: live room ID is missing. Close this live and start a fresh room.');
     return;
   }
 }
 if(send)send.disabled=true;
 try{
   const result=await new Promise((resolve,reject)=>{
     let settled=false;
     const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);socket.off('room:message',onBroadcast);err?reject(err):resolve(value)};
     const onBroadcast=message=>{
       if(String(message.room_id??message.roomId??'')===String(roomId)&&String(message.body||'')===body)finish(null,{ok:true,message,confirmedByBroadcast:true});
     };
     const timer=setTimeout(()=>finish(Error('Chat delivery was not confirmed. Please check the chat before retrying.')),12000);
     socket.on('room:message',onBroadcast);
     socket.emit('room:message',{roomId,body},result=>{
       if(result?.error)return finish(Error(result.error));
       if(result?.message)return finish(null,result);
       // If the broadcast arrived but the acknowledgement was empty, the broadcast is enough to confirm delivery.
       if(result?.ok)return finish(null,result);
     });
   });
   if(result?.error)throw Error(result.error);
   if(result?.message && socket.__liveChatHandler)socket.__liveChatHandler(result.message);
   input.value='';
   const note=form.parentElement?.querySelector('.live-comment-notice')||form.nextElementSibling;
   if(note?.classList.contains('live-comment-notice'))note.textContent='✓ Comment sent';
 }catch(err){
   let note=form.parentElement?.querySelector('.live-comment-notice')||form.nextElementSibling;
   if(!note||!note.classList.contains('live-comment-notice')){note=document.createElement('div');note.className='live-comment-notice';note.style.cssText='padding:8px;margin-top:6px;border:1px solid #ff3297;border-radius:10px;background:#24132e;color:#fff;font-size:12px';form.insertAdjacentElement('afterend',note);}
   note.textContent='Comment not sent: '+(err.message||'Try again.')+'. Your live should remain active.';
 }finally{
   if(send)send.disabled=false;
 }
},true);
async function joinMedia(id){
 if(!token)throw Error('Please sign in first.');
 await leaveMedia();
 const roomName='room-'+id;
 const data=await call('/api/live/token','POST',{roomName});
 const mod=await import('https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4.24.1/+esm');
 const AgoraRTC=mod.default||mod;
 AgoraRTCRef=AgoraRTC;
 const box=$('media-view');
 const isHost=data.role==='host' && data.mode==='live';
 if(isHost){
   window.__femaleMissionRoomId=String(id);
   clearInterval(window.__femaleMissionHeartbeat);
   const beat=()=>call('/api/female-host-mission/heartbeat','POST',{roomId:String(id)}).catch(()=>{});
   beat();
   window.__femaleMissionHeartbeat=setInterval(beat,30000);
 }

 const liveTitle=$('room-title')?.value.trim()||'My Live';
 box.innerHTML = isHost
 ? `<div class="host-live-ui"><div class="host-live-top"><div class="host-profile-block"><div class="host-avatar" aria-hidden="true">${safe((JSON.parse(localStorage.getItem("golive_user")||"{}").username||liveTitle).slice(0,1).toUpperCase())}</div><div class="host-title-block"><b>${safe((JSON.parse(localStorage.getItem("golive_user")||"{}").username)||liveTitle)}</b><small>ID: <span id="host-user-id">${safe((()=>{const u=JSON.parse(localStorage.getItem("golive_user")||"{}");return u.goLiveId||(u.id?String(7000000+Number(u.id)):String(data.hostUserId||"000000"))})())}</span> <button type="button" class="host-copy-user" id="host-copy-user" aria-label="Copy user ID">▢</button></small><small class="host-viewer-mini">👥 <span id="host-viewer-count">0</span></small></div></div><span class="host-live-badge">🔴 LIVE</span><button type="button" class="host-task-button task-icon-2" id="host-task-button" aria-label="Tasks and missions" aria-expanded="false"><span class="task-clipboard-icon" aria-hidden="true"><svg viewBox="0 0 48 48" focusable="false"><defs><linearGradient id="taskClipGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8df1"/><stop offset="1" stop-color="#8d35ff"/></linearGradient></defs><rect x="9" y="7" width="27" height="35" rx="5" fill="#fff0ff" stroke="url(#taskClipGrad)" stroke-width="3"/><rect x="16" y="3" width="13" height="8" rx="3" fill="#c65cff" stroke="#ffe1ff" stroke-width="2"/><path d="M15 20l4 4 7-8" fill="none" stroke="#e72aab" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 31l4 4 7-8" fill="none" stroke="#a83bff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M37 24l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z" fill="#ffd85c" stroke="#ff9c36" stroke-width="1.5"/></svg></span></button><button type="button" class="host-more host-more-top" id="host-more-top" aria-label="More live tools" aria-expanded="false">•••</button><button type="button" class="host-exit" id="host-exit" aria-label="Leave live">×</button></div><div class="host-room-strip"><span>🪙 <b id="host-wallet-balance">100</b> coins</span><button type="button" id="host-copy-room">▢ Copy ID</button></div><div id="media-connection-status" class="host-live-status">Connecting to live stream…</div><div class="host-feature-bar" id="host-feature-menu" hidden><button type="button" id="flip-camera">📷 Flip</button><button type="button" id="beauty-mode">✨ Beauty</button><button type="button" id="live-effects">🎭 Effects</button><button type="button" id="live-music">🎵 Music</button><button type="button" id="screen-share">🖥️ Share Screen</button><button type="button" id="report-live">🚩 Report</button><button type="button" id="host-gift-menu">🎁 Gift</button><button type="button" id="host-coins-menu">🪙 Coins</button><input id="live-music-file" type="file" accept="audio/*" hidden></div><div id="agora-local" class="host-video"></div><div class="host-chat-overlay" id="host-chat-overlay"><div class="host-chat-message">🎉 Your live has started. Welcome viewers!</div></div><div class="host-viewer-list" id="host-viewer-list"><b>👥 Viewers</b><div class="host-viewer-empty">Waiting for viewers…</div></div><div class="host-hearts" aria-hidden="true">💗<br>💖</div><div class="host-live-bottom"><button type="button" class="host-more host-more-bottom" id="host-more-bottom" aria-label="More live tools" aria-expanded="false">•••</button><form class="host-comment-form" id="host-comment-form"><input id="host-comment-input" maxlength="500" placeholder="Write a comment…" aria-label="Write a live comment"><button type="submit" aria-label="Send comment">➤</button></form><button type="button" class="host-mic-toggle" id="host-mic-toggle" aria-label="Mute microphone">🎙️</button><button type="button" class="host-share" id="host-share" aria-label="Share live">↗</button><button type="button" class="host-gift" id="host-gift">🎁<small>Gift</small></button></div><div id="host-settings-panel" class="host-settings-panel" hidden><div class="host-settings-heading"><b>⚙️ Host Settings</b><button type="button" id="host-settings-close" aria-label="Close host settings">×</button></div><div class="host-settings-grid">
<button type="button" data-host-setting="mute">🎙️<span>Mute / Unmute</span></button>
<button type="button" data-host-setting="chat">💬<span>Chat Settings</span></button>
<button type="button" data-host-setting="block">🚫<span>Block User</span></button>
<button type="button" data-host-setting="moderator">🛡️<span>Admin / Moderator</span></button>
<button type="button" data-host-setting="privacy">🔒<span>Privacy</span></button>
<button type="button" data-host-setting="guests">👥<span>Guest Permissions</span></button>
<button type="button" data-host-setting="history">🎁<span>Gift History</span></button>
<button type="button" data-host-setting="earnings">🪙<span>Gift Earnings</span></button>
<button type="button" data-host-setting="balance">💰<span>Coin Balance</span></button>
<button type="button" data-host-setting="star">⭐<span>Star Target</span></button>
<button type="button" data-host-setting="share">↗<span>Share Live</span></button>
<button type="button" data-host-setting="report">🚩<span>Report Live</span></button>
</div><div id="host-settings-detail" class="host-settings-detail" aria-live="polite">Choose a setting to manage your live.</div></div><div id="host-task-panel" class="host-task-panel" hidden><div class="host-task-heading"><b>📋 Tasks & Missions</b><button type="button" id="host-task-close" aria-label="Close tasks">×</button></div><div class="host-task-item"><span>🎥 Start a live stream <b class="host-task-status">✓ Active</b></span><small>Your live stream is running.</small></div><div class="host-task-item"><span>💬 Welcome your viewers</span><small>Send a welcome comment to your audience.</small><button type="button" id="host-task-welcome">💬 Write welcome comment</button></div><div class="host-task-item"><span>↗ Share your live</span><small>Invite friends to watch your stream.</small><button type="button" id="host-task-share">↗ Share live link</button></div><p class="host-task-note" id="host-task-status-note">Complete these actions to engage your viewers. Mission rewards are not enabled yet.</p></div><div id="host-gift-panel" class="host-gift-panel" hidden><b>🎁 Gifts & Coins</b><div class="host-gift-coins">🪙 <b id="host-gift-coin-balance">100</b> coins</div><button type="button" class="gift-sound-toggle" aria-pressed="true">🔊 Gift sound: ON</button><div class="host-gift-catalog-title">🎁 Gifts available to receive</div><div class="host-gift-pages"><section class="host-gift-page"><h4>💗 Gifts 1/2</h4><div class="host-gift-catalog"><div>🌹<small>Rose</small><b>1K</b></div><div>💖<small>Heart</small><b>2K</b></div><div>🍦<small>Ice Cream</small><b>5K</b></div><div>🧸<small>Teddy</small><b>10K</b></div><div>💍<small>Diamond Ring</small><b>20K</b></div><div>🍫<small>Chocolate</small><b>30K</b></div><div>🚗<small>Love Car</small><b>50K</b></div><div>✈️<small>Airplane</small><b>1L</b></div></div></section><section class="host-gift-page"><h4>✨ Gifts 2/2</h4><div class="host-gift-catalog"><div>🛥️<small>Yacht</small><b>2L</b></div><div>🏰<small>Castle</small><b>5L</b></div><div>🎆<small>Fireworks</small><b>5K</b></div><div>🚂<small>Love Train</small><b>10K</b></div><div>🦅<small>Phoenix</small><b>20K</b></div><div>🌌<small>Galaxy</small><b>50K</b></div><div>🌠<small>Universe</small><b>1L</b></div></div></section></div><div class="host-gift-history-title">🎉 Gifts received</div><div id="host-gift-history">No gifts yet.</div><small>Virtual test coins only.</small></div></div><div id="agora-remote" style="display:none"></div>`
 : data.mode==='rtc' ? `<div class="private-call-ui"><div class="private-call-top"><button type="button" id="private-call-close" aria-label="End call">×</button><div><b>🔒 Private Video Call</b><small id="private-call-status">Connecting securely…</small></div><span class="private-call-rate">2,000 coins/min</span></div><div class="private-call-stage"><div id="agora-remote" class="private-call-remote"><div class="private-call-wait">📹 Connecting video…</div></div><div id="agora-local" class="private-call-local"></div><div class="private-call-timer" id="private-call-timer">00:00</div></div><div class="private-call-controls"><button type="button" id="private-toggle-mic">🎙️ Mute</button><button type="button" id="private-toggle-camera">📷 Camera Off</button><button type="button" id="private-switch-camera">🔄 Flip</button><button type="button" id="private-end-call">📞 End Call</button></div><p class="private-call-safety">🔒 Private call · Only the two participants can join</p></div>`
 : `<div class="live-viewer-ui"><div id="media-connection-status" class="note" style="margin-bottom:10px">Connecting to ${safe(data.mode==='rtc'?'1-to-1 call':'live stream')}…</div><div class="host-follow-row"><button type="button" id="follow-host">＋ Follow Host</button><button type="button" class="live-action-btn" id="report-live">🚩 Report Live</button></div><div id="agora-local" style="display:block;width:100%;min-height:220px;height:42vh;max-height:420px;border-radius:14px;background:#080611;overflow:hidden"></div><div id="agora-remote" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"></div><div id="viewer-chat-overlay" class="host-chat-overlay"></div><form class="host-comment-form viewer-comment-form" id="host-comment-form"><input id="host-comment-input" maxlength="500" placeholder="Write a comment…" aria-label="Write a live comment"><button type="submit" aria-label="Send comment">➤</button></form><div class="viewer-gift-bar"><span>🪙 <b id="viewer-wallet-balance">100</b> coins</span><button type="button" id="viewer-gift-open">🎁 Send Gift</button></div><div id="viewer-gift-panel" class="host-gift-panel" hidden><b>🎁 Send a gift</b><button type="button" class="gift-sound-toggle" aria-pressed="true">🔊 Gift sound: ON</button><button type="button" id="gift-test-coins">🪙 Add 100,000 free test coins</button><small>One-time testing grant per account.</small><div class="gift-catalog-grid"><button type="button" data-send-gift="rose">🌹 Rose · 1,000 <span>🔊</span></button><button type="button" data-send-gift="heart">💖 Heart · 2,000 <span>🔊</span></button><button type="button" data-send-gift="icecream">🍦 Ice Cream · 5,000 <span>🔊</span></button><button type="button" data-send-gift="teddy">🧸 Teddy · 10,000 <span>🔊</span></button><button type="button" data-send-gift="ring">💍 Diamond Ring · 20,000 <span>🔊</span></button><button type="button" data-send-gift="chocolate">🍫 Chocolate · 30,000 <span>🔊</span></button><button type="button" data-send-gift="lovecar">🚗 Love Car · 50,000 <span>🔊</span></button><button type="button" data-send-gift="airplane">✈️ Airplane · 1,00,000 <span>🔊</span></button><button type="button" data-send-gift="yacht">🛥️ Yacht · 2,00,000 <span>🔊</span></button><button type="button" data-send-gift="castle">🏰 Castle · 5,00,000 <span>🔊</span></button><button type="button" data-send-gift="firework">🎆 Fireworks · 5,000 <span>🔊</span></button><button type="button" data-send-gift="lovetrain">🚂 Love Train · 10,000 <span>🔊</span></button><button type="button" data-send-gift="phoenix">🦅 Phoenix · 20,000 <span>🔊</span></button><button type="button" data-send-gift="galaxy">🌌 Galaxy · 50,000 <span>🔊</span></button><button type="button" data-send-gift="universe">🌠 Universe · 100,000 <span>🔊</span></button></div><small>Promotional test coins only; no cash value.</small></div></div>`
 $('room-id').value=String(id);window.__funLiveActiveRoomId=String(id);const activeLiveBox=box.querySelector('.host-live-ui,.live-viewer-ui');if(activeLiveBox)activeLiveBox.dataset.liveRoomId=String(id);const activeCommentForm=box.querySelector('#host-comment-form');if(activeCommentForm)activeCommentForm.dataset.roomId=String(id);$('room-id-label').textContent='Connecting to room #'+id+'…';currentHostUserId=data.hostUserId||null;
 if(isHost){
   $('host-exit').onclick=async()=>{if(!confirm('End your live stream?'))return;const startedAt=window.__funLiveStartedAt||Date.now();const elapsed=Math.max(0,Date.now()-startedAt);try{await leaveMedia();}catch{};const mins=Math.floor(elapsed/60000),secs=Math.floor(elapsed/1000)%60;box.innerHTML=`<section class="live-ended-screen"><div class="ended-avatar">${safe((JSON.parse(localStorage.getItem("golive_user")||"{}").username||liveTitle).slice(0,1).toUpperCase())}</div><span class="ended-live-pill">LIVE</span><h1>Live Ended</h1><p class="ended-thanks">Thanks for your amazing support!</p><div class="ended-stats"><div><b class="ended-icon">◷</b><strong>${String(Math.floor(elapsed/3600000)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}:${String(secs).padStart(2,'0')}</strong><span>Duration</span></div><div><b class="ended-icon">👥</b><strong>0</strong><span>Viewers</span></div><div><b class="ended-icon">♥</b><strong>0</strong><span>Likes</span></div></div><div class="ended-extra-stats"><div><b>🪙 0</b><span>Coins Received</span></div><div><b>🎁 0</b><span>New Followers</span></div></div><button type="button" class="ended-save" id="ended-save">⇩　Save to Gallery</button><button type="button" class="ended-summary" id="ended-summary">▮▮　View Live Summary</button><button type="button" class="ended-home" id="ended-home">⌂　Back to Home</button><p id="ended-note" aria-live="polite"></p></section>`;const note=$('ended-note');$('ended-save').onclick=()=>{note.textContent='Recording was not saved because recording was not enabled during this live.';};$('ended-summary').onclick=()=>{note.textContent='Live summary: duration '+String(Math.floor(elapsed/3600000)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0')+':'+String(secs).padStart(2,'0')+' · 0 viewers · 0 likes · 0 coins received.';};$('ended-home').onclick=()=>{location.href='index.html';};};
   window.__funLiveStartedAt=Date.now();
   $('host-share').onclick=async()=>{try{await navigator.share({title:'FUN LIVE',text:'Join my live stream on FUN LIVE. User ID: '+($('host-user-id')?.textContent||'')+' · '+location.href,url:location.href})}catch(e){if(e.name!=='AbortError')status('Share cancelled or unavailable.')}};
   $('host-copy-room').onclick=async()=>{try{await navigator.clipboard.writeText(String(id));$('host-copy-room').textContent='✓ Copied'}catch{status('Live room number: '+id)}};
   $('host-copy-user').onclick=async()=>{const userId=$('host-user-id')?.textContent||'';try{await navigator.clipboard.writeText(userId);$('host-copy-user').textContent='✓'}catch{status('User ID: '+userId)}};
   $('host-gift').onclick=()=>{$('host-gift-panel').hidden=!$('host-gift-panel').hidden};
   const taskPanel=$('host-task-panel'),taskButton=$('host-task-button');taskButton.onclick=()=>{taskPanel.hidden=!taskPanel.hidden;taskButton.setAttribute('aria-expanded',String(!taskPanel.hidden));if(!taskPanel.hidden)loadFemaleMission();};$('host-task-close').onclick=()=>{taskPanel.hidden=true;taskButton.setAttribute('aria-expanded','false');};
 async function loadFemaleMission(){
   let card=$('female-host-weekly-mission');
   if(!card){card=document.createElement('div');card.id='female-host-weekly-mission';card.className='host-task-item';card.innerHTML='<span>💎 Female Host Weekly Mission</span><small id="female-mission-details">Loading mission status…</small>';const note=$('host-task-status-note');taskPanel.insertBefore(card,note||null);}
   try{const m=await call('/api/female-host-mission');const d=$('female-mission-details');if(!m.eligible){d.textContent=m.reason||'Available to eligible female hosts.';return;}const hrs=Math.floor(m.liveSeconds/3600),mins=Math.floor((m.liveSeconds%3600)/60),left=Math.max(0,m.secondsLeft||0),days=Math.floor(left/86400),hh=Math.floor(left%86400/3600),mm=Math.floor(left%3600/60);d.textContent=m.credited?'✓ Completed — '+Number(m.rewardDiamonds).toLocaleString()+' diamonds credited to Received Wallet.':m.expired?'Mission expired. Start a new mission period when available.':hrs+'h '+mins+'m / '+Math.floor(m.targetSeconds/3600)+'h live time · '+days+'d '+hh+'h '+mm+'m left · Reward: 
   $('host-task-welcome').onclick=()=>{const input=$('host-chat-input')||$('host-comment-input')||$('host-message');if(input){input.value='Welcome to my live! ❤️';input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));}else status('Use the comment box below to welcome your viewers.');};
   $('host-task-share').onclick=async()=>{const shareUrl=location.href;try{if(navigator.share){await navigator.share({title:'FUN LIVE',text:'Join my live stream on FUN LIVE ❤️',url:shareUrl});}else if(navigator.clipboard){await navigator.clipboard.writeText(shareUrl);status('Live link copied. Share it with friends!');}else{status('Copy this live link from your browser: '+shareUrl);}}catch(e){if(e?.name!=='AbortError')status('Could not share live link.');}};

   const featureMenu=$('host-feature-menu');const moreButtons=[$('host-more-top'),$('host-more-bottom')].filter(Boolean);const hostSettings=$('host-settings-panel');moreButtons.forEach(more=>{more.onclick=()=>{if(hostSettings){hostSettings.hidden=!hostSettings.hidden;featureMenu.hidden=true;moreButtons.forEach(b=>b.setAttribute('aria-expanded',String(!hostSettings.hidden)));}};});
   $('host-settings-close')?.addEventListener('click',()=>{hostSettings.hidden=true;moreButtons.forEach(b=>b.setAttribute('aria-expanded','false'));});
   const settingDetail=$('host-settings-detail');
   document.querySelectorAll('[data-host-setting]').forEach(btn=>btn.addEventListener('click',async()=>{
    const key=btn.dataset.hostSetting;
    const detail=(message)=>{if(settingDetail)settingDetail.textContent=message;};
    if(key==='mute'){const mic=localTracks[0];if(!mic){detail('Microphone is not ready yet.');return;}try{await mic.setEnabled(!mic.enabled);detail(mic.enabled?'Microphone is ON.':'Microphone is muted.');}catch(e){detail(e.message||'Could not change microphone.');}return;}
    if(key==='chat'){const current=localStorage.getItem('fun_live_chat_enabled')!=='false';localStorage.setItem('fun_live_chat_enabled',current?'false':'true');detail(current?'Chat display preference set to OFF on this device.':'Chat display preference set to ON on this device.');return;}
    if(key==='block'){const uid=prompt('Enter the viewer user ID to block:');if(uid&&uid.trim()){const list=JSON.parse(localStorage.getItem('fun_live_blocked_users')||'[]');if(!list.includes(uid.trim()))list.push(uid.trim());localStorage.setItem('fun_live_blocked_users',JSON.stringify(list));detail('Viewer ID '+uid.trim()+' added to this device’s block list. Server-side blocking is not connected yet.');}return;}
    if(key==='moderator'){const uid=prompt('Enter user ID to mark as moderator (local list only):');if(uid&&uid.trim()){const list=JSON.parse(localStorage.getItem('fun_live_moderators')||'[]');if(!list.includes(uid.trim()))list.push(uid.trim());localStorage.setItem('fun_live_moderators',JSON.stringify(list));detail('User ID '+uid.trim()+' saved to this device’s moderator list. Server permissions are not connected yet.');}return;}
    if(key==='privacy'){const current=localStorage.getItem('fun_live_live_private')==='true';localStorage.setItem('fun_live_live_private',current?'false':'true');detail(current?'Privacy set to Public (local preference).':'Privacy set to Private (local preference). Room access enforcement is not connected yet.');return;}
    if(key==='guests'){const current=localStorage.getItem('fun_live_guest_permissions')!=='false';localStorage.setItem('fun_live_guest_permissions',current?'false':'true');detail(current?'Guest permissions turned OFF on this device.':'Guest permissions turned ON on this device. Guest seat controls are not enabled.');return;}
    if(key==='history'){detail(($('host-gift-history')?.textContent||'No gifts yet.')+' Gift history is currently test-only.');return;}
    if(key==='earnings'){detail('Gift earnings: 0 coins recorded in this test UI. Real gift settlement is not connected yet.');return;}
    if(key==='balance'){detail('Current displayed coin balance: '+($('host-wallet-balance')?.textContent||'0')+' coins.');return;}
    if(key==='star'){const value=prompt('Set your star target (number of stars):',localStorage.getItem('fun_live_star_target')||'100');if(value!==null&&/^\d+$/.test(value.trim())){localStorage.setItem('fun_live_star_target',value.trim());detail('Star target saved: '+value.trim()+'. Live progress tracking is not connected yet.');}else if(value!==null)detail('Enter a whole number for the star target.');return;}
    if(key==='share'){try{if(navigator.share)await navigator.share({title:'FUN LIVE',text:'Join my live stream',url:location.href});else{await navigator.clipboard.writeText(location.href);detail('Live link copied.');}}catch(e){detail('Share cancelled or unavailable.');}return;}
    if(key==='report'){const reason=prompt('Why are you reporting this live?');if(reason&&reason.trim())detail('Report noted locally: '+reason.trim()+'. Server report submission is not connected yet.');return;}
   }));
   const micButton=$('host-mic-toggle');if(micButton){micButton.onclick=async()=>{try{const mic=localTracks[0];if(!mic)throw Error('Microphone is not ready.');const enabled=mic.enabled;await mic.setEnabled(!enabled);micButton.textContent=enabled?'🔇':'🎙️';micButton.setAttribute('aria-label',enabled?'Unmute microphone':'Mute microphone');}catch(e){status(e.message||'Could not toggle microphone.')}}}
   $('host-style').onclick=()=>{featureMenu.hidden=false;moreButtons.forEach(b=>b.setAttribute('aria-expanded','true'));$('beauty-mode')?.click();};
   $('host-gift-menu').onclick=()=>{$('host-gift-panel').hidden=false;featureMenu.hidden=true;};
   $('host-coins-menu').onclick=()=>{$('host-gift-panel').hidden=false;featureMenu.hidden=true;};
   $('host-gift-coin-balance').textContent=$('host-wallet-balance').textContent;
   document.querySelectorAll('.gift-sound-toggle').forEach(soundToggle=>{setGiftSoundButton();soundToggle.onclick=()=>{giftSoundEnabled=!giftSoundEnabled;localStorage.setItem('fun_live_gift_sound',giftSoundEnabled?'on':'off');document.querySelectorAll('.gift-sound-toggle').forEach(setGiftSoundButton);if(giftSoundEnabled)playGiftSound('chime');};});
   $('host-viewer-count').textContent='0 viewers';
   loadWallet().catch(()=>{});
 }
 box.scrollIntoView({behavior:'smooth',block:'center'});
 mediaClient=AgoraRTC.createClient({mode:data.mode==='rtc'?'rtc':'live',codec:'vp8'});
 mediaClient.on('user-published',async(user,mediaType)=>{
   try{
     await mediaClient.subscribe(user,mediaType);
     if(mediaType==='video'){
       let el=document.getElementById('agora-user-'+user.uid);
       if(!el){el=document.createElement('div');el.id='agora-user-'+user.uid;el.style.cssText='width:100%;max-width:320px;min-height:180px;border-radius:12px;background:#111;overflow:hidden';$('agora-remote').appendChild(el)}
       user.videoTrack.play(el);
     }
     if(mediaType==='audio')user.audioTrack.play();
   }catch(e){status('Could not play remote media: '+(e.message||'unknown error'))}
 });
 mediaClient.on('user-unpublished',(user,mediaType)=>{if(mediaType==='video'){const el=document.getElementById('agora-user-'+user.uid);if(el)el.remove()}});
 mediaClient.on('user-left',user=>{const el=document.getElementById('agora-user-'+user.uid);if(el)el.remove();});
 status('Connecting to Agora media server…');
 try{
   // Agora Live Broadcasting requires the client role to be set before joining.
   if(data.mode==='live')await mediaClient.setClientRole(data.role==='host'?'host':'audience');
   await mediaClient.join(data.appId,data.channelName,data.token,data.uid);
   if(data.role==='host'){
     // Build one microphone track and exactly one camera video track.
     const micTrack=await AgoraRTC.createMicrophoneAudioTrack();
     let cameraTrack;
     try{
       cameraTrack=await AgoraRTC.createCameraVideoTrack({encoderConfig:'480p_1'});
     }catch(e){
       micTrack.stop();micTrack.close();
       throw e;
     }
     localTracks=[micTrack,cameraTrack];
     cameraTrack.play('agora-local');
     await mediaClient.publish([micTrack,cameraTrack]);
     const connectionStatus=$('media-connection-status');
     if(connectionStatus)connectionStatus.textContent='🔴 LIVE · Camera and microphone connected';
     status('✅ Agora connected. Your camera and microphone are live.');
     if(data.mode==='live')try{await setupLiveChat(id)}catch(chatError){status('Live is running, but comments are offline: '+(chatError.message||'chat unavailable'))}
   }else{
     const connectionStatus=$('media-connection-status');
     if(connectionStatus)connectionStatus.textContent='Connected. Waiting for the host video…';
     if(data.mode==='live')try{await setupLiveChat(id)}catch(chatError){status('Connected to stream, but comments are offline: '+(chatError.message||'chat unavailable'))}
     if(data.mode==='live')loadFollowState().catch(()=>{});
     status('✅ Joined live stream. Waiting for the host video…');
   }
 }catch(e){
   await leaveMedia();
   box.innerHTML='<div class="note" style="color:#ff8dbd">❌ Agora connection failed: '+safe(e.message||'Unknown error')+'. Check Agora App ID, Certificate, project security settings and browser camera permissions.</div>';
   box.scrollIntoView({behavior:'smooth',block:'center'});
   throw Error('Agora connection failed: '+(e.message||'Unknown error'));
 }
 $('leave-media').hidden=false;$('toggle-mic').disabled=data.role!=='host';$('toggle-camera').disabled=data.role!=='host';
 if(data.mode==='rtc'){
   setupPrivateCallPrivacy();
   const callStatus=$('private-call-status');if(callStatus)callStatus.textContent='🔒 Encrypted room · Connected';
   let elapsed=0;clearInterval(window.__funPrivateCallTimer);clearInterval(window.__funCallBillingTimer);
   window.__funPrivateCallTimer=setInterval(()=>{elapsed++;const t=$('private-call-timer');if(t)t.textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');},1000);
   window.__funCallBillingTimer=setInterval(async()=>{try{const bill=await call('/api/calls/'+activeCallId+'/bill-minute','POST',{});status('Call minute '+bill.billedMinutes+' · '+bill.charged+' coins charged. Balance: '+bill.balance);}catch(err){if(/Not enough coins|Call is not active|Only the caller/i.test(err.message)){clearInterval(window.__funCallBillingTimer);await leaveMedia().catch(()=>{});status(err.message||'Call ended because coins are insufficient.');}}},60000);
   $('private-call-close').onclick=()=>$('private-end-call').click();
   $('private-end-call').onclick=()=>$('leave-media').click();
   $('private-toggle-mic').onclick=()=>action(async()=>{if(!localTracks[0])throw Error('Microphone is not ready.');const enabled=localTracks[0].enabled;await localTracks[0].setEnabled(!enabled);$('private-toggle-mic').textContent=enabled?'🎙️ Unmute':'🎙️ Mute';});
   $('private-toggle-camera').onclick=()=>action(async()=>{if(!localTracks[1])throw Error('Camera is not ready.');const enabled=localTracks[1].enabled;await localTracks[1].setEnabled(!enabled);$('private-toggle-camera').textContent=enabled?'📷 Camera On':'📷 Camera Off';});
   $('private-switch-camera').onclick=()=>action(flipCamera);
 }
}
async function leaveMedia(){
 clearInterval(window.__femaleMissionHeartbeat);window.__femaleMissionHeartbeat=null;window.__femaleMissionRoomId=null;
 clearInterval(window.__funPrivateCallTimer);window.__funPrivateCallTimer=null;clearInterval(window.__funCallBillingTimer);window.__funCallBillingTimer=null;
 if(screenTrack&&mediaClient){try{await mediaClient.unpublish([screenTrack])}catch{}try{screenTrack.stop();screenTrack.close()}catch{}screenTrack=null;}
 if(musicTrack&&mediaClient){try{await mediaClient.unpublish([musicTrack])}catch{}try{musicTrack.stop();musicTrack.close()}catch{}musicTrack=null;}
 if(musicElement){try{musicElement.pause();musicElement.src='';}catch{}musicElement=null;}
 if(musicContext){try{await musicContext.close()}catch{}musicContext=null;}
 if(musicObjectUrl){URL.revokeObjectURL(musicObjectUrl);musicObjectUrl=null;}
 if(socket&&socket.connected&&socket.__activeLiveRoom){
   const oldRoom=socket.__activeLiveRoom;
   await new Promise(resolve=>socket.emit('live:leave',{roomId:oldRoom},resolve));
   socket.__activeLiveRoom=null;
 }
 if(mediaClient){try{if(localTracks.length)await mediaClient.unpublish(localTracks)}catch{}try{await mediaClient.leave()}catch{}mediaClient=null}
 for(const track of localTracks){try{track.stop();track.close()}catch{}}
 localTracks=[];
 $('media-view').innerHTML='';$('leave-media').hidden=true;$('toggle-mic').disabled=true;$('toggle-camera').disabled=true;
}
$('leave-media').onclick=()=>action(async()=>{const liveTitle=$('room-title')?.value||$('setup-title')?.value||'My Live';const isHost=!!document.querySelector('.host-live-ui');await leaveMedia();if(activeCallId)await call('/api/calls/'+activeCallId+'/end','POST',{}).catch(()=>{});activeCallId=null;if(isHost){const box=$('media-view');if(box){box.innerHTML='<div class="live-ended-card"><div class="live-ended-avatar">👑</div><h2>Live Ended</h2><p>Thanks for streaming! 💕</p><div class="live-ended-stats"><div><small>Live Title</small><b></b></div><div><small>Room</small><b></b></div></div><button type="button" class="primary" id="ended-home">⌂ Back to Home</button><button type="button" class="primary live-ended-secondary" id="ended-again">◉ Stream Again</button></div>';box.querySelector('.live-ended-stats div:first-child b').textContent=liveTitle;box.querySelector('.live-ended-stats div:nth-child(2) b').textContent='#'+($('room-id')?.value||'—');}document.getElementById('ended-home')?.addEventListener('click',()=>{location.href='index.html'});document.getElementById('ended-again')?.addEventListener('click',()=>{document.getElementById('setup-title').value=liveTitle;document.getElementById('setup-camera').click();document.getElementById('setup-status').textContent='Preview ready. Tap Start Live when ready.';document.getElementById('setup-start-live').scrollIntoView({behavior:'smooth',block:'center'});});document.dispatchEvent(new CustomEvent('fun-live-ended'));}status('Live/call ended.')});
$('search-user').onclick=()=>action(async()=>{
 const q=$('call-user').value.trim();if(!q)throw Error('Enter username or GO LIVE ID.');
 const r=await call('/api/users/search?q='+encodeURIComponent(q));
 $('user-results').innerHTML=r.users.length?r.users.map(u=>'<div class="user-call-card"><span class="user-call-avatar">👤</span><span class="user-call-meta"><b>'+safe(u.username)+'</b><small>'+safe(u.goLiveId)+' · '+safe(u.gender||'unspecified')+' · 🔒 Private 1-to-1</small></span><button type="button" data-user-id="'+safe(u.id)+'" data-user-name="'+safe(u.username)+'">📹 Call Now</button></div>').join(''):'<p>No user found. Ask them to create an account first.</p>';
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-user-id]');if(b){selectedCallUser={id:b.dataset.userId,name:b.dataset.userName};$('create-call').disabled=false;if(b.textContent.includes('Call Now'))$('create-call').click();else status('Selected '+selectedCallUser.name+'. Tap Call Selected User.')}});
$('create-call').onclick=()=>action(async()=>{
 if(!selectedCallUser)throw Error('Find and select a GO LIVE user first.');
 const callButton=$('create-call');
 if(callButton.disabled) return;
 callButton.disabled=true;
 try{
  const r=await call('/api/calls','POST',{calleeId:selectedCallUser.id});
  activeCallId=r.call.id;
  status('📲 Calling '+selectedCallUser.name+'… Keep this page open while they accept.');
  const started=Date.now();
  while(Date.now()-started<60000){
   await new Promise(resolve=>setTimeout(resolve,2000));
   const state=await call('/api/calls/'+activeCallId);
   if(state.call.status==='accepted'){
    status('✅ Call accepted. Connecting video…');
    $('call-room-id').value=state.call.room_id;
    await joinMedia(state.call.room_id);
    return;
   }
   if(['rejected','ended','missed'].includes(state.call.status)){
    status('Call '+state.call.status+'.');
    activeCallId=null;
    return;
   }
  }
  await call('/api/calls/'+activeCallId+'/end','POST',{}).catch(()=>{});
  activeCallId=null;
  status('No answer after 60 seconds. Call ended.');
 }finally{
  callButton.disabled=!selectedCallUser;
 }
});
async function pollIncomingCalls(){
 if(!token)return;
 try{const r=await call('/api/calls/incoming');const box=$('incoming-calls');
 box.innerHTML=r.calls.map(c=>'<div class="row"><span>📲 Incoming call from '+safe(c.caller)+'</span><button class="primary" data-accept-call="'+safe(c.id)+'" data-room-id="'+safe(c.room_id)+'">Accept</button><button class="primary" data-reject-call="'+safe(c.id)+'">Reject</button></div>').join('');
 }catch{}
}
setInterval(pollIncomingCalls,3000);
document.addEventListener('click',e=>{
 const accept=e.target.closest('[data-accept-call]');if(accept)action(async()=>{const id=accept.dataset.acceptCall,room=accept.dataset.roomId;await call('/api/calls/'+id+'/respond','POST',{decision:'accepted'});activeCallId=id;$('call-room-id').value=room;$('room-id-label').textContent='Connecting to accepted 1-to-1 call…';await joinMedia(room)});
 const reject=e.target.closest('[data-reject-call]');if(reject)action(async()=>{await call('/api/calls/'+reject.dataset.rejectCall+'/respond','POST',{decision:'rejected'});await pollIncomingCalls();status('Call rejected.')});
});

async function followCurrentHost(){
 if(!currentHostUserId)throw Error("Host profile is not available yet.");
 const b=$('follow-host');
 const r=await call('/api/users/'+encodeURIComponent(currentHostUserId)+'/follow','POST',{});
 if(b)b.textContent=r.following?'✓ Following':'＋ Follow Host';
 status((r.following?'Following host.':'Unfollowed host.')+' · '+r.followers+' followers');
}
async function loadFollowState(){
 if(!currentHostUserId||!$('follow-host'))return;
 const r=await call('/api/users/'+encodeURIComponent(currentHostUserId)+'/follow-status');
 $('follow-host').textContent=r.following?'✓ Following':'＋ Follow Host';
}
async function reportCurrentLive(){
 const roomId=$('room-id')?.value.trim();
 if(!roomId||!/^\d+$/.test(roomId))throw Error('Join a live stream before reporting.');
 const reason=prompt('Report reason: Harassment, Nudity or sexual content, Violence, Spam or scam, Underage safety, Other');
 if(!reason)return;
 const normalized=["Harassment","Nudity or sexual content","Violence","Spam or scam","Underage safety","Other"].find(x=>x.toLowerCase()===reason.trim().toLowerCase());
 if(!normalized)throw Error('Use one of these reasons: Harassment, Nudity or sexual content, Violence, Spam or scam, Underage safety, Other.');
 const details=prompt('Optional details (or leave blank):')||'';
 const r=await call('/api/live/report','POST',{roomId,reason:normalized,details});
 status(r.message||'Report submitted.');
}
async function flipCamera(){
 if(!mediaClient||!localTracks[1]||!AgoraRTCRef)throw Error('Start your live first.');
 const cameras=await AgoraRTCRef.getCameras();
 if(cameras.length<2)throw Error('This device reports only one camera. Try on a phone with front and rear cameras.');
 const current=localTracks[1].getMediaStreamTrack?.().getSettings?.().deviceId;
 const next=cameras.find(c=>c.deviceId!==current)||cameras[0];
 await localTracks[1].setDevice(next.deviceId);
 status('Camera switched.');
}
function cycleBeauty(){
 const el=$('agora-local');if(!el)return;
 const classes=['','beauty-soft','beauty-glow','beauty-cool'];
 el.classList.remove('beauty-soft','beauty-glow','beauty-cool');
 beautyIndex=(beautyIndex+1)%classes.length;
 if(classes[beautyIndex])el.classList.add(classes[beautyIndex]);
 const names=['Beauty off','Soft beauty','Glow beauty','Cool beauty'];
 if($('beauty-mode'))$('beauty-mode').textContent='✨ '+names[beautyIndex];
 status(names[beautyIndex]+' enabled.');
}
function cycleEffects(){
 const el=$('agora-local');if(!el)return;
 const classes=['','effect-sparkle','effect-hearts','effect-stars'];
 el.classList.remove('effect-sparkle','effect-hearts','effect-stars');
 effectIndex=(effectIndex+1)%classes.length;
 if(classes[effectIndex])el.classList.add(classes[effectIndex]);
 const names=['Effects off','Sparkles','Hearts','Stars'];
 if($('live-effects'))$('live-effects').textContent='🎭 '+names[effectIndex];
 status(names[effectIndex]+' effect selected.');
}
async function toggleScreenShare(){
 if(!mediaClient||!localTracks[1]||!AgoraRTCRef)throw Error('Start your live first.');
 if(screenTrack){
   await mediaClient.unpublish([screenTrack]);try{screenTrack.stop();screenTrack.close()}catch{}screenTrack=null;
   await mediaClient.publish([localTracks[1]]);localTracks[1].play('agora-local');
   $('screen-share').textContent='🖥️ Share Screen';status('Screen sharing stopped. Camera is live again.');return;
 }
 try{
   const created=await AgoraRTCRef.createScreenVideoTrack({encoderConfig:'720p_1'},'disable');
   screenTrack=Array.isArray(created)?created[0]:created;
   await mediaClient.unpublish([localTracks[1]]);
   await mediaClient.publish([screenTrack]);
   screenTrack.play('agora-local');
   $('screen-share').textContent='⏹ Stop Share';
   screenTrack.on('track-ended',()=>{if(screenTrack)action(toggleScreenShare)});
   status('Screen sharing is live. Avoid showing private information.');
 }catch(e){screenTrack=null;throw Error('Screen sharing could not start: '+(e.message||'permission denied'))}
}
async function chooseMusicFile(file){
 if(!file)return;
 if(!mediaClient||!AgoraRTCRef)throw Error('Start your live before sharing music.');
 if(musicTrack){try{await mediaClient.unpublish([musicTrack]);musicTrack.stop();musicTrack.close()}catch{}musicTrack=null;}
 if(musicElement){musicElement.pause();musicElement=null;}
 if(musicContext){try{await musicContext.close()}catch{}musicContext=null;}
 if(musicObjectUrl)URL.revokeObjectURL(musicObjectUrl);
 musicObjectUrl=URL.createObjectURL(file);
 musicElement=new Audio(musicObjectUrl);musicElement.loop=true;musicElement.preload='auto';
 musicContext=new (window.AudioContext||window.webkitAudioContext)();
 await musicContext.resume();
 const source=musicContext.createMediaElementSource(musicElement);
 const destination=musicContext.createMediaStreamDestination();
 source.connect(destination);source.connect(musicContext.destination);
 await musicElement.play();
 musicTrack=AgoraRTCRef.createCustomAudioTrack({mediaStreamTrack:destination.stream.getAudioTracks()[0]});
 await mediaClient.publish([musicTrack]);
 $('live-music').textContent='⏹ Stop Music';
 status('Music is being shared to viewers. Use only audio you have rights to stream.');
}
async function toggleMusic(){
 if(musicTrack){
  try{await mediaClient.unpublish([musicTrack])}catch{}try{musicTrack.stop();musicTrack.close()}catch{}musicTrack=null;
  if(musicElement)musicElement.pause();
  $('live-music').textContent='🎵 Music';status('Live music stopped.');return;
 }
 $('live-music-file').click();
}
async function loadWeeklyRankings(){
 const box=$('weekly-rankings');if(!box)return;
 box.style.display='block';box.innerHTML='<p class="note">Loading weekly ranking…</p>';
 const r=await call('/api/rankings/weekly');
 box.innerHTML=r.rankings.length?r.rankings.map(x=>'<div class="rank-row"><span>'+(['🥇','🥈','🥉'][x.rank-1]||('#'+x.rank))+' '+safe(x.username)+'</span><b>'+safe(x.coins)+' coins</b></div>').join(''):'<p class="note">No gifts received in the last 7 days yet.</p>';
}
async function buyCoinPackage(amountPaise){
 const box=$('coin-store-status');if(box)box.textContent='Creating secure payment order…';
 const order=await call('/api/payments/order','POST',{amountPaise:Number(amountPaise)});
 await ensureScript('https://checkout.razorpay.com/v1/checkout.js','Razorpay');
 const checkout=new window.Razorpay({key:order.keyId,amount:order.amount,currency:order.currency,name:'FUN LIVE',description:order.coins+' FUN Coins',order_id:order.orderId,handler:async response=>{
   try{
    const verified=await call('/api/payments/verify','POST',{orderId:response.razorpay_order_id,paymentId:response.razorpay_payment_id,signature:response.razorpay_signature});
    if(box)box.textContent='Payment verified. '+verified.coins+' coins credited. Balance: '+verified.balance+'.';
    await loadWallet();
   }catch(e){if(box)box.textContent='Payment was submitted but verification needs attention: '+e.message;}
 },modal:{ondismiss:()=>{if(box)box.textContent='Payment window closed. No coins were added.';},confirm_close:true}});
 checkout.on('payment.failed',response=>{if(box)box.textContent='Payment failed: '+(response.error?.description||'Please try again.');});
 checkout.open();
}
document.addEventListener('click',e=>{
 if(e.target.closest('#follow-host'))action(followCurrentHost);
 if(e.target.closest('#report-live'))action(reportCurrentLive);
 if(e.target.closest('#flip-camera'))action(flipCamera);
 if(e.target.closest('#beauty-mode'))cycleBeauty();
 if(e.target.closest('#live-effects'))cycleEffects();
 if(e.target.closest('#screen-share'))action(toggleScreenShare);
 if(e.target.closest('#live-music'))action(toggleMusic);
 if(e.target.closest('#open-rankings'))action(loadWeeklyRankings);
 const packageButton=e.target.closest('[data-coin-package]');
 if(packageButton)action(()=>buyCoinPackage(packageButton.dataset.coinPackage));
});
document.addEventListener('change',e=>{
 if(e.target?.id==='live-music-file')action(()=>chooseMusicFile(e.target.files?.[0]));
});

async function loadWallet(){
 const r=await call('/api/wallet');
 if($('host-wallet-balance'))$('host-wallet-balance').textContent=String(r.balance);if($('host-gift-coin-balance'))$('host-gift-coin-balance').textContent=String(r.balance);
 if($('viewer-wallet-balance'))$('viewer-wallet-balance').textContent=String(r.balance);
 return r.balance;
}
document.addEventListener('click',e=>{
 const b=e.target.closest('#gift-test-coins');
 if(!b)return;
 action(async()=>{
   b.disabled=true;
   try{
     const r=await call('/api/wallet/test-coins','POST',{});
     if($('viewer-wallet-balance'))$('viewer-wallet-balance').textContent=String(r.balance);
     status('🪙 Added '+Number(r.added||0).toLocaleString()+' free test coins. Balance: '+Number(r.balance).toLocaleString()+'.');
   }catch(err){
     if(err?.message&&/already been used/i.test(err.message))status('Your free test coin grant was already used.');
     throw err;
   }finally{b.disabled=false}
 });
});
document.addEventListener('click',e=>{
 if(e.target.closest('#viewer-gift-open')){$('viewer-gift-panel').hidden=!$('viewer-gift-panel').hidden;loadWallet().catch(err=>status(err.message));}
 const b=e.target.closest('[data-send-gift]');
 if(b)action(async()=>{
   const roomId=$('room-id').value.trim();
   if(!/^\d+$/.test(roomId))throw Error('Join a live stream before sending gifts.');
   b.disabled=true;
   try{
     const r=await call('/api/gifts/send','POST',{roomId,giftKey:b.dataset.sendGift});
     if($('viewer-wallet-balance'))$('viewer-wallet-balance').textContent=String(r.balance);
     status('🎁 '+r.gift.label+' sent! Remaining balance: '+r.balance+' coins.');
     $('viewer-gift-panel').hidden=true;
   }finally{b.disabled=false}
 });
});
$('join-call').onclick=()=>action(async()=>{const id=$('call-room-id').value.trim();if(!/^\d+$/.test(id))throw Error('Enter a valid call room number.');$('room-id-label').textContent='Joining call room #'+id;await joinMedia(id)});
$('toggle-mic').onclick=()=>action(async()=>{if(!mediaClient||!localTracks[0])throw Error('Join your live or call first.');const track=localTracks[0];const enabled=track.enabled;track.setEnabled(!enabled);$('toggle-mic').textContent=enabled?'🎙️ Unmute Mic':'🎙️ Mute Mic';});
$('toggle-camera').onclick=()=>action(async()=>{if(!mediaClient||!localTracks[1])throw Error('Join your live or call first.');const track=localTracks[1];const enabled=track.enabled;track.setEnabled(!enabled);$('toggle-camera').textContent=enabled?'📷 Camera On':'📷 Camera Off';});
document.addEventListener('click',e=>{const b=e.target.closest('[data-join]');if(b){$('room-id').value=b.dataset.join;$('room-id-label').textContent='Opening live room #'+b.dataset.join+'…';action(()=>joinMedia(b.dataset.join))}});
$('send').onclick=()=>action(async()=>{
 if(!token)throw Error('Please sign in first.');
 const id=$('room-id').value.trim(),body=$('message').value.trim();if(!/^\d+$/.test(id)||!body)throw Error('Enter a room ID and message.');
 if(!socket){await ensureScript('https://cdn.socket.io/4.8.1/socket.io.min.js','io');socket=window.io(endpoint,{auth:{token}});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',e=>reject(Error(e.message||'Realtime chat connection failed.')))});}
 const joined=await new Promise(resolve=>socket.emit('room:join',{roomId:id},resolve));if(joined?.error)throw Error(joined.error);
 const sent=await new Promise(resolve=>socket.emit('room:message',{roomId:id,body},resolve));if(sent?.error)throw Error(sent.error);
 $('message').value='';const history=await call('/api/rooms/'+id+'/messages');$('messages').innerHTML=history.messages.map(m=>'<div class="chat"><b>'+safe(m.username)+':</b> '+safe(m.body)+'</div>').join('');status('Message sent.');
});
async function enterGuestMode(){
 try{
  const r=await call('/api/auth/guest','POST',{});
  token=r.token;sessionStorage.setItem('golive_token',token);localStorage.setItem('golive_token',token);accountLabel(r.user);
  const hero=document.querySelector('.login-hero'),panel=document.querySelector('.login-panel'),rooms=$('rooms'),chat=$('room-chat');
  if(hero)hero.style.display='none';if(panel)panel.style.display='none';if(rooms)rooms.style.display='block';if(chat)chat.style.display='block';
  status('Welcome to FUN LIVE! You are in guest mode. Your FUN LIVE ID: '+String(7000000+Number(r.user.id)));
  await loadRooms();
 }catch(e){status('Guest access could not start: '+(e.message||'Please refresh and try again.'))}
}
if(token&&endpoint)action(async()=>{const r=await call('/api/me');accountLabel(r.user);});
// Do not auto-create a guest session: it hides the registration form before users can register.
action(async()=>{const r=await call('/health');if(!token)status(r.ok&&r.database==='connected'?'Starting GO LIVE guest mode…':'API health check failed.');});
})();
+m.rewardUSD+' ('+Number(m.rewardDiamonds).toLocaleString()+' diamonds).';}catch(e){const d=$('female-mission-details');if(d)d.textContent='Mission status could not load. Please refresh.';}
 }

   $('host-task-welcome').onclick=()=>{const input=$('host-chat-input')||$('host-comment-input')||$('host-message');if(input){input.value='Welcome to my live! ❤️';input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));}else status('Use the comment box below to welcome your viewers.');};
   $('host-task-share').onclick=async()=>{const shareUrl=location.href;try{if(navigator.share){await navigator.share({title:'FUN LIVE',text:'Join my live stream on FUN LIVE ❤️',url:shareUrl});}else if(navigator.clipboard){await navigator.clipboard.writeText(shareUrl);status('Live link copied. Share it with friends!');}else{status('Copy this live link from your browser: '+shareUrl);}}catch(e){if(e?.name!=='AbortError')status('Could not share live link.');}};

   const featureMenu=$('host-feature-menu');const moreButtons=[$('host-more-top'),$('host-more-bottom')].filter(Boolean);const hostSettings=$('host-settings-panel');moreButtons.forEach(more=>{more.onclick=()=>{if(hostSettings){hostSettings.hidden=!hostSettings.hidden;featureMenu.hidden=true;moreButtons.forEach(b=>b.setAttribute('aria-expanded',String(!hostSettings.hidden)));}};});
   $('host-settings-close')?.addEventListener('click',()=>{hostSettings.hidden=true;moreButtons.forEach(b=>b.setAttribute('aria-expanded','false'));});
   const settingDetail=$('host-settings-detail');
   document.querySelectorAll('[data-host-setting]').forEach(btn=>btn.addEventListener('click',async()=>{
    const key=btn.dataset.hostSetting;
    const detail=(message)=>{if(settingDetail)settingDetail.textContent=message;};
    if(key==='mute'){const mic=localTracks[0];if(!mic){detail('Microphone is not ready yet.');return;}try{await mic.setEnabled(!mic.enabled);detail(mic.enabled?'Microphone is ON.':'Microphone is muted.');}catch(e){detail(e.message||'Could not change microphone.');}return;}
    if(key==='chat'){const current=localStorage.getItem('fun_live_chat_enabled')!=='false';localStorage.setItem('fun_live_chat_enabled',current?'false':'true');detail(current?'Chat display preference set to OFF on this device.':'Chat display preference set to ON on this device.');return;}
    if(key==='block'){const uid=prompt('Enter the viewer user ID to block:');if(uid&&uid.trim()){const list=JSON.parse(localStorage.getItem('fun_live_blocked_users')||'[]');if(!list.includes(uid.trim()))list.push(uid.trim());localStorage.setItem('fun_live_blocked_users',JSON.stringify(list));detail('Viewer ID '+uid.trim()+' added to this device’s block list. Server-side blocking is not connected yet.');}return;}
    if(key==='moderator'){const uid=prompt('Enter user ID to mark as moderator (local list only):');if(uid&&uid.trim()){const list=JSON.parse(localStorage.getItem('fun_live_moderators')||'[]');if(!list.includes(uid.trim()))list.push(uid.trim());localStorage.setItem('fun_live_moderators',JSON.stringify(list));detail('User ID '+uid.trim()+' saved to this device’s moderator list. Server permissions are not connected yet.');}return;}
    if(key==='privacy'){const current=localStorage.getItem('fun_live_live_private')==='true';localStorage.setItem('fun_live_live_private',current?'false':'true');detail(current?'Privacy set to Public (local preference).':'Privacy set to Private (local preference). Room access enforcement is not connected yet.');return;}
    if(key==='guests'){const current=localStorage.getItem('fun_live_guest_permissions')!=='false';localStorage.setItem('fun_live_guest_permissions',current?'false':'true');detail(current?'Guest permissions turned OFF on this device.':'Guest permissions turned ON on this device. Guest seat controls are not enabled.');return;}
    if(key==='history'){detail(($('host-gift-history')?.textContent||'No gifts yet.')+' Gift history is currently test-only.');return;}
    if(key==='earnings'){detail('Gift earnings: 0 coins recorded in this test UI. Real gift settlement is not connected yet.');return;}
    if(key==='balance'){detail('Current displayed coin balance: '+($('host-wallet-balance')?.textContent||'0')+' coins.');return;}
    if(key==='star'){const value=prompt('Set your star target (number of stars):',localStorage.getItem('fun_live_star_target')||'100');if(value!==null&&/^\d+$/.test(value.trim())){localStorage.setItem('fun_live_star_target',value.trim());detail('Star target saved: '+value.trim()+'. Live progress tracking is not connected yet.');}else if(value!==null)detail('Enter a whole number for the star target.');return;}
    if(key==='share'){try{if(navigator.share)await navigator.share({title:'FUN LIVE',text:'Join my live stream',url:location.href});else{await navigator.clipboard.writeText(location.href);detail('Live link copied.');}}catch(e){detail('Share cancelled or unavailable.');}return;}
    if(key==='report'){const reason=prompt('Why are you reporting this live?');if(reason&&reason.trim())detail('Report noted locally: '+reason.trim()+'. Server report submission is not connected yet.');return;}
   }));
   const micButton=$('host-mic-toggle');if(micButton){micButton.onclick=async()=>{try{const mic=localTracks[0];if(!mic)throw Error('Microphone is not ready.');const enabled=mic.enabled;await mic.setEnabled(!enabled);micButton.textContent=enabled?'🔇':'🎙️';micButton.setAttribute('aria-label',enabled?'Unmute microphone':'Mute microphone');}catch(e){status(e.message||'Could not toggle microphone.')}}}
   $('host-style').onclick=()=>{featureMenu.hidden=false;moreButtons.forEach(b=>b.setAttribute('aria-expanded','true'));$('beauty-mode')?.click();};
   $('host-gift-menu').onclick=()=>{$('host-gift-panel').hidden=false;featureMenu.hidden=true;};
   $('host-coins-menu').onclick=()=>{$('host-gift-panel').hidden=false;featureMenu.hidden=true;};
   $('host-gift-coin-balance').textContent=$('host-wallet-balance').textContent;
   document.querySelectorAll('.gift-sound-toggle').forEach(soundToggle=>{setGiftSoundButton();soundToggle.onclick=()=>{giftSoundEnabled=!giftSoundEnabled;localStorage.setItem('fun_live_gift_sound',giftSoundEnabled?'on':'off');document.querySelectorAll('.gift-sound-toggle').forEach(setGiftSoundButton);if(giftSoundEnabled)playGiftSound('chime');};});
   $('host-viewer-count').textContent='0 viewers';
   loadWallet().catch(()=>{});
 }
 box.scrollIntoView({behavior:'smooth',block:'center'});
 mediaClient=AgoraRTC.createClient({mode:data.mode==='rtc'?'rtc':'live',codec:'vp8'});
 mediaClient.on('user-published',async(user,mediaType)=>{
   try{
     await mediaClient.subscribe(user,mediaType);
     if(mediaType==='video'){
       let el=document.getElementById('agora-user-'+user.uid);
       if(!el){el=document.createElement('div');el.id='agora-user-'+user.uid;el.style.cssText='width:100%;max-width:320px;min-height:180px;border-radius:12px;background:#111;overflow:hidden';$('agora-remote').appendChild(el)}
       user.videoTrack.play(el);
     }
     if(mediaType==='audio')user.audioTrack.play();
   }catch(e){status('Could not play remote media: '+(e.message||'unknown error'))}
 });
 mediaClient.on('user-unpublished',(user,mediaType)=>{if(mediaType==='video'){const el=document.getElementById('agora-user-'+user.uid);if(el)el.remove()}});
 mediaClient.on('user-left',user=>{const el=document.getElementById('agora-user-'+user.uid);if(el)el.remove();});
 status('Connecting to Agora media server…');
 try{
   await mediaClient.join(data.appId,data.channelName,data.token,data.uid);
   if(data.mode==='live')await mediaClient.setClientRole(data.role==='host'?'host':'audience');
   if(data.role==='host'){
     // Build one microphone track and exactly one camera video track.
     const micTrack=await AgoraRTC.createMicrophoneAudioTrack();
     let cameraTrack;
     try{
       cameraTrack=await AgoraRTC.createCameraVideoTrack({encoderConfig:'480p_1'});
     }catch(e){
       micTrack.stop();micTrack.close();
       throw e;
     }
     localTracks=[micTrack,cameraTrack];
     cameraTrack.play('agora-local');
     await mediaClient.publish([micTrack,cameraTrack]);
     const connectionStatus=$('media-connection-status');
     if(connectionStatus)connectionStatus.textContent='🔴 LIVE · Camera and microphone connected';
     status('✅ Agora connected. Your camera and microphone are live.');
     if(data.mode==='live')try{await setupLiveChat(id)}catch(chatError){status('Live is running, but comments are offline: '+(chatError.message||'chat unavailable'))}
   }else{
     const connectionStatus=$('media-connection-status');
     if(connectionStatus)connectionStatus.textContent='Connected. Waiting for the host video…';
     if(data.mode==='live')try{await setupLiveChat(id)}catch(chatError){status('Connected to stream, but comments are offline: '+(chatError.message||'chat unavailable'))}
     if(data.mode==='live')loadFollowState().catch(()=>{});
     status('✅ Joined live stream. Waiting for the host video…');
   }
 }catch(e){
   await leaveMedia();
   box.innerHTML='<div class="note" style="color:#ff8dbd">❌ Agora connection failed: '+safe(e.message||'Unknown error')+'. Check Agora App ID, Certificate, project security settings and browser camera permissions.</div>';
   box.scrollIntoView({behavior:'smooth',block:'center'});
   throw Error('Agora connection failed: '+(e.message||'Unknown error'));
 }
 $('leave-media').hidden=false;$('toggle-mic').disabled=data.role!=='host';$('toggle-camera').disabled=data.role!=='host';
 if(data.mode==='rtc'){
   setupPrivateCallPrivacy();
   const callStatus=$('private-call-status');if(callStatus)callStatus.textContent='🔒 Encrypted room · Connected';
   let elapsed=0;clearInterval(window.__funPrivateCallTimer);clearInterval(window.__funCallBillingTimer);
   window.__funPrivateCallTimer=setInterval(()=>{elapsed++;const t=$('private-call-timer');if(t)t.textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');},1000);
   window.__funCallBillingTimer=setInterval(async()=>{try{const bill=await call('/api/calls/'+activeCallId+'/bill-minute','POST',{});status('Call minute '+bill.billedMinutes+' · '+bill.charged+' coins charged. Balance: '+bill.balance);}catch(err){if(/Not enough coins|Call is not active|Only the caller/i.test(err.message)){clearInterval(window.__funCallBillingTimer);await leaveMedia().catch(()=>{});status(err.message||'Call ended because coins are insufficient.');}}},60000);
   $('private-call-close').onclick=()=>$('private-end-call').click();
   $('private-end-call').onclick=()=>$('leave-media').click();
   $('private-toggle-mic').onclick=()=>action(async()=>{if(!localTracks[0])throw Error('Microphone is not ready.');const enabled=localTracks[0].enabled;await localTracks[0].setEnabled(!enabled);$('private-toggle-mic').textContent=enabled?'🎙️ Unmute':'🎙️ Mute';});
   $('private-toggle-camera').onclick=()=>action(async()=>{if(!localTracks[1])throw Error('Camera is not ready.');const enabled=localTracks[1].enabled;await localTracks[1].setEnabled(!enabled);$('private-toggle-camera').textContent=enabled?'📷 Camera On':'📷 Camera Off';});
   $('private-switch-camera').onclick=()=>action(flipCamera);
 }
}
async function leaveMedia(){
 clearInterval(window.__femaleMissionHeartbeat);window.__femaleMissionHeartbeat=null;window.__femaleMissionRoomId=null;
 clearInterval(window.__funPrivateCallTimer);window.__funPrivateCallTimer=null;clearInterval(window.__funCallBillingTimer);window.__funCallBillingTimer=null;
 if(screenTrack&&mediaClient){try{await mediaClient.unpublish([screenTrack])}catch{}try{screenTrack.stop();screenTrack.close()}catch{}screenTrack=null;}
 if(musicTrack&&mediaClient){try{await mediaClient.unpublish([musicTrack])}catch{}try{musicTrack.stop();musicTrack.close()}catch{}musicTrack=null;}
 if(musicElement){try{musicElement.pause();musicElement.src='';}catch{}musicElement=null;}
 if(musicContext){try{await musicContext.close()}catch{}musicContext=null;}
 if(musicObjectUrl){URL.revokeObjectURL(musicObjectUrl);musicObjectUrl=null;}
 if(socket&&socket.connected&&socket.__activeLiveRoom){
   const oldRoom=socket.__activeLiveRoom;
   await new Promise(resolve=>socket.emit('live:leave',{roomId:oldRoom},resolve));
   socket.__activeLiveRoom=null;
 }
 if(mediaClient){try{if(localTracks.length)await mediaClient.unpublish(localTracks)}catch{}try{await mediaClient.leave()}catch{}mediaClient=null}
 for(const track of localTracks){try{track.stop();track.close()}catch{}}
 localTracks=[];
 $('media-view').innerHTML='';$('leave-media').hidden=true;$('toggle-mic').disabled=true;$('toggle-camera').disabled=true;
}
$('leave-media').onclick=()=>action(async()=>{const liveTitle=$('room-title')?.value||$('setup-title')?.value||'My Live';const isHost=!!document.querySelector('.host-live-ui');await leaveMedia();if(activeCallId)await call('/api/calls/'+activeCallId+'/end','POST',{}).catch(()=>{});activeCallId=null;if(isHost){const box=$('media-view');if(box){box.innerHTML='<div class="live-ended-card"><div class="live-ended-avatar">👑</div><h2>Live Ended</h2><p>Thanks for streaming! 💕</p><div class="live-ended-stats"><div><small>Live Title</small><b></b></div><div><small>Room</small><b></b></div></div><button type="button" class="primary" id="ended-home">⌂ Back to Home</button><button type="button" class="primary live-ended-secondary" id="ended-again">◉ Stream Again</button></div>';box.querySelector('.live-ended-stats div:first-child b').textContent=liveTitle;box.querySelector('.live-ended-stats div:nth-child(2) b').textContent='#'+($('room-id')?.value||'—');}document.getElementById('ended-home')?.addEventListener('click',()=>{location.href='index.html'});document.getElementById('ended-again')?.addEventListener('click',()=>{document.getElementById('setup-title').value=liveTitle;document.getElementById('setup-camera').click();document.getElementById('setup-status').textContent='Preview ready. Tap Start Live when ready.';document.getElementById('setup-start-live').scrollIntoView({behavior:'smooth',block:'center'});});document.dispatchEvent(new CustomEvent('fun-live-ended'));}status('Live/call ended.')});
$('search-user').onclick=()=>action(async()=>{
 const q=$('call-user').value.trim();if(!q)throw Error('Enter username or GO LIVE ID.');
 const r=await call('/api/users/search?q='+encodeURIComponent(q));
 $('user-results').innerHTML=r.users.length?r.users.map(u=>'<div class="user-call-card"><span class="user-call-avatar">👤</span><span class="user-call-meta"><b>'+safe(u.username)+'</b><small>'+safe(u.goLiveId)+' · '+safe(u.gender||'unspecified')+' · 🔒 Private 1-to-1</small></span><button type="button" data-user-id="'+safe(u.id)+'" data-user-name="'+safe(u.username)+'">📹 Call Now</button></div>').join(''):'<p>No user found. Ask them to create an account first.</p>';
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-user-id]');if(b){selectedCallUser={id:b.dataset.userId,name:b.dataset.userName};$('create-call').disabled=false;if(b.textContent.includes('Call Now'))$('create-call').click();else status('Selected '+selectedCallUser.name+'. Tap Call Selected User.')}});
$('create-call').onclick=()=>action(async()=>{
 if(!selectedCallUser)throw Error('Find and select a GO LIVE user first.');
 const callButton=$('create-call');
 if(callButton.disabled) return;
 callButton.disabled=true;
 try{
  const r=await call('/api/calls','POST',{calleeId:selectedCallUser.id});
  activeCallId=r.call.id;
  status('📲 Calling '+selectedCallUser.name+'… Keep this page open while they accept.');
  const started=Date.now();
  while(Date.now()-started<60000){
   await new Promise(resolve=>setTimeout(resolve,2000));
   const state=await call('/api/calls/'+activeCallId);
   if(state.call.status==='accepted'){
    status('✅ Call accepted. Connecting video…');
    $('call-room-id').value=state.call.room_id;
    await joinMedia(state.call.room_id);
    return;
   }
   if(['rejected','ended','missed'].includes(state.call.status)){
    status('Call '+state.call.status+'.');
    activeCallId=null;
    return;
   }
  }
  await call('/api/calls/'+activeCallId+'/end','POST',{}).catch(()=>{});
  activeCallId=null;
  status('No answer after 60 seconds. Call ended.');
 }finally{
  callButton.disabled=!selectedCallUser;
 }
});
async function pollIncomingCalls(){
 if(!token)return;
 try{const r=await call('/api/calls/incoming');const box=$('incoming-calls');
 box.innerHTML=r.calls.map(c=>'<div class="row"><span>📲 Incoming call from '+safe(c.caller)+'</span><button class="primary" data-accept-call="'+safe(c.id)+'" data-room-id="'+safe(c.room_id)+'">Accept</button><button class="primary" data-reject-call="'+safe(c.id)+'">Reject</button></div>').join('');
 }catch{}
}
setInterval(pollIncomingCalls,3000);
document.addEventListener('click',e=>{
 const accept=e.target.closest('[data-accept-call]');if(accept)action(async()=>{const id=accept.dataset.acceptCall,room=accept.dataset.roomId;await call('/api/calls/'+id+'/respond','POST',{decision:'accepted'});activeCallId=id;$('call-room-id').value=room;$('room-id-label').textContent='Connecting to accepted 1-to-1 call…';await joinMedia(room)});
 const reject=e.target.closest('[data-reject-call]');if(reject)action(async()=>{await call('/api/calls/'+reject.dataset.rejectCall+'/respond','POST',{decision:'rejected'});await pollIncomingCalls();status('Call rejected.')});
});

async function followCurrentHost(){
 if(!currentHostUserId)throw Error("Host profile is not available yet.");
 const b=$('follow-host');
 const r=await call('/api/users/'+encodeURIComponent(currentHostUserId)+'/follow','POST',{});
 if(b)b.textContent=r.following?'✓ Following':'＋ Follow Host';
 status((r.following?'Following host.':'Unfollowed host.')+' · '+r.followers+' followers');
}
async function loadFollowState(){
 if(!currentHostUserId||!$('follow-host'))return;
 const r=await call('/api/users/'+encodeURIComponent(currentHostUserId)+'/follow-status');
 $('follow-host').textContent=r.following?'✓ Following':'＋ Follow Host';
}
async function reportCurrentLive(){
 const roomId=$('room-id')?.value.trim();
 if(!roomId||!/^\d+$/.test(roomId))throw Error('Join a live stream before reporting.');
 const reason=prompt('Report reason: Harassment, Nudity or sexual content, Violence, Spam or scam, Underage safety, Other');
 if(!reason)return;
 const normalized=["Harassment","Nudity or sexual content","Violence","Spam or scam","Underage safety","Other"].find(x=>x.toLowerCase()===reason.trim().toLowerCase());
 if(!normalized)throw Error('Use one of these reasons: Harassment, Nudity or sexual content, Violence, Spam or scam, Underage safety, Other.');
 const details=prompt('Optional details (or leave blank):')||'';
 const r=await call('/api/live/report','POST',{roomId,reason:normalized,details});
 status(r.message||'Report submitted.');
}
async function flipCamera(){
 if(!mediaClient||!localTracks[1]||!AgoraRTCRef)throw Error('Start your live first.');
 const cameras=await AgoraRTCRef.getCameras();
 if(cameras.length<2)throw Error('This device reports only one camera. Try on a phone with front and rear cameras.');
 const current=localTracks[1].getMediaStreamTrack?.().getSettings?.().deviceId;
 const next=cameras.find(c=>c.deviceId!==current)||cameras[0];
 await localTracks[1].setDevice(next.deviceId);
 status('Camera switched.');
}
function cycleBeauty(){
 const el=$('agora-local');if(!el)return;
 const classes=['','beauty-soft','beauty-glow','beauty-cool'];
 el.classList.remove('beauty-soft','beauty-glow','beauty-cool');
 beautyIndex=(beautyIndex+1)%classes.length;
 if(classes[beautyIndex])el.classList.add(classes[beautyIndex]);
 const names=['Beauty off','Soft beauty','Glow beauty','Cool beauty'];
 if($('beauty-mode'))$('beauty-mode').textContent='✨ '+names[beautyIndex];
 status(names[beautyIndex]+' enabled.');
}
function cycleEffects(){
 const el=$('agora-local');if(!el)return;
 const classes=['','effect-sparkle','effect-hearts','effect-stars'];
 el.classList.remove('effect-sparkle','effect-hearts','effect-stars');
 effectIndex=(effectIndex+1)%classes.length;
 if(classes[effectIndex])el.classList.add(classes[effectIndex]);
 const names=['Effects off','Sparkles','Hearts','Stars'];
 if($('live-effects'))$('live-effects').textContent='🎭 '+names[effectIndex];
 status(names[effectIndex]+' effect selected.');
}
async function toggleScreenShare(){
 if(!mediaClient||!localTracks[1]||!AgoraRTCRef)throw Error('Start your live first.');
 if(screenTrack){
   await mediaClient.unpublish([screenTrack]);try{screenTrack.stop();screenTrack.close()}catch{}screenTrack=null;
   await mediaClient.publish([localTracks[1]]);localTracks[1].play('agora-local');
   $('screen-share').textContent='🖥️ Share Screen';status('Screen sharing stopped. Camera is live again.');return;
 }
 try{
   const created=await AgoraRTCRef.createScreenVideoTrack({encoderConfig:'720p_1'},'disable');
   screenTrack=Array.isArray(created)?created[0]:created;
   await mediaClient.unpublish([localTracks[1]]);
   await mediaClient.publish([screenTrack]);
   screenTrack.play('agora-local');
   $('screen-share').textContent='⏹ Stop Share';
   screenTrack.on('track-ended',()=>{if(screenTrack)action(toggleScreenShare)});
   status('Screen sharing is live. Avoid showing private information.');
 }catch(e){screenTrack=null;throw Error('Screen sharing could not start: '+(e.message||'permission denied'))}
}
async function chooseMusicFile(file){
 if(!file)return;
 if(!mediaClient||!AgoraRTCRef)throw Error('Start your live before sharing music.');
 if(musicTrack){try{await mediaClient.unpublish([musicTrack]);musicTrack.stop();musicTrack.close()}catch{}musicTrack=null;}
 if(musicElement){musicElement.pause();musicElement=null;}
 if(musicContext){try{await musicContext.close()}catch{}musicContext=null;}
 if(musicObjectUrl)URL.revokeObjectURL(musicObjectUrl);
 musicObjectUrl=URL.createObjectURL(file);
 musicElement=new Audio(musicObjectUrl);musicElement.loop=true;musicElement.preload='auto';
 musicContext=new (window.AudioContext||window.webkitAudioContext)();
 await musicContext.resume();
 const source=musicContext.createMediaElementSource(musicElement);
 const destination=musicContext.createMediaStreamDestination();
 source.connect(destination);source.connect(musicContext.destination);
 await musicElement.play();
 musicTrack=AgoraRTCRef.createCustomAudioTrack({mediaStreamTrack:destination.stream.getAudioTracks()[0]});
 await mediaClient.publish([musicTrack]);
 $('live-music').textContent='⏹ Stop Music';
 status('Music is being shared to viewers. Use only audio you have rights to stream.');
}
async function toggleMusic(){
 if(musicTrack){
  try{await mediaClient.unpublish([musicTrack])}catch{}try{musicTrack.stop();musicTrack.close()}catch{}musicTrack=null;
  if(musicElement)musicElement.pause();
  $('live-music').textContent='🎵 Music';status('Live music stopped.');return;
 }
 $('live-music-file').click();
}
async function loadWeeklyRankings(){
 const box=$('weekly-rankings');if(!box)return;
 box.style.display='block';box.innerHTML='<p class="note">Loading weekly ranking…</p>';
 const r=await call('/api/rankings/weekly');
 box.innerHTML=r.rankings.length?r.rankings.map(x=>'<div class="rank-row"><span>'+(['🥇','🥈','🥉'][x.rank-1]||('#'+x.rank))+' '+safe(x.username)+'</span><b>'+safe(x.coins)+' coins</b></div>').join(''):'<p class="note">No gifts received in the last 7 days yet.</p>';
}
async function buyCoinPackage(amountPaise){
 const box=$('coin-store-status');if(box)box.textContent='Creating secure payment order…';
 const order=await call('/api/payments/order','POST',{amountPaise:Number(amountPaise)});
 await ensureScript('https://checkout.razorpay.com/v1/checkout.js','Razorpay');
 const checkout=new window.Razorpay({key:order.keyId,amount:order.amount,currency:order.currency,name:'FUN LIVE',description:order.coins+' FUN Coins',order_id:order.orderId,handler:async response=>{
   try{
    const verified=await call('/api/payments/verify','POST',{orderId:response.razorpay_order_id,paymentId:response.razorpay_payment_id,signature:response.razorpay_signature});
    if(box)box.textContent='Payment verified. '+verified.coins+' coins credited. Balance: '+verified.balance+'.';
    await loadWallet();
   }catch(e){if(box)box.textContent='Payment was submitted but verification needs attention: '+e.message;}
 },modal:{ondismiss:()=>{if(box)box.textContent='Payment window closed. No coins were added.';},confirm_close:true}});
 checkout.on('payment.failed',response=>{if(box)box.textContent='Payment failed: '+(response.error?.description||'Please try again.');});
 checkout.open();
}
document.addEventListener('click',e=>{
 if(e.target.closest('#follow-host'))action(followCurrentHost);
 if(e.target.closest('#report-live'))action(reportCurrentLive);
 if(e.target.closest('#flip-camera'))action(flipCamera);
 if(e.target.closest('#beauty-mode'))cycleBeauty();
 if(e.target.closest('#live-effects'))cycleEffects();
 if(e.target.closest('#screen-share'))action(toggleScreenShare);
 if(e.target.closest('#live-music'))action(toggleMusic);
 if(e.target.closest('#open-rankings'))action(loadWeeklyRankings);
 const packageButton=e.target.closest('[data-coin-package]');
 if(packageButton)action(()=>buyCoinPackage(packageButton.dataset.coinPackage));
});
document.addEventListener('change',e=>{
 if(e.target?.id==='live-music-file')action(()=>chooseMusicFile(e.target.files?.[0]));
});

async function loadWallet(){
 const r=await call('/api/wallet');
 if($('host-wallet-balance'))$('host-wallet-balance').textContent=String(r.balance);if($('host-gift-coin-balance'))$('host-gift-coin-balance').textContent=String(r.balance);
 if($('viewer-wallet-balance'))$('viewer-wallet-balance').textContent=String(r.balance);
 return r.balance;
}
document.addEventListener('click',e=>{
 const b=e.target.closest('#gift-test-coins');
 if(!b)return;
 action(async()=>{
   b.disabled=true;
   try{
     const r=await call('/api/wallet/test-coins','POST',{});
     if($('viewer-wallet-balance'))$('viewer-wallet-balance').textContent=String(r.balance);
     status('🪙 Added '+Number(r.added||0).toLocaleString()+' free test coins. Balance: '+Number(r.balance).toLocaleString()+'.');
   }catch(err){
     if(err?.message&&/already been used/i.test(err.message))status('Your free test coin grant was already used.');
     throw err;
   }finally{b.disabled=false}
 });
});
document.addEventListener('click',e=>{
 if(e.target.closest('#viewer-gift-open')){$('viewer-gift-panel').hidden=!$('viewer-gift-panel').hidden;loadWallet().catch(err=>status(err.message));}
 const b=e.target.closest('[data-send-gift]');
 if(b)action(async()=>{
   const roomId=$('room-id').value.trim();
   if(!/^\d+$/.test(roomId))throw Error('Join a live stream before sending gifts.');
   b.disabled=true;
   try{
     const r=await call('/api/gifts/send','POST',{roomId,giftKey:b.dataset.sendGift});
     if($('viewer-wallet-balance'))$('viewer-wallet-balance').textContent=String(r.balance);
     status('🎁 '+r.gift.label+' sent! Remaining balance: '+r.balance+' coins.');
     $('viewer-gift-panel').hidden=true;
   }finally{b.disabled=false}
 });
});
$('join-call').onclick=()=>action(async()=>{const id=$('call-room-id').value.trim();if(!/^\d+$/.test(id))throw Error('Enter a valid call room number.');$('room-id-label').textContent='Joining call room #'+id;await joinMedia(id)});
$('toggle-mic').onclick=()=>action(async()=>{if(!mediaClient||!localTracks[0])throw Error('Join your live or call first.');const track=localTracks[0];const enabled=track.enabled;track.setEnabled(!enabled);$('toggle-mic').textContent=enabled?'🎙️ Unmute Mic':'🎙️ Mute Mic';});
$('toggle-camera').onclick=()=>action(async()=>{if(!mediaClient||!localTracks[1])throw Error('Join your live or call first.');const track=localTracks[1];const enabled=track.enabled;track.setEnabled(!enabled);$('toggle-camera').textContent=enabled?'📷 Camera On':'📷 Camera Off';});
document.addEventListener('click',e=>{const b=e.target.closest('[data-join]');if(b){$('room-id').value=b.dataset.join;$('room-id-label').textContent='Opening live room #'+b.dataset.join+'…';action(()=>joinMedia(b.dataset.join))}});
$('send').onclick=()=>action(async()=>{
 if(!token)throw Error('Please sign in first.');
 const id=$('room-id').value.trim(),body=$('message').value.trim();if(!/^\d+$/.test(id)||!body)throw Error('Enter a room ID and message.');
 if(!socket){await ensureScript('https://cdn.socket.io/4.8.1/socket.io.min.js','io');socket=window.io(endpoint,{auth:{token}});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',e=>reject(Error(e.message||'Realtime chat connection failed.')))});}
 const joined=await new Promise(resolve=>socket.emit('room:join',{roomId:id},resolve));if(joined?.error)throw Error(joined.error);
 const sent=await new Promise(resolve=>socket.emit('room:message',{roomId:id,body},resolve));if(sent?.error)throw Error(sent.error);
 $('message').value='';const history=await call('/api/rooms/'+id+'/messages');$('messages').innerHTML=history.messages.map(m=>'<div class="chat"><b>'+safe(m.username)+':</b> '+safe(m.body)+'</div>').join('');status('Message sent.');
});
async function enterGuestMode(){
 try{
  const r=await call('/api/auth/guest','POST',{});
  token=r.token;sessionStorage.setItem('golive_token',token);localStorage.setItem('golive_token',token);accountLabel(r.user);
  const hero=document.querySelector('.login-hero'),panel=document.querySelector('.login-panel'),rooms=$('rooms'),chat=$('room-chat');
  if(hero)hero.style.display='none';if(panel)panel.style.display='none';if(rooms)rooms.style.display='block';if(chat)chat.style.display='block';
  status('Welcome to FUN LIVE! You are in guest mode. Your FUN LIVE ID: '+String(7000000+Number(r.user.id)));
  await loadRooms();
 }catch(e){status('Guest access could not start: '+(e.message||'Please refresh and try again.'))}
}
if(token&&endpoint)action(async()=>{const r=await call('/api/me');accountLabel(r.user);});
// Do not auto-create a guest session: it hides the registration form before users can register.
action(async()=>{const r=await call('/health');if(!token)status(r.ok&&r.database==='connected'?'Starting GO LIVE guest mode…':'API health check failed.');});
})();
