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

app.use(express.static(path.join(__dirname)))

app.get("/",(req,res)=>{
 res.sendFile(path.join(__dirname,"index.html"))
})

app.get("/ping",(req,res)=>{
 res.send("pong")
})

io.on("connection",(socket)=>{

 console.log("player connected",socket.id)

 socket.on("disconnect",()=>{
  console.log("player disconnected")
 })

})

const PORT=process.env.PORT||3000

server.listen(PORT,()=>{
 console.log("Server running:",PORT)
})