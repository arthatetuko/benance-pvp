require("dotenv").config()

const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const path = require("path")

const { SigningCosmWasmClient } = require("@cosmjs/cosmwasm-stargate")
const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing")
const { GasPrice } = require("@cosmjs/stargate")
const { stringToPath } = require("@cosmjs/crypto")

const RPC = "https://terra-classic-rpc.publicnode.com"
let serverClient
let serverAddress

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
 process.env.SUPABASE_URL,
 process.env.SUPABASE_SERVICE_KEY
)

const axios = require("axios");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const TELEGRAM_TOPIC_ID = process.env.TELEGRAM_TOPIC_ID

const app = express();
const server = http.createServer(app);
const io=new Server(server,{
 cors:{
  origin:"*",
  methods:["GET","POST"],
  credentials:true
 },
 transports:["websocket","polling"]
})

/* SERVE DIST BUILD */
app.use(express.static(path.join(__dirname,"dist")))

app.get("*",(req,res)=>{
 res.sendFile(path.join(__dirname,"dist/index.html"))
})


let battles = [];

let onlinePlayers = 0;

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


const LCD = "https://terra-classic-lcd.publicnode.com"
const CONTRACT_ADDRESS = "terra19aaz3w0lk2uvwc0gksypdtl0znjw96y7wfwx3sya7d4r54rqmqws2wqvw6"

const usedTx = new Set()

async function verifyDeposit(txHash, expectedAmount, wallet){

 try{

  console.log("VERIFY TX:", txHash)
  console.log("EXPECTED AMOUNT:", expectedAmount)
  console.log("WALLET:", wallet)

  if(usedTx.has(txHash)){
   console.log("TX ALREADY USED")
   return false
  }

  const res = await fetch(`${LCD}/cosmos/tx/v1beta1/txs/${txHash}`)
  const data = await res.json()

  if(!data.tx_response){
   console.log("NO TX RESULT")
   return false
  }

  const tx = data.tx_response
  const logs = tx.logs || []

  let sender = null
  let amount = null
  let contract = null
  let battleId = null

  logs.forEach(log=>{

   log.events.forEach(e=>{

    if(e.type === "message"){
     e.attributes.forEach(a=>{
      if(a.key === "sender") sender = a.value
     })
    }

    if(e.type === "transfer"){
     e.attributes.forEach(a=>{
      if(a.key === "amount"){

       const parts = a.value.split(",")

       parts.forEach(p=>{
        if(p.includes("uluna")) amount = p
       })

      }
     })
    }

    if(e.type === "execute"){
     e.attributes.forEach(a=>{
      if(a.key === "_contract_address"){
       contract = a.value
      }
     })
    }

    if(e.type === "wasm"){
     e.attributes.forEach(a=>{

      if(a.key === "battle_id"){
       battleId = Number(a.value)
       }

      })
    }

   })

  })

  console.log("SENDER:", sender)
  console.log("AMOUNT:", amount)
  console.log("CONTRACT:", contract)

  if(sender !== wallet){
   console.log("SENDER MISMATCH")
   return false
  }

  if(contract !== CONTRACT_ADDRESS){
   console.log("WRONG CONTRACT")
   return false
  }

  if(!amount){
   console.log("NO AMOUNT FOUND")
   return false
  }

  const lunc = Number(amount.replace("uluna","")) / 1000000

  console.log("LUNC:", lunc)

  if(Math.abs(lunc - expectedAmount) > 0.000001){
   console.log("AMOUNT MISMATCH")
   return false
  }

  usedTx.add(txHash)

  console.log("VERIFY SUCCESS")

  return {
  valid: true,
  battleId: battleId
  }

 }catch(e){

  console.log("TX verify error",e)

  return false

 }

}

async function initServerWallet(){

 const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
 process.env.SERVER_MNEMONIC,
 {
  prefix: "terra",
  hdPaths: [stringToPath("m/44'/330'/0'/0/0")]
 }
)

 const accounts = await wallet.getAccounts()

 serverAddress = accounts[0].address

 serverClient = await SigningCosmWasmClient.connectWithSigner(
  RPC,
  wallet,
  {
   gasPrice: GasPrice.fromString("28.325uluna")
  }
 )

 console.log("SERVER WALLET:", serverAddress)

}

async function submitWinner(battleId, winner){

 try{

  const msg = {
   SubmitWinner:{
    battle_id: battleId,
    winner: winner
   }
  }

  const result = await serverClient.execute(
   serverAddress,
   CONTRACT_ADDRESS,
   msg,
   "auto"
  )

  console.log("SubmitWinner success:", result.transactionHash)

 }catch(err){

  console.error("SubmitWinner failed:", err)
  console.log("Submitting winner:", winner)
  console.log("Battle ID:", battleId)

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

 socket.on("createBattle", async (data)=>{

 console.log("CREATE BATTLE EVENT:", data);

 const {bet,startTime,creator,txHash} = data

 const result = await verifyDeposit(txHash, Number(bet), creator)

if(!result.valid){

 socket.emit("joinDenied","Deposit verification failed")
 return

}

 const contractBattleId = result.battleId

 const room = "battle-" + contractBattleId;

 const battle={
 id:contractBattleId,
 creator:creator,
  bet:Number(bet),
  pot:Number(bet),
  startTime:startTime,
  challenger:null,
  status:"OPEN",
  room:room,
  finished:false,
  peeps:0
 };

 battles.push(battle);

 io.emit("battleList", battles)

 sendTelegram(
`🔥 NEW BENANCE PvP BATTLE

Creator: ${battle.creator}

💰 Bet: ${formatLunc(bet)} LUNC
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

 // hanya creator
 if(battle.creator !== data.wallet) return;

 const room = "battle-" + battle.id;
 const peepRoom = room + "-peep";

 // jika sudah ada challenger tidak boleh cancel
 if(battle.challenger){
  socket.emit("cancelDenied","Can not cancel, battle has been accepted");
  return;
 }

 // =========================
 // CANCEL → langsung hapus battle
 // =========================

 battles.splice(index,1);

 // beri tahu spectator
 io.to(peepRoom).emit("battleCanceled");

 // refresh lobby
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

 socket.on("joinBattle", async (data)=>{

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

 const valid = await verifyDeposit(
  data.txHash,
  Number(data.bet),
  data.wallet
 )

 if(!valid){
  socket.emit("joinDenied","Deposit verification failed")
  return
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

  const roomSockets = io.sockets.adapter.rooms.get(room)

let winner = null

if(roomSockets){

 const remaining = [...roomSockets]

 if(remaining.length > 0){

  const winnerSocket = io.sockets.sockets.get(remaining[0])

  if(winnerSocket){
   winner = winnerSocket.wallet
  }

 }

}

await submitWinner(battle.id, winner)

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

 const roomSockets = io.sockets.adapter.rooms.get(room)

let winner = null

if(roomSockets){

 const remaining = [...roomSockets]

 if(remaining.length > 0){

  const winnerSocket = io.sockets.sockets.get(remaining[0])

  if(winnerSocket){
   winner = winnerSocket.wallet
  }

 }

}

// 🔥 TAMBAHKAN INI
await submitWinner(battle.id, winner)

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

  socket.leave(room)

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

initServerWallet()

server.listen(PORT,()=>{

 console.log("Server running:",PORT);

});