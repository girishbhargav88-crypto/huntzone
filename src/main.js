import 'leaflet/dist/leaflet.css';
import './style.css';
import L from 'leaflet';
import { io } from 'socket.io-client';
import { firebaseReady } from './firebase.js';

const socketUrl = import.meta.env.VITE_SOCKET_URL || (location.hostname === 'localhost' ? 'http://localhost:3000' : location.origin);
const socket = io(socketUrl, { autoConnect: true, transports: ['websocket', 'polling'] });
const app = document.querySelector('#app');

const state = {
  screen: 'home', name: localStorage.getItem('hz-name') || 'Player', room: '',
  isHost: false, role: '', players: [], ready: false, gameStarted: false,
  gameSeconds: 1800, map: null, drawn: [], zoneLayer: null, drawMode: false,
  gps: null, watchId: null, markers: {}, myId: null, zone: null, toastTimer: null
};

const icon = (name) => ({
  crosshair:'◎', users:'♧', map:'⌖', settings:'⚙', arrow:'→', back:'‹',
  pin:'⌖', clock:'◷', target:'⊙', check:'✓', copy:'▢', plus:'+', minus:'−',
  pencil:'✎', undo:'↶', trash:'×', locate:'➤', shield:'◇', alert:'!', trophy:'♛'
}[name] || '•');

