import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express(), server=http.createServer(app);
const PORT=process.env.PORT||3000;
const origins=(process.env.CLIENT_ORIGIN||'http://localhost:5173').split(',').map(x=>x.trim());
const io=new Server(server,{cors:{origin:origins,methods:['GET','POST']},maxHttpBufferSize:1e6});
app.use(express.json());
app.get('/api/health',(_,res)=>res.json({ok:true,service:'huntzone-server',rooms:rooms.size}));
app.get('/api/config',(_,res)=>res.json({firebaseConfigured:!!process.env.FIREBASE_PROJECT_ID}));
const rooms=new Map();
const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(){let c;do{c=Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('')}while(rooms.has(c));return c;}
function cleanName(n){return String(n||'Player').trim().slice(0,24)||'Player';}
function publicRoom(room){return {room:room.code,huntName:room.huntName,zone:room.zone,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,isHost:p.isHost,ready:p.ready,role:p.role}))};}
function updateRoom(room){io.to(room.code).emit('room-update',publicRoom(room));}
function withinPolygon(point,poly){
 if(!point||!Array.isArray(poly)||poly.length<3)return true;
 const x=point.lng,y=point.lat;let inside=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const xi=poly[i][1],yi=poly[i][0],xj=poly[j][1],yj=poly[j][0];
  const intersect=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi+1e-12)+xi);
  if(intersect)inside=!inside;
 }
 return inside;
}
function distanceMeters(a,b){const R=6371000,rad=v=>v*Math.PI/180;const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function stopTimer(room){if(room.timer)clearInterval(room.timer);room.timer=null;}
function endGame(room,winner,reason){if(room.status!=='live')return;room.status='ended';stopTimer(room);io.to(room.code).emit('game-ended',{winner,reason});}
function startTimer(room){
 stopTimer(room);room.remaining=room.duration;
 room.timer=setInterval(()=>{
  if(room.status!=='live')return;
  room.remaining--;io.to(room.code).emit('game-tick',{seconds:room.remaining,zone:room.zone});
  const runners=[...room.players.values()].filter(p=>p.role==='runner');
  if(runners.length===0||runners.every(p=>p.caught)){endGame(room,'hunters','All runners have been tagged.');return;}
  if(room.remaining<=0){endGame(room,'runners','Time ran out — the runners survived!');}
 },1000);
}
io.on('connection',socket=>{
 socket.on('create-room',(payload,cb)=>{
  const code=makeCode();const host={id:socket.id,name:cleanName(payload.name),isHost:true,ready:true,role:null,location:null,caught:false};
  const room={code,huntName:String(payload.huntName||'Friendly Hunt').slice(0,32),maxPlayers:Math.max(2,Math.min(20,Number(payload.maxPlayers)||8)),hunterCount:Math.max(1,Number(payload.hunterCount)||2),duration:Math.max(60,Math.min(7200,Number(payload.duration)||1800)),zone:Array.isArray(payload.zone)?payload.zone:[],players:new Map([[socket.id,host]]),status:'lobby',remaining:0,timer:null};
  rooms.set(code,room);socket.join(code);socket.data.room=code;cb?.({ok:true,room:code,isHost:true,playerId:socket.id,players:publicRoom(room).players,zone:room.zone,huntName:room.huntName});updateRoom(room);
 });
 socket.on('join-room',(payload,cb)=>{
  const code=String(payload.code||'').toUpperCase().trim(),room=rooms.get(code);
  if(!room)return cb?.({ok:false,error:'Room not found. Check the code with your host.'});
  if(room.status!=='lobby')return cb?.({ok:false,error:'This hunt has already started.'});
  if(room.players.size>=room.maxPlayers)return cb?.({ok:false,error:'This room is full.'});
  if([...room.players.values()].some(p=>p.name.toLowerCase()===cleanName(payload.name).toLowerCase()))return cb?.({ok:false,error:'That name is already in this room.'});
  const player={id:socket.id,name:cleanName(payload.name),isHost:false,ready:false,role:null,location:null,caught:false};
  room.players.set(socket.id,player);socket.join(code);socket.data.room=code;
  cb?.({ok:true,room:code,isHost:false,playerId:socket.id,players:publicRoom(room).players,zone:room.zone,huntName:room.huntName});updateRoom(room);
 });
 socket.on('set-ready',({room:code,ready})=>{const room=rooms.get(code),p=room?.players.get(socket.id);if(!p||room.status!=='lobby')return;p.ready=!!ready;updateRoom(room);});
 socket.on('start-game',({room:code,zone,duration})=>{
  const room=rooms.get(code);if(!room||room.players.get(socket.id)?.isHost!==true||room.status!=='lobby')return;
  if(room.players.size<2){socket.emit('tag-result',{message:'Invite at least one more player first.'});return;}
  if(Array.isArray(zone)&&zone.length>=3)room.zone=zone;
  room.duration=Math.max(60,Math.min(7200,Number(duration)||room.duration));
  const players=[...room.players.values()].sort(()=>Math.random()-.5);
  const hunters=Math.min(room.hunterCount,players.length-1);
  players.forEach((p,i)=>{p.role=i<hunters?'hunter':'runner';p.caught=false;});
  room.status='live';room.remaining=room.duration;
  players.forEach(p=>io.to(p.id).emit('role-assigned',{role:p.role,duration:room.duration,zone:room.zone}));
  startTimer(room);updateRoom(room);
 });
 socket.on('player-location',({room:code,location})=>{
  const room=rooms.get(code),p=room?.players.get(socket.id);
  if(!p||room.status!=='live'||!location||!Number.isFinite(location.lat)||!Number.isFinite(location.lng))return;
  p.location={lat:location.lat,lng:location.lng,at:Date.now()};
  if(!withinPolygon(p.location,room.zone))socket.emit('tag-result',{message:'You are outside the play area — return safely inside.'});
  const players=[...room.players.values()].map(q=>({id:q.id,name:q.name,role:q.role,caught:q.caught,location:q.id===socket.id||p.role==='hunter'||q.role==='hunter'?q.location:null}));
  io.to(room.code).emit('players-location',{room:code,players});
 });
 socket.on('request-players',({room:code})=>{const room=rooms.get(code);if(!room)return;const p=room.players.get(socket.id);socket.emit('players-location',{room:code,players:[...room.players.values()].map(q=>({id:q.id,name:q.name,role:q.role,caught:q.caught,location:q.id===socket.id||p?.role==='hunter'||q.role==='hunter'?q.location:null}))});});
 socket.on('tag-nearest',({room:code})=>{
  const room=rooms.get(code),hunter=room?.players.get(socket.id);
  if(!room||room.status!=='live'||hunter?.role!=='hunter'||!hunter.location)return socket.emit('tag-result',{message:'Share your location first.'});
  const nearby=[...room.players.values()].filter(p=>p.role==='runner'&&!p.caught&&p.location&&Date.now()-p.location.at<15000).map(p=>({p,d:distanceMeters(hunter.location,p.location)})).filter(x=>x.d<=20).sort((a,b)=>a.d-b.d);
  if(!nearby.length)return socket.emit('tag-result',{message:'No runner close enough. Move within 20 metres.'});
  nearby[0].p.caught=true;io.to(room.code).emit('tag-result',{message:`${nearby[0].p.name} was tagged!`});
  updateRoom(room);
  const runners=[...room.players.values()].filter(p=>p.role==='runner');
  if(runners.every(p=>p.caught))endGame(room,'hunters','All runners have been tagged.');
 });
 socket.on('leave-room',({room:code})=>removePlayer(socket,code));
 socket.on('disconnect',()=>{if(socket.data.room)removePlayer(socket,socket.data.room);});
});
function removePlayer(socket,code){const room=rooms.get(code);if(!room)return;room.players.delete(socket.id);socket.leave(code);if(!room.players.size){stopTimer(room);rooms.delete(code);return;}if(room.players.size&&![...room.players.values()].some(p=>p.isHost)){const next=room.players.values().next().value;next.isHost=true;}if(room.status==='live'&&![...room.players.values()].some(p=>p.role==='runner'&&!p.caught))endGame(room,'hunters','No runners remain.');updateRoom(room);}
const dist=path.resolve(__dirname,'../dist');
app.use(express.static(dist));
app.get('*',(req,res,next)=>{if(req.path.startsWith('/api/'))return next();res.sendFile(path.join(dist,'index.html'),err=>{if(err)res.status(404).send('Build the frontend first with npm run build.');});});
server.listen(PORT,'0.0.0.0',()=>console.log(`HUNT//ZONE server listening on http://localhost:${PORT}`));
