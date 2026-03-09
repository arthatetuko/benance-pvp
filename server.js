const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let battles = [];
let battleId = 1;

function updatePlayers(){

 const now = Date.now();

 battles = battles.filter(b => {

  const room = "battle-"+b.id;

  const players = io.sockets.adapter.rooms.get(room)?.size || 0;

  b.players = players;

  b.peeps = b.peeps || 0;

  // jika battle sudah selesai
  if(b.finished){

   // hapus jika lebih dari 1 menit
   if(now - b.startTime > 60000){
    return false;
   }

   return true;
  }

  if(now >= b.startTime && players === 0){
   b.status = "REJECTED";
  }

  return true;

 });
}

setInterval(()=>{

 updatePlayers();

 io.sockets.sockets.forEach(s => {

  const visibleBattles = battles.filter(b => {

   if(b.creator === s.wallet) return true;

   if(b.status === "REJECTED") return false;

   return true;

  });

  s.emit("battleList", visibleBattles);

 });

},1000);

io.on("connection",(socket)=>{

socket.on("registerWallet",(wallet)=>{
 socket.wallet = wallet;
});

 console.log("Player connected:",socket.id);

 updatePlayers();
const visibleBattles = battles.filter(b => {

 // creator selalu bisa lihat
 if(b.creator === socket.wallet) return true;

 // challenger tidak lihat rejected
 if(b.status === "REJECTED") return false;

 return true;

});

socket.emit("battleList", visibleBattles);

 socket.on("createBattle",(data)=>{

 const room = "battle-" + battleId;

 const battle={
 id:battleId++,
 creator:data.creator,
 bet:Number(data.bet),
 pot:Number(data.bet), // creator deposit
 startTime:data.startTime,
 challenger:null,
 status:"OPEN",
 room:room,
 finished:false,
 peeps:0
};

 battles.push(battle);

 io.sockets.sockets.forEach(s => {

 const visibleBattles = battles.filter(b => {

  if(b.creator === s.wallet) return true;

  if(b.status === "REJECTED") return false;

  return true;

 });

 s.emit("battleList", visibleBattles);

});

});

socket.on("cancelBattle",(data)=>{

 const index = battles.findIndex(b=>b.id === data.id);

 if(index === -1) return;

 const battle = battles[index];

 // hanya creator yang boleh cancel
 if(battle.creator !== data.wallet) return;

 const room = "battle-" + battle.id;

 const players = io.sockets.adapter.rooms.get(room)?.size || 0;

 // jika sudah ada challenger
 if(players >= 1){

  socket.emit("cancelDenied","Can not cancel, battle has been accepted");

  return;

 }

 battles.splice(index,1);

io.sockets.sockets.forEach(s => {

 const visibleBattles = battles.filter(b => {

  if(b.creator === s.wallet) return true;

  if(b.status === "REJECTED") return false;

  return true;

 });

 s.emit("battleList", visibleBattles);

});

});

socket.on("playerPosition",(data)=>{

 socket.to(data.room).emit("opponentPosition",{
 id: socket.id,
 y: data.y
});

 // kirim juga ke spectator
 socket.to(data.room + "-peep").emit("opponentPosition",{
 id: socket.id,
 y: data.y
});

});

 socket.on("joinBattle",(data)=>{

 const battle = battles.find(b=>b.id === data.id);
 if(!battle) return;

 const now = Date.now();
 if(now >= battle.startTime){
  socket.emit("joinDenied","Battle already started");
  return;
 }

 const room = "battle-" + battle.id;

 const players = io.sockets.adapter.rooms.get(room)?.size || 0;

 if(players >= 2){
  socket.emit("joinDenied","Room already full");
  return;
 }

 // creator join (tidak deposit)
 if(data.wallet === battle.creator){

  socket.join(room);

  socket.skin = data.skin || "changpeng";

socket.to(room).emit("opponentSkin",{
 id: socket.id,
 skin: socket.skin
});

// kirim juga ke spectator
socket.to(room + "-peep").emit("opponentSkin",{
 id: socket.id,
 skin: socket.skin
});

// kirim skin player yang sudah ada ke player ini
const clients = io.sockets.adapter.rooms.get(room);

if(clients){

 clients.forEach(id=>{

  const s = io.sockets.sockets.get(id);

  if(s && s !== socket && s.skin){
   socket.emit("opponentSkin",{
 id: s.id,
 skin: s.skin
});
  }

 });

}

// spectator juga harus menerima
socket.to(room + "-peep").emit("opponentSkin",{
 id: socket.id,
 skin: socket.skin
});

 } 
 else {

 if(battle.challenger){
  socket.emit("joinDenied","Room already full");
  return;
 }

 if(Number(data.bet) !== Number(battle.bet)){
  socket.emit("joinDenied","Bet amount must match creator bet");
  return;
 }

 socket.join(room);

 socket.skin = data.skin || "changpeng";

 // kirim skin challenger ke creator
 socket.to(room).emit("opponentSkin",{
  id: socket.id,
  skin: socket.skin
 });

 // kirim skin creator ke challenger
 const clients = io.sockets.adapter.rooms.get(room);

 if(clients){

  clients.forEach(id=>{

   const s = io.sockets.sockets.get(id);

   if(s && s !== socket && s.skin){
    socket.emit("opponentSkin",{
     id: s.id,
     skin: s.skin
    });
   }

  });

 }

 battle.challenger = data.wallet;
 battle.pot += Number(data.bet);
 battle.status = "PLAYER READY";

}

 updatePlayers();

 io.sockets.sockets.forEach(s => {

  const visibleBattles = battles.filter(b => {

   if(b.creator === s.wallet) return true;
   if(b.status === "REJECTED") return false;

   return true;

  });

  s.emit("battleList", visibleBattles);

 });

 const playersNow = io.sockets.adapter.rooms.get(room)?.size || 0;

const seed = Math.floor(Math.random()*100000);

// kirim countdown ke semua pemain di room
io.to(room).emit("startGame",{
 seed: seed,
 startTime: battle.startTime
});

// kirim juga ke spectator
io.to(room + "-peep").emit("startGame",{
 seed: seed,
 startTime: battle.startTime
});

});

socket.on("peepBattle",(data)=>{

 const battle = battles.find(b=>b.id === data.id);
 if(!battle) return;

 if(battle.status === "CLOSED") return;

 const room = "battle-" + battle.id + "-peep";

 socket.join(room);

 // kirim info game ke spectator
 const seed = Math.floor(Math.random()*100000);

 socket.emit("startGame",{
  seed: seed,
  startTime: battle.startTime
 });

 const players = io.sockets.adapter.rooms.get("battle-" + battle.id);

 if(players){

  players.forEach(id=>{

   const s = io.sockets.sockets.get(id);

   if(s && s.skin){
    socket.emit("opponentSkin",{
     id: s.id,
     skin: s.skin
    });
   }

  });

 }

 battle.peeps++;

});

socket.on("claimPrize",(data)=>{

 const battle = battles.find(b=>b.room === data.room);

 if(!battle) return;

 const prize = battle.pot;

 console.log("Winner:",data.wallet,"Prize:",prize,"LUNC");


});

 socket.on("playerDead",(room)=>{

 const battle = battles.find(b => b.room === room);

 if(!battle) return;

 // jika battle sudah selesai abaikan
 if(battle.finished) return;

 const players = io.sockets.adapter.rooms.get(room)?.size || 0;

 // jika hanya 1 player → dia menang
 if(players === 1){

  battle.finished = true;
  battle.status = "CLOSED";

  io.to(room).emit("opponentDead");
  io.to(room + "-peep").emit("opponentDead");

  return;

 }

 // PvP normal
 battle.finished = true;

 socket.emit("youLose");

 socket.to(room).emit("opponentDead");
 io.to(room + "-peep").emit("opponentDead");

});

 socket.on("disconnect",()=>{

 battles.forEach(b=>{

  if(b.finished) return;

  const room = "battle-" + b.id;

  const players = io.sockets.adapter.rooms.get(room)?.size || 0;

  const now = Date.now();

  // hanya jika game sudah dimulai
  if(now < b.startTime) return;

  const peepRoom = "battle-" + b.id + "-peep";

if(socket.rooms.has(peepRoom)){
 if(b.peeps > 0) b.peeps--;
}

  if(players === 1){

   b.finished = true;
   b.status = "CLOSED";

   io.to(room).emit("opponentDead");
   io.to(room + "-peep").emit("opponentDead");

  }

 });

});
 

});

const PORT = process.env.PORT || 3000;

server.listen(PORT,()=>{

 console.log("Server running:",PORT);

});