function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.append(el); }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function setScreen(screen) { state.screen = screen; render(); }
function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function render() {
  if (state.map) { state.map.remove(); state.map = null; }
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <button class="icon-btn ${state.screen==='home'?'hidden':''}" id="back" aria-label="Back">${icon('back')}</button>
        <div class="brand-mark"><span class="brand-icon">⌖</span><span>HUNT<span class="slash">//</span>ZONE</span></div>
        <button class="icon-btn" id="profile" aria-label="Profile">☻</button>
      </header>
      <main id="screen-content">${screenMarkup()}</main>
      <nav class="bottom-nav">
        <button class="${state.screen==='home'?'active':''}" data-nav="home"><span>⌂</span>Home</button>
        <button data-nav="join"><span>♧</span>Join</button>
        <button data-nav="how"><span>ⓘ</span>How to play</button>
      </nav>
    </div>`;
  document.querySelector('#back')?.addEventListener('click', () => {
    if (state.screen === 'draw') setScreen('create');
    else if (['lobby','create','join','how','profile'].includes(state.screen)) setScreen('home');
    else if (state.screen === 'live') toast('Leave the hunt from the game menu.');
    else setScreen('home');
  });
  document.querySelector('#profile')?.addEventListener('click', () => { const n = prompt('What should other players call you?', state.name); if (n?.trim()) { state.name = n.trim().slice(0,24); localStorage.setItem('hz-name',state.name); toast('Player name updated'); render(); } });
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
    const v=b.dataset.nav;
    if(v==='join') setScreen('join'); else if(v==='how') setScreen('how'); else setScreen('home');
  }));
  bindScreen();
}

function screenMarkup() {
  if (state.screen==='home') return `
    <section class="hero">
      <div class="hero-art"><div class="sun-glow"></div><div class="hero-cross">⌖</div><div class="hero-silhouette">●</div><div class="city-line"></div></div>
      <p class="eyebrow">REAL WORLD. REAL FRIENDS.</p>
      <h1>Your city.<br><span>Your hunt.</span></h1>
      <p class="subcopy">Make a play zone, pick your teams, and see who can outsmart the others.</p>
      <div class="home-actions">
        <button class="primary-btn" id="create"><span class="btn-icon">＋</span><span><b>Create a hunt</b><small>Set up a game for your friends</small></span><strong>→</strong></button>
        <button class="secondary-btn" id="join"><span class="btn-icon">↗</span><span><b>Join a hunt</b><small>Enter a room code</small></span><strong>→</strong></button>
      </div>
      <div class="feature-strip"><span>◎ Live map</span><span>♧ Teams</span><span>⌖ Draw your zone</span></div>
      <p class="tiny-note">${firebaseReady ? 'Firebase configured' : 'Prototype mode · Firebase keys can be added later'}</p>
    </section>`;
  if (state.screen==='create') return `
    <section class="page">
      <p class="eyebrow">LET'S SET IT UP</p><h1>Create a hunt</h1><p class="subcopy">A few quick choices, then draw your arena.</p>
      <label class="field-label">Hunt name<input id="hunt-name" value="Campus Hunt" maxlength="32" /></label>
      <div class="field-label">Players <div class="stepper"><button id="players-minus">−</button><strong id="players-count">8</strong><button id="players-plus">＋</button></div></div>
      <div class="field-label">Hunters <div class="stepper"><button id="hunters-minus">−</button><strong id="hunters-count">2</strong><button id="hunters-plus">＋</button></div></div>
      <label class="field-label">Game duration<select id="duration"><option value="900">15 minutes</option><option value="1800" selected>30 minutes</option><option value="2700">45 minutes</option><option value="3600">60 minutes</option></select></label>
      <div class="info-card"><span class="info-icon">⌖</span><div><b>Choose your play area</b><p>Draw a boundary on the map. Keep it somewhere safe and walkable.</p></div></div>
      <button class="primary-btn full" id="draw-next">Draw play area <strong>→</strong></button>
    </section>`;
  if (state.screen==='draw') return `
    <section class="map-screen">
      <div class="map-heading"><div><p class="eyebrow">STEP 2 OF 2</p><h2>Draw your play area</h2><p class="subcopy">Drag your finger in one loop around the area.</p></div><span class="step-pill">2 / 2</span></div>
      <div id="map" class="map-canvas"></div>
      <div class="map-tools"><button id="draw-toggle" class="tool-btn active">✎ Draw boundary</button><button id="circle-toggle" class="tool-btn">◎ Circle</button></div>
      <div class="map-toolbar"><button id="undo" class="soft-btn">↶ Undo</button><button id="clear" class="soft-btn">× Clear</button><button id="my-location" class="soft-btn">➤ My location</button></div>
      <div class="zone-summary"><span class="zone-dot"></span><div><b id="zone-status">Ready to draw</b><small id="zone-size">Draw a closed shape to set the arena</small></div></div>
      <button class="primary-btn full" id="confirm-zone">Confirm play area <strong>→</strong></button>
      <p class="tiny-note">Use only in a safe area with everyone's permission. Map tiles need internet.</p>
    </section>`;
  if (state.screen==='join') return `
    <section class="page center-page"><div class="round-illustration">♧</div><p class="eyebrow">YOUR FRIENDS ARE WAITING</p><h1>Join a hunt</h1><p class="subcopy">Ask the host for their 4-character room code.</p>
      <label class="field-label">Room code<input id="room-code" placeholder="e.g. A7X9" maxlength="6" autocomplete="off" /></label>
      <label class="field-label">Your name<input id="join-name" value="${esc(state.name)}" maxlength="24" /></label>
      <button class="primary-btn full" id="join-room">Join room <strong>→</strong></button>
    </section>`;
  if (state.screen==='lobby') return `
    <section class="page"><p class="eyebrow">THE SQUAD</p><h1>${esc(state.huntName || 'Your hunt')}</h1>
      <div class="room-code-card"><div><small>ROOM CODE</small><strong>${esc(state.room)}</strong></div><button id="copy-code" class="copy-btn">▢ Copy</button></div>
      <div class="section-row"><b>Players</b><span>${state.players.length} joined</span></div>
      <div class="player-list">${state.players.map((p,i)=>`<div class="player-row"><div class="avatar ${p.role==='hunter'?'red':''}">${esc((p.name||'P')[0].toUpperCase())}</div><div class="player-meta"><b>${esc(p.name)} ${p.id===state.myId?'(You)':''}</b><small>${p.isHost?'Host':'Player'}</small></div><span class="ready-state ${p.ready?'ready':''}">${p.ready?'Ready':'Joined'}</span></div>`).join('') || '<p class="subcopy">Waiting for players to join…</p>'}</div>
      <button class="secondary-btn full" id="ready">${state.ready?'✓ You are ready':'I’m ready'}</button>
      ${state.isHost?'<button class="primary-btn full" id="start-hunt">Start hunt <strong>→</strong></button>':'<p class="tiny-note">The host will start when everyone is ready.</p>'}
    </section>`;
  if (state.screen==='live') return `
    <section class="live-screen"><div class="live-hud"><div><span class="live-dot"></span><span id="game-status">HUNT IN PROGRESS</span></div><strong id="timer">30:00</strong><small>${state.role==='hunter'?'You are a HUNTER':'You are a RUNNER'}</small></div>
      <div id="live-map" class="live-map"></div>
      <div class="live-stats"><div><small>YOUR TEAM</small><b class="${state.role==='hunter'?'red-text':'green-text'}">${state.role==='hunter'?'Hunters':'Runners'}</b></div><div><small>PLAYERS</small><b>${state.players.length}</b></div><div><small>ZONE</small><b>Stay inside</b></div></div>
      <div class="live-actions">${state.role==='hunter'?'<button class="primary-btn tag-btn" id="tag-player">⌖ Tag nearby runner</button>':'<div class="tip-card">◇ Stay inside the boundary and avoid the hunters.</div>'}<button class="soft-btn" id="share-location">➤ Share my location</button><button class="soft-btn" id="leave-game">Leave game</button></div>
    </section>`;
  if (state.screen==='result') return `<section class="page center-page"><div class="round-illustration trophy">♛</div><p class="eyebrow">HUNT COMPLETE</p><h1 id="result-title">Hunt finished!</h1><p class="subcopy" id="result-copy">Thanks for playing together.</p><button class="primary-btn full" id="home-again">Back to home <strong>→</strong></button></section>`;
  if (state.screen==='how') return `<section class="page"><p class="eyebrow">QUICK START</p><h1>How to play</h1><div class="how-list"><div><span>1</span><article><b>Create or join</b><p>One friend hosts the game and shares a room code.</p></article></div><div><span>2</span><article><b>Draw the arena</b><p>Choose a safe public area and trace a closed boundary on the map.</p></article></div><div><span>3</span><article><b>Get your role</b><p>Hunters try to tag runners. Runners stay in the zone and survive.</p></article></div><div><span>4</span><article><b>Play safely</b><p>Walk, don't run into roads or private property. Location sharing is opt-in.</p></article></div></div><button class="primary-btn full" id="how-home">Got it</button></section>`;
  return `<section class="page"><h1>HUNT//ZONE</h1><button class="primary-btn full" id="home-again">Back home</button></section>`;
}

