const RPC = "https://terra-classic-rpc.publicnode.com"
const CHAIN_ID = "columbus-5"
const CONTRACT_ADDRESS = "terra19aaz3w0lk2uvwc0gksypdtl0znjw96y7wfwx3sya7d4r54rqmqws2wqvw6"

let client = null
let walletAddress = null

let SigningCosmWasmClient
let GasPrice

async function loadCosm(){

 if(!SigningCosmWasmClient){

  const cosm = await import("@cosmjs/cosmwasm-stargate")
  const stargate = await import("@cosmjs/stargate")

  SigningCosmWasmClient = cosm.SigningCosmWasmClient
  GasPrice = stargate.GasPrice

 }

}

export async function connectWallet(){

  await loadCosm()

 if(!window.keplr){
  alert("Install Keplr Wallet")
  return null
 }

 await window.keplr.enable(CHAIN_ID)

 const offlineSigner = window.getOfflineSigner(CHAIN_ID)

 const accounts = await offlineSigner.getAccounts()

 walletAddress = accounts[0].address

 const gasPrice = GasPrice.fromString("0.15uluna")

 client = await SigningCosmWasmClient.connectWithSigner(
  RPC,
  offlineSigner,
  { gasPrice }
 )

 return walletAddress
}

export async function reconnectWallet() {

 if (!window.keplr) return null

 try {

  await window.keplr.enable(CHAIN_ID)

  const offlineSigner = window.getOfflineSigner(CHAIN_ID)
  const accounts = await offlineSigner.getAccounts()

  walletAddress = accounts[0].address

  const gasPrice = GasPrice.fromString("0.15uluna")

  client = await SigningCosmWasmClient.connectWithSigner(
   RPC,
   offlineSigner,
   { gasPrice }
  )

  return walletAddress

 } catch (err) {

  console.log("Reconnect failed", err)
  return null

 }
}

export function getClient(){
 return client
}

export function getWallet(){
 return walletAddress
}

export async function depositBattle(amount, startTime){

 if(!client){
  alert("Wallet not connected")
  return null
 }

 const msg = {
  CreateBattle: {}
}

 const funds = [{
  denom:"uluna",
  amount:String(Math.floor(amount * 1000000))
 }]

 const result = await client.execute(
  walletAddress,
  CONTRACT_ADDRESS,
  msg,
  "auto",
  "",
  funds
 )

 return result
}

export async function cancelBattle(battleId){

 try{

  if(!client || !walletAddress){
   console.error("Wallet not connected")
   return false
  }

  const msg = {
 CancelBattle: {
  battle_id: battleId
 }
}

  const fee = {
   amount: [{ denom: "uluna", amount: "8000" }],
   gas: "400000"
  }

  const result = await client.execute(
   walletAddress,
   CONTRACT_ADDRESS,
   msg,
   fee
  )

  console.log("Cancel success", result)

// ambil tx hash
const txHash = result.transactionHash || result.hash

// tampilkan popup seperti create battle
showTxPopup(
 "Battle Canceled",
 txHash
)

  // beri tahu server
  socket.emit("cancelBattle", {
   id: battleId,
   wallet: walletAddress
  })

  return true

 }catch(err){

  console.error("Cancel failed", err)
  return false

 }

}

export async function joinBattle(battleId, amount){

 if(!client) throw new Error("Wallet not connected")

 const msg = {
  JoinBattle:{
   battle_id: battleId
  }
 }

 const fee = {
  amount:[{
   denom:"uluna",
   amount:"5000"
  }],
  gas:"200000"
 }

 const funds=[{
  denom:"uluna",
  amount:String(amount * 1000000)
 }]

 const tx = await client.execute(
  walletAddress,
  CONTRACT_ADDRESS,
  msg,
  fee,
  "",
  funds
 )

 return tx.transactionHash

}

export async function claimPrize(battleId){

 if(!client){
  alert("Wallet not connected")
  return null
 }

 const msg = {
  ClaimPrize:{
   battle_id: battleId
  }
 }

 const fee = {
  amount:[{
   denom:"uluna",
   amount:"20000"
  }],
  gas:"900000"
 }

 const result = await client.execute(
  walletAddress,
  CONTRACT_ADDRESS,
  msg,
  fee
 )

 return result.transactionHash
}

export function getWalletAddress(){
 return walletAddress
}
