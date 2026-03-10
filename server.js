require("dotenv").config()

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
 process.env.SUPABASE_URL,
 process.env.SUPABASE_SERVICE_KEY
)

const axios = require("axios");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const TELEGRAM_TOPIC_ID = process.env.TELEGRAM_TOPIC_ID

async function sendTelegram(message){

 try{

  await axios.post(
   `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
   {
    chat_id: TELEGRAM_CHAT_ID,
    message_thread_id: TELEGRAM_TOPIC_ID,
    text: message
   }
  );

 }catch(err){

  console.log("Telegram error:", err.message);

 }

}

function formatLunc(amount){
 return Number(amount).toLocaleString("en-US",{
  minimumFractionDigits:2,
  maximumFractionDigits:2
 });
}

function getUTCDate(){

 const now = new Date();

 return now.toISOString().replace("T"," ").replace("Z"," UTC");

}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let battles = [];
let battleId = 1;

let onlinePlayers = 0;

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

 onlinePlayers++;

 io.emit("onlinePlayers", onlinePlayers);

socket.on("registerWallet", async (wallet)=>{

 socket.wallet = wallet;

 await supabase
 .from("players")
 .upsert({
  wallet: wallet
 });

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
 sendTelegram(
`🔥 NEW BENANCE PvP BATTLE

Creator: ${battle.creator}

💰 Bet: ${formatLunc(data.bet)} LUNC
🎮 Battle ID: ${battle.id}
📅 ${getUTCDate()}

⚔ Waiting for challenger`
);

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

 const peepRoom = room + "-peep";

 const players = io.sockets.adapter.rooms.get(room)?.size || 0;

 // jika sudah ada challenger
 if(players >= 1){

  socket.emit("cancelDenied","Can not cancel, battle has been accepted");

  return;

 }

 io.to(peepRoom).emit("battleCanceled");

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

 // FIX BUG spectator
socket.to(room + "-peep").emit("opponentSkin",{
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

 sendTelegram(
`⚔ BENANCE PvP MATCH ACCEPTED

Creator: ${battle.creator}
Challenger: ${data.wallet}

💰 Bet: ${formatLunc(battle.bet)} LUNC
🎮 Battle ID: ${battle.id}
📅 ${getUTCDate()}

🚀 Battle starting soon`
);

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

 socket.on("playerDead", async (room)=>{

 const battle = battles.find(b => b.room === room);

 if(!battle) return;

 // jika battle sudah selesai abaikan
 if(battle.finished) return;

 const players = io.sockets.adapter.rooms.get(room)?.size || 0;

 // jika hanya 1 player → dia menang
 if(players === 1){

  battle.finished = true;
  battle.status = "CLOSED";

  const loser = socket.wallet;
const winner = loser === battle.creator ? battle.challenger : battle.creator;

await supabase
 .from("battles")
 .insert({
  creator_wallet: battle.creator,
  challenger_wallet: battle.challenger,
  winner_wallet: winner,
  bet: battle.bet,
  pot: battle.pot,
  start_time: new Date(battle.startTime),
  end_time: new Date()
 });

 await supabase.rpc("update_player_stats",{
 creator_wallet: battle.creator,
 challenger_wallet: battle.challenger,
 winner_wallet: winner,
 volume: battle.pot
});

  sendTelegram(
`🏆 BENANCE PvP WINNER

👑 Winner: ${winner}

💰 Prize: ${formatLunc(battle.pot)} LUNC
🎮 Battle ID: ${battle.id}`
  );

  io.emit("statsUpdated");

  io.to(room).emit("opponentDead");
  io.to(room + "-peep").emit("opponentDead");

  return;

 }

 // PvP normal
 battle.finished = true;

 const loser = socket.wallet;
const winner = loser === battle.creator ? battle.challenger : battle.creator;

await supabase
.from("battles")
.insert({
 creator_wallet: battle.creator,
 challenger_wallet: battle.challenger,
 winner_wallet: winner,
 bet: battle.bet,
 pot: battle.pot,
 start_time: new Date(battle.startTime),
 end_time: new Date()
});

await supabase.rpc("update_player_stats",{
 creator_wallet: battle.creator,
 challenger_wallet: battle.challenger,
 winner_wallet: winner,
 volume: battle.pot
});

  sendTelegram(
`🏆 BENANCE PvP WINNER

👑 Winner: ${winner}

💰 Prize: ${formatLunc(battle.pot)} LUNC
🎮 Battle ID: ${battle.id}`
  );

  io.emit("statsUpdated");

 socket.emit("youLose");

 socket.to(room).emit("opponentDead");
 io.to(room + "-peep").emit("opponentDead");

});

 socket.on("disconnect",()=>{

 onlinePlayers--;

io.emit("onlinePlayers", onlinePlayers);

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

app.get("/stats", async (req,res)=>{

 const { data: battles } = await supabase
 .from("battles")
 .select("pot");

 const { data: players } = await supabase
 .from("players")
 .select("wallet");

 let volume = 0;

 battles.forEach(b=>{
  volume += Number(b.pot);
 });

 res.json({
  totalBattles: battles.length,
  totalVolume: volume,
  totalPlayers: players.length
 });

});

app.get("/leaderboard/winners", async (req,res)=>{

 const { data } = await supabase
 .from("players")
 .select("*")
 .order("total_wins",{ascending:false})
 .limit(10);

 res.json(data);

});

app.get("/leaderboard/volume", async (req,res)=>{

 const { data } = await supabase
 .from("players")
 .select("*")
 .order("total_volume",{ascending:false})
 .limit(10);

 res.json(data);

});

app.get("/leaderboard/battles", async (req,res)=>{

 const { data } = await supabase
 .from("players")
 .select("*")
 .order("total_battles",{ascending:false})
 .limit(10);

 res.json(data);

});


server.listen(PORT,()=>{

 console.log("Server running:",PORT);

});