function bindScreen() {
  document.querySelector('#create')?.addEventListener('click',()=>setScreen('create'));
  document.querySelector('#join')?.addEventListener('click',()=>setScreen('join'));
  document.querySelector('#how-home')?.addEventListener('click',()=>setScreen('home'));
  document.querySelector('#players-minus')?.addEventListener('click',()=>step('players',-1));
  document.querySelector('#players-plus')?.addEventListener('click',()=>step('players',1));
  document.querySelector('#hunters-minus')?.addEventListener('click',()=>step('hunters',-1));
  document.querySelector('#hunters-plus')?.addEventListener('click',()=>step('hunters',1));
  document.querySelector('#draw-next')?.addEventListener('click',()=>{
    state.huntName=document.querySelector('#hunt-name').value.trim()||'Friendly Hunt';
    state.maxPlayers=Number(document.querySelector('#players-count').textContent);
    state.hunterCount=Number(document.querySelector('#hunters-count').textContent);
    state.gameSeconds=Number(document.querySelector('#duration').value);
    setScreen('draw'); setTimeout(initDrawMap,80);
  });
  document.querySelector('#join-room')?.addEventListener('click',()=>{
    state.name=document.querySelector('#join-name').value.trim()||'Player'; localStorage.setItem('hz-name',state.name);
    const code=document.querySelector('#room-code').value.trim().toUpperCase();
    if(!code) return toast('Enter the room code first');
    socket.emit('join-room',{code,name:state.name},handleRoomResponse);
  });
  document.querySelector('#ready')?.addEventListener('click',()=>{state.ready=!state.ready;socket.emit('set-ready',{room:state.room,ready:state.ready});render();});
  document.querySelector('#start-hunt')?.addEventListener('click',()=>socket.emit('start-game',{room:state.room,zone:state.zone,duration:state.gameSeconds}));
  document.querySelector('#copy-code')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(state.room);toast('Room code copied');}catch{toast(`Room code: ${state.room}`)}});
  document.querySelector('#share-location')?.addEventListener('click',startLocation);
  document.querySelector('#tag-player')?.addEventListener('click',()=>socket.emit('tag-nearest',{room:state.room}));
  document.querySelector('#leave-game')?.addEventListener('click',()=>{stopLocation();socket.emit('leave-room',{room:state.room});state.room='';state.players=[];setScreen('home');});
  document.querySelector('#home-again')?.addEventListener('click',()=>setScreen('home'));
  if(state.screen==='live') setTimeout(initLiveMap,80);
}

function step(which, delta) {
  const el=document.querySelector(which==='players'?'#players-count':'#hunters-count');
  let n=Number(el.textContent)+(delta);
  if(which==='players') n=Math.max(2,Math.min(20,n));
  else n=Math.max(1,Math.min(Number(document.querySelector('#players-count').textContent)-1,n));
  el.textContent=n;
  if(which==='players' && Number(document.querySelector('#hunters-count').textContent)>=n) document.querySelector('#hunters-count').textContent=n-1;
}

