const { ethers } = require("ethers");
const { Provider } = require("zksync-ethers");
const { resolve } = require("path");

require('dotenv').config({ path: resolve(__dirname, '../../../.env') });

const zkSyncUrl = "https://sepolia.era.zksync.dev";
const provider = new Provider(zkSyncUrl);
const contractAddress = process.env.FINGERPRINT_PROXY_SC;
const PRIVATE_KEY = process.env.ZKSYNC_SEPOLIA_PRIVATE_KEY || "";
const wallet = new ethers.Wallet(PRIVATE_KEY).connect(provider);

async function insertFingerprint(fingerprint) {
  const functionSignature = "appendData(bytes32)";
  const functionHash = ethers.keccak256(ethers.toUtf8Bytes(functionSignature)).slice(0, 10);
  const dataHashPadded = fingerprint.slice(2).padStart(64, "0");
  const data = functionHash + dataHashPadded;

  try {
    const tx = await wallet.sendTransaction({
      to: contractAddress,
      data: data,
    });
    console.log(`Transaction sent: ${tx.hash}`);
    await tx.wait();
    console.log("Transaction confirmed");
    return true;
  } catch (error) {
    console.error(`Transaction failed: ${error.message}`);
    return false;
  }
}

async function checkFingerprint(fingerprint) {
  const functionSignatureCheck = "isHashAppended(bytes32)";
  const functionHashCheck = ethers.keccak256(ethers.toUtf8Bytes(functionSignatureCheck)).slice(0, 10);
  const dataHashPadded = fingerprint.slice(2).padStart(64, "0");
  const dataCheck = functionHashCheck + dataHashPadded;

  try {
    const result = await provider.call({
      to: contractAddress,
      data: dataCheck,
      from: wallet.address,
    });
    const isAppended = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], result)[0];
    return isAppended;
  } catch (error) {
    console.error(`Failed to check fingerprint: ${error.message}`);
    return false;
  }
}

module.exports = {
  insertFingerprint,
  checkFingerprint,
};
