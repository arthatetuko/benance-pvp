const CHAIN_ID = "columbus-5"

async function connectWallet(){

 if(!window.keplr){
  alert("Please install Keplr Wallet")
  return
 }

 await window.keplr.enable(CHAIN_ID)

 const offlineSigner = window.getOfflineSignerOnlyAmino(CHAIN_ID)
 const accounts = await offlineSigner.getAccounts()

 walletAddress = accounts[0].address

 localStorage.setItem("wallet", walletAddress)

 return walletAddress
}

window.connectWallet = connectWallet