(() => {
const $=id=>document.getElementById(id);
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let endpoint=localStorage.getItem('golive_api_endpoint')||'',token=sessionStorage.getItem('golive_token')||'';
$('endpoint').value=endpoint;
function status(s){$('status').textContent=s}
async function call(path,method='GET',body){
 if(!endpoint)throw Error('First connect a deployed API server.');
 const response=await fetch(endpoint+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const json=await response.json().catch(()=>({error:'Invalid API response'}));
 if(!response.ok)throw Error(json.error||'Request failed');return json;
}
async function action(fn){try{await fn()}catch(e){status(e.message)}}
$('connect').onclick=()=>action(async()=>{
 const url=$('endpoint').value.trim().replace(/\/$/,'');
 if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url))throw Error('Use a valid HTTPS API server URL.');
 endpoint=url;localStorage.setItem('golive_api_endpoint',url);
 const r=await call('/health');status(r.ok?'API connected and database available.':'API health check failed.');
});
$('register').onclick=()=>action(async()=>{
 const r=await call('/api/auth/register','POST',{username:$('username').value,email:$('email').value,password:$('password').value});
 token=r.token;sessionStorage.setItem('golive_token',token);$('account').textContent='Signed in as '+r.user.username;status('Account created.');
});
$('login').onclick=()=>action(async()=>{
 const r=await call('/api/auth/login','POST',{email:$('email').value,password:$('password').value});
 token=r.token;sessionStorage.setItem('golive_token',token);$('account').textContent='Signed in as '+r.user.username;status('Signed in.');
});
$('logout').onclick=()=>{token='';sessionStorage.removeItem('golive_token');$('account').textContent='Signed out.'};
$('refresh').onclick=()=>action(async()=>{
 const r=await call('/api/rooms');$('rooms').innerHTML=r.rooms.length?r.rooms.map(x=>'<div class="row"><span>'+safe(x.title)+' ('+safe(x.kind)+')</span><small>Room #'+safe(x.id)+' · '+safe(x.host)+'</small></div>').join(''):'<p>No rooms yet.</p>';status('Rooms loaded.');
});
$('create').onclick=()=>action(async()=>{
 const r=await call('/api/rooms','POST',{title:$('room-title').value,kind:$('room-kind').value});$('room-id').value=r.room.id;status('Room #'+r.room.id+' created. Media streaming not enabled.');$('refresh').click();
});
$('history').onclick=()=>action(async()=>{
 const id=$('room-id').value.trim();if(!/^\d+$/.test(id))throw Error('Enter a numeric room ID.');
 const r=await call('/api/rooms/'+id+'/messages');
 $('messages').innerHTML=r.messages.map(m=>'<div class="chat"><b>'+safe(m.username)+':</b> '+safe(m.body)+'</div>').join('');status('Messages loaded.');
});
$('send').onclick=()=>action(async()=>{
 const id=$('room-id').value.trim(),body=$('message').value.trim();
 if(!/^\d+$/.test(id)||!body)throw Error('Enter a room ID and message.');
 // This endpoint is intentionally not exposed: chat send requires authenticated Socket.IO.
 throw Error('Realtime chat sending requires the Socket.IO client connection. Viewing saved chat is available.');
});
if(token&&endpoint)action(async()=>{const r=await call('/api/me');$('account').textContent='Signed in as '+r.user.username});
})();