function mapBase(id) {
  const map=L.map(id,{zoomControl:false,attributionControl:true}).setView([13.6288,79.4192],15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  L.control.zoom({position:'bottomright'}).addTo(map);
  return map;
}
function initDrawMap() {
  const el=document.querySelector('#map'); if(!el||state.map) return;
  state.map=mapBase('map'); state.drawn=[]; state.zone=null;
  let drawing=false, points=[];
  state.map.on('mousedown touchstart', e=>{
    if(!state.drawMode) return;
    drawing=true; state.map.dragging.disable(); points=[e.latlng]; if(state.zoneLayer) state.map.removeLayer(state.zoneLayer);
    state.zoneLayer=L.polyline(points,{color:'#28e0b5',weight:4,smoothFactor:1.2}).addTo(state.map);
  });
  state.map.on('mousemove touchmove',e=>{
    if(!drawing||!state.drawMode) return;
    const ll=e.latlng || (e.latlngs&&e.latlngs[0]); if(!ll)return;
    const last=points[points.length-1]; if(!last||state.map.distance(last,ll)>7){points.push(ll);state.zoneLayer.setLatLngs(points);}
  });
  const finish=()=>{
    if(!drawing)return; drawing=false; state.map.dragging.enable();
    if(points.length<4){toast('Draw a bigger loop around your play area');return;}
    if(state.map.distance(points[0],points[points.length-1])>35) points.push(points[0]);
    else points[points.length-1]=points[0];
    state.drawn.push(points.slice()); state.zone=points.map(p=>[p.lat,p.lng]);
    state.zoneLayer=L.polygon(points,{color:'#24e2b3',weight:3,fillColor:'#24e2b3',fillOpacity:.17}).addTo(state.map);
    state.map.fitBounds(state.zoneLayer.getBounds(),{padding:[24,24]});
    document.querySelector('#zone-status').textContent='Arena boundary ready';
    document.querySelector('#zone-size').textContent=`${(L.GeometryUtil?.geodesicArea?.(points)||roughArea(points)).toLocaleString(undefined,{maximumFractionDigits:0})} m² · adjust or confirm`;
  };
  state.map.on('mouseup touchend',finish);
  document.querySelector('#draw-toggle').addEventListener('click',()=>{state.drawMode=true;document.querySelector('#draw-toggle').classList.add('active');document.querySelector('#circle-toggle').classList.remove('active');toast('Draw a continuous loop on the map');});
  document.querySelector('#circle-toggle').addEventListener('click',()=>{
    state.drawMode=false; document.querySelector('#circle-toggle').classList.add('active');document.querySelector('#draw-toggle').classList.remove('active');
    const center=state.map.getCenter(); if(state.zoneLayer)state.map.removeLayer(state.zoneLayer);
    state.zoneLayer=L.circle(center,{radius:250,color:'#24e2b3',weight:3,fillColor:'#24e2b3',fillOpacity:.17}).addTo(state.map);
    state.zone=circlePoints(center,250);
    document.querySelector('#zone-status').textContent='250 m circle selected';document.querySelector('#zone-size').textContent='Tap the map to move the centre, or confirm';
    state.map.once('click',e=>{state.zoneLayer.setLatLng(e.latlng);state.zone=circlePoints(e.latlng,250);document.querySelector('#zone-status').textContent='Circle repositioned';});
  });
  document.querySelector('#undo').addEventListener('click',()=>{if(state.zoneLayer)state.map.removeLayer(state.zoneLayer);state.zoneLayer=null;state.zone=null;state.drawn.pop();document.querySelector('#zone-status').textContent='Ready to draw';document.querySelector('#zone-size').textContent='Draw a closed shape to set the arena';});
  document.querySelector('#clear').addEventListener('click',()=>{if(state.zoneLayer)state.map.removeLayer(state.zoneLayer);state.zoneLayer=null;state.zone=null;state.drawn=[];document.querySelector('#zone-status').textContent='Ready to draw';document.querySelector('#zone-size').textContent='Draw a closed shape to set the arena';});
  document.querySelector('#my-location').addEventListener('click',()=>{if(!navigator.geolocation)return toast('Location is not available in this browser');navigator.geolocation.getCurrentPosition(pos=>state.map.setView([pos.coords.latitude,pos.coords.longitude],16),()=>toast('Allow location access or move the map manually'));});
  document.querySelector('#confirm-zone').addEventListener('click',()=>{
    if(!state.zone||state.zone.length<4)return toast('Draw your play area first');
    socket.emit('create-room',{name:state.name,huntName:state.huntName,maxPlayers:state.maxPlayers,hunterCount:state.hunterCount,duration:state.gameSeconds,zone:state.zone},handleRoomResponse);
  });
  setTimeout(()=>state.map?.invalidateSize(),150);
}
function roughArea(points) { let a=0; for(let i=0,j=points.length-1;i<points.length;j=i++) a+=(points[j].lng+points[i].lng)*(points[j].lat-points[i].lat); return Math.abs(a*1236400000/2); }
function circlePoints(c,r) { const out=[]; for(let i=0;i<32;i++){const a=i*2*Math.PI/32;out.push([c.lat+Math.cos(a)*r/111320,c.lng+Math.sin(a)*r/(111320*Math.cos(c.lat*Math.PI/180))]);} return out; }

function handleRoomResponse(res) {
  if(!res?.ok){toast(res?.error||'Could not join that room');return;}
  state.room=res.room;state.isHost=!!res.isHost;state.myId=res.playerId;state.players=res.players||[];state.zone=res.zone||state.zone;state.huntName=res.huntName||state.huntName;state.ready=false;
  setScreen('lobby');
}
socket.on('room-update',data=>{if(data.room!==state.room)return;state.players=data.players;state.zone=data.zone||state.zone;state.huntName=data.huntName||state.huntName;if(state.screen==='lobby')render();});
socket.on('role-assigned',data=>{state.role=data.role;state.gameSeconds=data.duration||state.gameSeconds;state.zone=data.zone||state.zone;setScreen('live');toast(`You are a ${state.role}!`);});
socket.on('game-tick',data=>{const timer=document.querySelector('#timer');if(timer)timer.textContent=formatTime(data.seconds);if(data.zone)state.zone=data.zone;});
socket.on('game-ended',data=>{stopLocation();document.querySelector('#result-title')?.replaceChildren(document.createTextNode(data.winner==='hunters'?'Hunters win!':data.winner==='runners'?'Runners win!':'Hunt ended'));document.querySelector('#result-copy')?.replaceChildren(document.createTextNode(data.reason||'Great game.'));setScreen('result');});
socket.on('tag-result',data=>toast(data.message));
socket.on('connect',()=>{state.myId=socket.id;});
socket.on('connect_error',()=>{if(state.screen==='lobby')toast('Reconnecting to game server…');});
function formatTime(s){s=Math.max(0,Number(s)||0);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}

function initLiveMap() {
  if(!document.querySelector('#live-map')||state.map)return;
  state.map=mapBase('live-map');
  if(state.zone?.length>2){state.zoneLayer=L.polygon(state.zone,{color:'#24e2b3',weight:3,fillColor:'#24e2b3',fillOpacity:.1}).addTo(state.map);state.map.fitBounds(state.zoneLayer.getBounds(),{padding:[20,20]});}
  socket.emit('request-players',{room:state.room});
  socket.on('players-location',data=>{
    if(data.room!==state.room||!state.map)return;
    data.players.forEach(p=>{
      if(!p.location)return;
      if(state.markers[p.id])state.markers[p.id].setLatLng(p.location);
      else state.markers[p.id]=L.circleMarker(p.location,{radius:p.id===state.myId?8:7,color:p.role==='hunter'?'#ff5d69':'#22cdb1',fillColor:p.role==='hunter'?'#ff5d69':'#22cdb1',fillOpacity:.95,weight:2}).addTo(state.map).bindTooltip(esc(p.name));
    });
  });
  setTimeout(()=>state.map?.invalidateSize(),150);
}
function startLocation() {
  if(!navigator.geolocation)return toast('This browser does not support GPS');
  if(state.watchId!==null)return toast('Location is already being shared');
  state.watchId=navigator.geolocation.watchPosition(pos=>{
    const location={lat:pos.coords.latitude,lng:pos.coords.longitude};
    socket.emit('player-location',{room:state.room,location});
    if(state.map&&!state.markers[state.myId]){state.markers[state.myId]=L.circleMarker([location.lat,location.lng],{radius:8,color:'#fff',fillColor:'#24e2b3',fillOpacity:1,weight:2}).addTo(state.map);}
    else if(state.map&&state.markers[state.myId])state.markers[state.myId].setLatLng([location.lat,location.lng]);
    toast('Location sharing is on');
  },()=>toast('Location permission denied'),{enableHighAccuracy:true,maximumAge:3000,timeout:10000});
}
function stopLocation(){if(state.watchId!==null)navigator.geolocation.clearWatch(state.watchId);state.watchId=null;}
render();
