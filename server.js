const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let waitingPlayer = null;

console.log("Player connected:", socket.id);

 socket.on("joinBattle", ()=>{

   if (!waitingPlayer){

     waitingPlayer = socket;
     socket.emit("status","Waiting opponent...");

   } else {

     const roomId = "room-" + Math.random().toString(36).substr(2,5);

     const seed = Math.floor(Math.random() * 100000);
     const startTime = Date.now() + 5000;

     socket.join(roomId);
     waitingPlayer.join(roomId);

     socket.roomId = roomId;
     waitingPlayer.roomId = roomId;

     socket.emit("startGame",{seed,startTime});
     waitingPlayer.emit("startGame",{seed,startTime});

     waitingPlayer = null;

   }

  socket.on("score", (score) => {

    if(socket.roomId){
      socket.to(socket.roomId).emit("opponentScore", score);
    }

  });

  socket.on("playerPosition", (pos) => {

    if(socket.roomId){
      socket.to(socket.roomId).emit("opponentPosition", pos);
    }

  });

  // ⭐ TAMBAHKAN INI
  socket.on("playerDead", () => {

    if(socket.roomId){
      socket.to(socket.roomId).emit("opponentDead");
    }

  });

});


const PORT = process.env.PORT || 3000;

server.listen(PORT,()=>{
 console.log("Server running on port " + PORT);
});