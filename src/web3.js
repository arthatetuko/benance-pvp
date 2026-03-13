import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate"
import { GasPrice } from "@cosmjs/stargate"

const RPC = "https://terra-classic-rpc.publicnode.com"
const CHAIN_ID = "columbus-5"

const CONTRACT_ADDRESS = "terra18yrfs25t0ewk6u4nj6mgkdv4vcnngwkn54xyjyd6607swtmv0jwsswgl9y"

let client=null
let walletAddress=null

export async function connectWallet(){

 if(!window.keplr){
  alert("Please install Keplr Wallet")
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
  {gasPrice}
 )

 return walletAddress
}

export async function reconnectWallet(){

 if(!window.keplr) return null

 try{

  await window.keplr.enable(CHAIN_ID)

  const signer = window.getOfflineSigner(CHAIN_ID)

  const accounts = await signer.getAccounts()

  walletAddress = accounts[0].address

  const gasPrice = GasPrice.fromString("0.15uluna")

  client = await SigningCosmWasmClient.connectWithSigner(
   RPC,
   signer,
   {gasPrice}
  )

  return walletAddress

 }catch(err){

  console.log("Reconnect failed",err)

  return null
 }

}

export async function depositBattle(amount){

 if(!client){
  alert("Wallet not connected")
  return null
 }

 const msg = {
  CreateBattle:{}
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

 const txHash = result.transactionHash

 return txHash
}

export async function joinBattle(battleId,amount){

 const msg={
  JoinBattle:{
   battle_id:battleId
  }
 }

 const fee={
  amount:[{denom:"uluna",amount:"5000"}],
  gas:"200000"
 }

 const funds=[{
  denom:"uluna",
  amount:String(amount*1000000)
 }]

 const tx=await client.execute(
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

 const msg={
  ClaimPrize:{
   battle_id:battleId
  }
 }

 const fee={
  amount:[{denom:"uluna",amount:"20000"}],
  gas:"900000"
 }

 const tx=await client.execute(
  walletAddress,
  CONTRACT_ADDRESS,
  msg,
  fee
 )

 return tx.transactionHash
}

export function getWalletAddress(){
 return walletAddress
}