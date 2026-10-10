(() => {
const $=id=>document.getElementById(id);
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let endpoint=localStorage.getItem('golive_api_endpoint')||'https://go-live-stream-api.onrender.com';
let token=sessionStorage.getItem('golive_token')||'';
let mediaClient=null,localTracks=[],socket=null,selectedCallUser=null,activeCallId=null,incomingPoll=null,AgoraRTCRef=null,screenTrack=null,musicTrack=null,musicElement=null,musicContext=null,musicObjectUrl=null,currentHostUserId=null,beautyIndex=0,effectIndex=0;

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
function accountLabel(user){const u=typeof user==='string'?{username:user}:user; $('account').textContent='Signed in as '+u.username+(u.id?' · GO LIVE ID: GLS'+String(u.id).padStart(8,'0'):''); if(u.id){localStorage.setItem('golive_user',JSON.stringify({id:u.id,username:u.username,email:u.email||''}));$('logout').hidden=false;}else $('logout').hidden=true;}
$('register').onclick=()=>action(async()=>{
 const r=await call('/api/auth/register','POST',{email:$('email').value,password:$('password').value});
 token=r.token;sessionStorage.setItem('golive_token',token);accountLabel(r.user);$('password').value='';status('Account created with email. You are signed in.');
});
$('login').onclick=()=>action(async()=>{
 const r=await call('/api/auth/login','POST',{email:$('email').value,password:$('password').value});
 token=r.token;sessionStorage.setItem('golive_token',token);accountLabel(r.user);status('Signed in successfully.');
});
$('logout').onclick=async()=>{await leaveMedia();token='';sessionStorage.removeItem('golive_token');accountLabel('Signed out.');localStorage.removeItem('golive_user');status('You have signed out.')};
$('refresh').onclick=()=>action(async()=>{
 const r=await call('/api/rooms');const lives=r.rooms.filter(x=>x.kind==='live');$('room-list').innerHTML=lives.length?lives.map(x=>'<div class="row"><span>'+safe(x.title)+'</span><small>Live #'+safe(x.id)+' · '+safe(x.host)+'</small><button class="primary" data-join="'+safe(x.id)+'">Watch Live</button></div>').join(''):'<p>No live streams right now.</p>';status('Live streams refreshed.');
});
$('create').onclick=()=>action(async()=>{
 if(!token)throw Error('Guest sign-in abhi ready nahi hai. Refresh karke try karo.');const title=$('room-title').value.trim();if(!title)throw Error('Live title likho.');status('Starting live stream…');const r=await call('/api/rooms','POST',{title,kind:'live'});$('room-id').value=r.room.id;$('room-id-label').textContent='Live room #'+r.room.id+' — share this number with viewers.';status('✅ Live room created. Connecting camera and microphone…');await joinMedia(r.room.id);await loadRooms();
});
async function loadRooms(){const r=await call('/api/rooms');$('room-list').innerHTML=r.rooms.length?r.rooms.map(x=>'<div class="row"><span>'+safe(x.title)+' ('+safe(x.kind)+')</span><small>Room #'+safe(x.id)+' · '+safe(x.host)+'</small><button class="primary" data-join="'+safe(x.id)+'">Join media</button></div>').join(''):'<p>No rooms yet.</p>'}
$('history').onclick=()=>action(async()=>{
 const id=$('room-id').value.trim();if(!/^\d+$/.test(id))throw Error('Enter a numeric room ID.');
 const r=await call('/api/rooms/'+id+'/messages');
 $('messages').innerHTML=r.messages.map(m=>'<div class="chat"><b>'+safe(m.username)+':</b> '+safe(m.body)+'</div>').join('');status('Saved messages loaded.');
});
async function ensureScript(src,globalName){if(window[globalName])return;await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Could not load media client. Check internet connection.'));document.head.appendChild(s)})}
async function setupLiveChat(roomId){
 if(!token)return;
 await ensureScript('https://cdn.socket.io/4.8.1/socket.io.min.js','io');
 if(!socket||!socket.connected){
   if(socket)try{socket.disconnect()}catch{}
   socket=window.io(endpoint,{auth:{token},transports:['websocket','polling']});
   await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(Error('Live chat connection timed out.')),8000);
     socket.once('connect',()=>{clearTimeout(timer);resolve()});
     socket.once('connect_error',e=>{clearTimeout(timer);reject(Error(e.message||'Live chat connection failed.'))});
   });
 }
 socket.__activeLiveRoom=String(roomId);
 const joined=await new Promise(resolve=>socket.emit('room:join',{roomId:String(roomId)},resolve));
 if(joined?.error)throw Error(joined.error);
 const liveJoined=await new Promise(resolve=>socket.emit('live:join',{roomId:String(roomId)},resolve));
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
     const name=document.createElement('b');name.textContent=String(message.username||'User')+': ';
     const body=document.createElement('span');body.textContent=String(message.body||'');
     line.append(name,body);overlay.appendChild(line);
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
   if(history){if(history.textContent==='No gifts yet.')history.textContent='';const item=document.createElement('p');item.textContent=(gift.emoji||'🎁')+' '+String(gift.sender||'Viewer')+' · '+String(gift.label||gift.gift_key)+' ('+String(gift.coins)+' coins)';history.prepend(item);while(history.children.length>10)history.lastElementChild.remove();}
   const liveBox=document.querySelector('.host-live-ui,.live-viewer-ui');if(liveBox){const burst=document.createElement('div');burst.className='gift-burst';burst.textContent=gift.emoji||'🎁';liveBox.appendChild(burst);setTimeout(()=>burst.remove(),1600);}
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
 const roomId=$('room-id')?.value.trim()||socket?.__activeLiveRoom||'';
 if(!socket||!socket.connected){
   status('Comment not sent: chat is reconnecting. Your live is still running.');
   return;
 }
 if(!/^\d+$/.test(roomId)){
   status('Comment not sent: live room ID is missing.');
   return;
 }
 if(send)send.disabled=true;
 try{
   const result=await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(Error('Chat reply timed out.')),5000);
     socket.emit('room:message',{roomId,body},result=>{clearTimeout(timer);resolve(result)});
   });
   if(result?.error)throw Error(result.error);
   if(result?.message){
     const sent=result.message;
     // Ensure the sender sees the comment immediately; the room broadcast is de-duplicated by message ID.
     if(socket.__liveChatHandler)socket.__liveChatHandler(sent);
   }
   input.value='';
 }catch(err){
   status('Comment not sent: '+(err.message||'Try again.')+'. Your live should remain active.');
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
 const liveTitle=$('room-title')?.value.trim()||'My Live';
 box.innerHTML=isHost
 ? '<div class="host-live-ui"><div class="host-live-top"><button type="button" class="host-exit" id="host-exit" aria-label="Leave live">×</button><div class="host-title-block"><b>'+safe(liveTitle)+'</b><small>🔴 LIVE · <span id="host-viewer-count">0 viewers</span></small></div><button type="button" class="host-share" id="host-share">↗ Share</button></div><div class="host-room-strip"><span>🪙 <b id="host-wallet-balance">100</b> coins</span><span>Room #'+safe(id)+'</span><button type="button" id="host-copy-room">▢ Copy ID</button></div><div id="media-connection-status" class="host-live-status">Connecting to live stream…</div><div class="host-feature-bar"><button type="button" id="flip-camera">🔄 Flip</button><button type="button" id="beauty-mode">✨ Beauty</button><button type="button" id="live-effects">🎭 Effects</button><button type="button" id="screen-share">🖥️ Share Screen</button><button type="button" id="live-music">🎵 Music</button><button type="button" id="report-live">🚩 Report</button><input id="live-music-file" type="file" accept="audio/*" hidden></div><div id="agora-local" class="host-video"></div><div class="host-chat-overlay" id="host-chat-overlay"><div class="host-chat-message">🎉 Your live has started. Welcome viewers!</div></div><div class="host-hearts" aria-hidden="true">💗<br>💖</div><div class="host-live-bottom"><button type="button" class="host-gift" id="host-gift">🎁<small>Gift</small></button><form class="host-comment-form" id="host-comment-form"><input id="host-comment-input" maxlength="500" placeholder="Write a comment…" aria-label="Write a live comment"><button type="submit" aria-label="Send comment">➤</button></form></div><div id="host-gift-panel" class="host-gift-panel" hidden><b>🎁 Gifts received</b><div id="host-gift-history">No gifts yet.</div><small>Virtual test coins only.</small></div></div><div id="agora-remote" style="display:none"></div>'
 : '<div class="live-viewer-ui"><div id="media-connection-status" class="note" style="margin-bottom:10px">Connecting to '+safe(data.mode==='rtc'?'1-to-1 call':'live stream')+'…</div><div class="host-follow-row"><button type="button" id="follow-host">＋ Follow Host</button><button type="button" class="live-action-btn" id="report-live">🚩 Report Live</button></div><div id="agora-local" style="display:block;width:100%;min-height:220px;height:42vh;max-height:420px;border-radius:14px;background:#080611;overflow:hidden"></div><div id="agora-remote" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"></div><div id="viewer-chat-overlay" class="host-chat-overlay"></div><form class="host-comment-form viewer-comment-form" id="host-comment-form"><input id="host-comment-input" maxlength="500" placeholder="Write a comment…" aria-label="Write a live comment"><button type="submit" aria-label="Send comment">➤</button></form><div class="viewer-gift-bar"><span>🪙 <b id="viewer-wallet-balance">100</b> coins</span><button type="button" id="viewer-gift-open">🎁 Send Gift</button></div><div id="viewer-gift-panel" class="host-gift-panel" hidden><b>Send a gift</b><button type="button" data-send-gift="rose">🌹 Rose · 10</button><button type="button" data-send-gift="heart">💖 Heart · 20</button><button type="button" data-send-gift="crown">👑 Crown · 100</button><small>Promotional test coins only; no cash value.</small></div></div>';
 $('room-id').value=String(id);$('room-id-label').textContent='Connecting to room #'+id+'…';currentHostUserId=data.hostUserId||null;
 if(isHost){
   $('host-exit').onclick=()=>$('leave-media').click();
   $('host-share').onclick=async()=>{try{await navigator.share({title:'FUN LIVE',text:'Join my live stream on FUN LIVE. Room #'+id,url:location.href})}catch(e){if(e.name!=='AbortError')status('Share cancelled or unavailable. Use Copy ID to share room #'+id)}};
   $('host-copy-room').onclick=async()=>{try{await navigator.clipboard.writeText(String(id));$('host-copy-room').textContent='✓ Copied'}catch{status('Live room number: '+id)}};
   $('host-gift').onclick=()=>{$('host-gift-panel').hidden=!$('host-gift-panel').hidden};
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
       cameraTrack=await AgoraRTC.createCameraVideoTrack();
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
     try{await setupLiveChat(id)}catch(chatError){status('Live is running, but comments are offline: '+(chatError.message||'chat unavailable'))}
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
}
async function leaveMedia(){
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
$('leave-media').onclick=()=>action(async()=>{await leaveMedia();if(activeCallId)await call('/api/calls/'+activeCallId+'/end','POST',{}).catch(()=>{});activeCallId=null;status('Live/call ended.')});
$('search-user').onclick=()=>action(async()=>{
 const q=$('call-user').value.trim();if(!q)throw Error('Enter username or GO LIVE ID.');
 const r=await call('/api/users/search?q='+encodeURIComponent(q));
 $('user-results').innerHTML=r.users.length?r.users.map(u=>'<button type="button" class="primary" data-user-id="'+safe(u.id)+'" data-user-name="'+safe(u.username)+'">'+safe(u.username)+' · '+safe(u.goLiveId)+'</button>').join(''):'<p>No user found. Ask them to open GO LIVE once first.</p>';
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-user-id]');if(b){selectedCallUser={id:b.dataset.userId,name:b.dataset.userName};$('create-call').disabled=false;status('Selected '+selectedCallUser.name+'. Tap Call Selected User.')}});
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
 if($('host-wallet-balance'))$('host-wallet-balance').textContent=String(r.balance);
 if($('viewer-wallet-balance'))$('viewer-wallet-balance').textContent=String(r.balance);
 return r.balance;
}
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
  token=r.token;sessionStorage.setItem('golive_token',token);accountLabel(r.user);
  const hero=document.querySelector('.login-hero'),panel=document.querySelector('.login-panel'),rooms=$('rooms'),chat=$('room-chat');
  if(hero)hero.style.display='none';if(panel)panel.style.display='none';if(rooms)rooms.style.display='block';if(chat)chat.style.display='block';
  status('Welcome to GO LIVE! You are in guest mode. Your GO LIVE ID: GLS'+String(r.user.id).padStart(8,'0'));
  await loadRooms();
 }catch(e){status('Guest access could not start: '+(e.message||'Please refresh and try again.'))}
}
if(token&&endpoint)action(async()=>{const r=await call('/api/me');accountLabel(r.user);});
if(!token)enterGuestMode();
action(async()=>{const r=await call('/health');if(!token)status(r.ok&&r.database==='connected'?'Starting GO LIVE guest mode…':'API health check failed.');});
})();