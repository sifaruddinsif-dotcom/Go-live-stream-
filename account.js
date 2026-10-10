(() => {
const $=id=>document.getElementById(id);
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let endpoint=localStorage.getItem('golive_api_endpoint')||'https://go-live-stream-api.onrender.com';
let token=sessionStorage.getItem('golive_token')||'';
let mediaRoom=null,socket=null,selectedCallUser=null,activeCallId=null,incomingPoll=null;

function status(s){const el=$('status');el.textContent=s;el.style.cssText='display:block;padding:12px;margin:12px 0;border-radius:12px;background:#24182f;color:#fff;border:1px solid #ff329d;white-space:pre-wrap;overflow-wrap:anywhere';}
async function call(path,method='GET',body){
 if(!endpoint)throw Error('API address is missing.');
 const response=await fetch(endpoint+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const json=await response.json().catch(()=>({error:'Invalid API response'}));
 if(!response.ok)throw Error(json.error||'Request failed');return json;
}
async function action(fn){try{await fn()}catch(e){status('⚠️ '+(e.message||'Something went wrong.'));$('status').scrollIntoView({behavior:'smooth',block:'center'});}}
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
async function joinMedia(id){
 if(!token)throw Error('Please register or sign in first.');
 await leaveMedia();
 const roomName='room-'+id;
 const data=await call('/api/live/token','POST',{roomName});
 const {Room,RoomEvent,Track}=await import('https://cdn.jsdelivr.net/npm/livekit-client@2.15.6/+esm');
 mediaRoom=new Room({adaptiveStream:true,dynacast:true});
 const box=$('media-view');box.innerHTML='<div class="note">Connecting to media room '+safe(roomName)+'…</div>'; $('room-id').value=String(id); $('room-id-label').textContent='Connecting to room #'+id+'…'; box.scrollIntoView({behavior:'smooth',block:'center'});
 mediaRoom.on(RoomEvent.ConnectionStateChanged,state=>status('Media connection: '+state+'.'));
 mediaRoom.on(RoomEvent.TrackSubscribed,(track,publication,participant)=>{
   if(track.kind==='video'||track.kind==='audio'){
     const el=track.attach();el.autoplay=true;el.playsInline=true;el.style.cssText='width:100%;max-width:280px;border-radius:12px;margin:6px;background:#111';
     if(track.kind==='video')box.appendChild(el);else {el.style.display='none';box.appendChild(el)}
   }
 });
 mediaRoom.on(RoomEvent.TrackUnsubscribed,track=>track.detach().forEach(el=>el.remove()));
 mediaRoom.on(RoomEvent.ParticipantDisconnected,p=>status(p.identity+' left the room.'));
 status('Connecting to media server…');
 try {
   await Promise.race([mediaRoom.connect(data.url,data.token),new Promise((_,reject)=>setTimeout(()=>reject(Error('Media server did not respond within 15 seconds. Check LiveKit URL and server status.')),15000))]);
 } catch(e) { try{await mediaRoom.disconnect()}catch{} mediaRoom=null;box.innerHTML='<div class="note">Media connection failed. Room exists, but voice/video server did not connect.</div>'; box.scrollIntoView({behavior:'smooth',block:'center'}); throw Error(e.message||'Could not connect to media server.'); }
 if(String(id)===$('room-id').value.trim())status('Connected to room '+id+'. Allow camera/microphone permissions when asked.');
 try{
   await mediaRoom.localParticipant.enableCameraAndMicrophone();
   for(const publication of mediaRoom.localParticipant.trackPublications.values()){const track=publication.track;if(track&&(track.kind==='video'||track.kind==='audio')){const el=track.attach();el.autoplay=true;el.playsInline=true;el.style.cssText='width:100%;max-width:280px;border-radius:12px;margin:6px;background:#111';box.appendChild(el)}}
   status('Live media connected. Camera and microphone are publishing.');
 }catch(e){status('Joined room, but camera/microphone permission failed: '+e.message+'. Check browser permissions.'); box.scrollIntoView({behavior:'smooth',block:'center'})}
 $('leave-media').hidden=false;$('toggle-mic').disabled=false;$('toggle-camera').disabled=false;
}
async function leaveMedia(){if(mediaRoom){try{await mediaRoom.disconnect()}catch{}mediaRoom=null}$('media-view').innerHTML='';$('leave-media').hidden=true}
$('leave-media').onclick=()=>action(async()=>{await leaveMedia();if(activeCallId)await call('/api/calls/'+activeCallId+'/end','POST',{}).catch(()=>{});activeCallId=null;$('toggle-mic').disabled=true;$('toggle-camera').disabled=true;status('Live/call ended.')});
$('search-user').onclick=()=>action(async()=>{
 const q=$('call-user').value.trim();if(!q)throw Error('Enter username or GO LIVE ID.');
 const r=await call('/api/users/search?q='+encodeURIComponent(q));
 $('user-results').innerHTML=r.users.length?r.users.map(u=>'<button type="button" class="primary" data-user-id="'+safe(u.id)+'" data-user-name="'+safe(u.username)+'">'+safe(u.username)+' · '+safe(u.goLiveId)+'</button>').join(''):'<p>No user found. Ask them to open GO LIVE once first.</p>';
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-user-id]');if(b){selectedCallUser={id:b.dataset.userId,name:b.dataset.userName};$('create-call').disabled=false;status('Selected '+selectedCallUser.name+'. Tap Call Selected User.')}});
$('create-call').onclick=()=>action(async()=>{
 if(!selectedCallUser)throw Error('Find and select a GO LIVE user first.');
 const r=await call('/api/calls','POST',{calleeId:selectedCallUser.id});activeCallId=r.call.id;status('Calling '+selectedCallUser.name+'… Waiting for them to accept.');
 const started=Date.now();while(Date.now()-started<60000){await new Promise(resolve=>setTimeout(resolve,2000));const state=await call('/api/calls/'+activeCallId);if(state.call.status==='accepted'){status('Call accepted. Connecting video…');$('call-room-id').value=state.call.room_id;await joinMedia(state.call.room_id);return}if(['rejected','ended','missed'].includes(state.call.status)){status('Call '+state.call.status+'.');return}}
 await call('/api/calls/'+activeCallId+'/end','POST',{}).catch(()=>{});status('No answer. Call ended.');
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
$('join-call').onclick=()=>action(async()=>{const id=$('call-room-id').value.trim();if(!/^\d+$/.test(id))throw Error('Enter a valid call room number.');$('room-id-label').textContent='Joining call room #'+id;await joinMedia(id)});
$('toggle-mic').onclick=()=>action(async()=>{if(!mediaRoom)throw Error('Join a live or call first.');const p=mediaRoom.localParticipant;const enabled=p.isMicrophoneEnabled;await p.setMicrophoneEnabled(!enabled);$('toggle-mic').textContent=enabled?'🎙️ Unmute Mic':'🎙️ Mute Mic';});
$('toggle-camera').onclick=()=>action(async()=>{if(!mediaRoom)throw Error('Join a live or call first.');const p=mediaRoom.localParticipant;const enabled=p.isCameraEnabled;await p.setCameraEnabled(!enabled);$('toggle-camera').textContent=enabled?'📷 Camera On':'📷 Camera Off';});
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