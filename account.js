(() => {
const $=id=>document.getElementById(id);
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let endpoint=localStorage.getItem('golive_api_endpoint')||'https://go-live-stream-api.onrender.com';
let token=sessionStorage.getItem('golive_token')||'';
let mediaRoom=null,socket=null;
$('endpoint').value=endpoint;
function status(s){$('status').textContent=s}
async function call(path,method='GET',body){
 if(!endpoint)throw Error('API address is missing.');
 const response=await fetch(endpoint+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const json=await response.json().catch(()=>({error:'Invalid API response'}));
 if(!response.ok)throw Error(json.error||'Request failed');return json;
}
async function action(fn){try{await fn()}catch(e){status(e.message)}}
function accountLabel(name){$('account').textContent=name}
$('connect').onclick=()=>action(async()=>{
 const url=$('endpoint').value.trim().replace(/\/$/,'');
 if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url))throw Error('Use a valid HTTPS API server URL.');
 endpoint=url;localStorage.setItem('golive_api_endpoint',url);
 const r=await call('/health');status(r.ok&&r.database==='connected'?'API connected; database connected.':'API health check failed.');
});
$('register').onclick=()=>action(async()=>{
 const r=await call('/api/auth/register','POST',{username:$('username').value,email:$('email').value,password:$('password').value});
 token=r.token;sessionStorage.setItem('golive_token',token);accountLabel('Signed in as '+r.user.username);status('Account created successfully.');
});
$('login').onclick=()=>action(async()=>{
 const r=await call('/api/auth/login','POST',{email:$('email').value,password:$('password').value});
 token=r.token;sessionStorage.setItem('golive_token',token);accountLabel('Signed in as '+r.user.username);status('Signed in successfully.');
});
$('logout').onclick=async()=>{await leaveMedia();token='';sessionStorage.removeItem('golive_token');accountLabel('Signed out.');status('You have signed out.')};
$('refresh').onclick=()=>action(async()=>{
 const r=await call('/api/rooms');$('rooms').innerHTML=r.rooms.length?r.rooms.map(x=>'<div class="row"><span>'+safe(x.title)+' ('+safe(x.kind)+')</span><small>Room #'+safe(x.id)+' · '+safe(x.host)+'</small><button class="primary" data-join="'+safe(x.id)+'">Join media</button></div>').join(''):'<p>No rooms yet. Sign in and create one.</p>';status('Rooms loaded.');
});
$('create').onclick=()=>action(async()=>{
 const r=await call('/api/rooms','POST',{title:$('room-title').value,kind:$('room-kind').value});$('room-id').value=r.room.id;status('Room #'+r.room.id+' created. Tap Join media to start camera/microphone.');await loadRooms();
});
async function loadRooms(){const r=await call('/api/rooms');$('rooms').innerHTML=r.rooms.length?r.rooms.map(x=>'<div class="row"><span>'+safe(x.title)+' ('+safe(x.kind)+')</span><small>Room #'+safe(x.id)+' · '+safe(x.host)+'</small><button class="primary" data-join="'+safe(x.id)+'">Join media</button></div>').join(''):'<p>No rooms yet.</p>'}
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
 const box=$('media-view');box.innerHTML='<div class="note">Connecting to media room '+safe(roomName)+'…</div>';
 mediaRoom.on(RoomEvent.TrackSubscribed,(track,publication,participant)=>{
   if(track.kind==='video'||track.kind==='audio'){
     const el=track.attach();el.autoplay=true;el.playsInline=true;el.style.cssText='width:100%;max-width:280px;border-radius:12px;margin:6px;background:#111';
     if(track.kind==='video')box.appendChild(el);else {el.style.display='none';box.appendChild(el)}
   }
 });
 mediaRoom.on(RoomEvent.TrackUnsubscribed,track=>track.detach().forEach(el=>el.remove()));
 mediaRoom.on(RoomEvent.ParticipantDisconnected,p=>status(p.identity+' left the room.'));
 await mediaRoom.connect(data.url,data.token);
 if(String(id)===$('room-id').value.trim())status('Connected to room '+id+'. Allow camera/microphone permissions when asked.');
 try{
   const tracks=await mediaRoom.localParticipant.enableCameraAndMicrophone();
   for(const track of tracks){const el=track.attach();el.autoplay=true;el.playsInline=true;el.style.cssText='width:100%;max-width:280px;border-radius:12px;margin:6px;background:#111';box.appendChild(el)}
   status('Live media connected. Camera and microphone are publishing.');
 }catch(e){status('Joined room, but camera/microphone permission failed: '+e.message+'. Check browser permissions.')}
 $('leave-media').hidden=false;
}
async function leaveMedia(){if(mediaRoom){try{await mediaRoom.disconnect()}catch{}mediaRoom=null}$('media-view').innerHTML='';$('leave-media').hidden=true}
$('leave-media').onclick=()=>action(async()=>{await leaveMedia();status('Disconnected from media room.')});
document.addEventListener('click',e=>{const b=e.target.closest('[data-join]');if(b){$('room-id').value=b.dataset.join;action(()=>joinMedia(b.dataset.join))}});
$('send').onclick=()=>action(async()=>{
 if(!token)throw Error('Please sign in first.');
 const id=$('room-id').value.trim(),body=$('message').value.trim();if(!/^\d+$/.test(id)||!body)throw Error('Enter a room ID and message.');
 if(!socket){await ensureScript('https://cdn.socket.io/4.8.1/socket.io.min.js','io');socket=window.io(endpoint,{auth:{token}});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',e=>reject(Error(e.message||'Realtime chat connection failed.')))});}
 const joined=await new Promise(resolve=>socket.emit('room:join',{roomId:id},resolve));if(joined?.error)throw Error(joined.error);
 const sent=await new Promise(resolve=>socket.emit('room:message',{roomId:id,body},resolve));if(sent?.error)throw Error(sent.error);
 $('message').value='';await $('history').onclick();status('Message sent.');
});
if(token&&endpoint)action(async()=>{const r=await call('/api/me');accountLabel('Signed in as '+r.user.username);});
action(async()=>{const r=await call('/health');status(r.ok&&r.database==='connected'?'API connected; database connected.':'API health check failed.')});
})();