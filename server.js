require("dotenv").config()

const express=require("express")
const http=require("http")
const {Server}=require("socket.io")
const path=require("path")

const app=express()

app.set("trust proxy",true)

const server=http.createServer(app)

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

let battles=[]

io.on("connection",(socket)=>{
 console.log("player connected",socket.id)

 socket.on("disconnect",()=>{
  console.log("player disconnected")
 });

socket.on("createBattle", async (data)=>{

 console.log("CREATE BATTLE EVENT:", data);

 const {bet,startTime,creator,txHash} = data

 try{

 const result = await verifyDeposit(txHash, Number(bet), creator)

 if(!result || !result.valid){
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

 console.log("BATTLE CREATED:", battle)

 io.emit("battleList", battles)

 sendTelegram(`🔥 NEW BENANCE PvP BATTLE

Creator: ${battle.creator}

💰 Bet: ${formatLunc(bet)} LUNC
🎮 Battle ID: ${battle.id}
📅 ${getUTCDate()}

⚔ Waiting for challenger`)

 }catch(err){

 console.log("CREATE BATTLE ERROR:", err)

 socket.emit("joinDenied","Server error")

 }

})

})

const PORT=process.env.PORT||3000

server.listen(PORT,()=>{
 console.log("Server running:",PORT)
})

