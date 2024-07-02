// writeBoth.js
const { resolve } = require("path");
const { DB } = require("../../sdk");
const fs = require('fs');
const snarkjs = require("snarkjs");
const crypto = require('crypto');
require("@nomiclabs/hardhat-ethers");

require('dotenv').config({ path: resolve(__dirname, '../../../.env') });
require('events').EventEmitter.defaultMaxListeners = 15;

async function initializeZKDB() {
  const wasm = resolve(__dirname, "../../../circom/build/circuits/db/index_js/index.wasm");
  const zkey = resolve(__dirname, "../../../circom/build/circuits/db/index_0001.zkey");
  const url = process.env.MONGO_URL;
  const dbName = process.env.MONGO_DB;

  const zkdb = new DB({ wasm, zkey, mongoUrl: url, dbName: dbName });
  await zkdb.init();
  await zkdb.addCollection();
  return zkdb;
}

async function onChainVerification(zkdb, fullRecord) {
  const [committer] = await ethers.getSigners();
  const VerifierRU = await ethers.getContractFactory("Groth16VerifierRU");
  const verifierRU = await VerifierRU.deploy();
  await verifierRU.deployed();

  const VerifierDB = await ethers.getContractFactory("Groth16VerifierDB");
  const verifierDB = await VerifierDB.deploy();
  await verifierDB.deployed();

  const MyRU = await ethers.getContractFactory("MyRollup");
  const myru = await MyRU.deploy(verifierRU.address, verifierDB.address, committer.address);
  await myru.deployed();

  const zkp = await zkdb.genProof({
    json: fullRecord,
    col_id: 'counterstrike',
    path: "gamer",
    id: `"${fullRecord.gamer}"`,
  });

  try {
    const result = await myru.validateProof(zkp);
    return result;
  } catch (error) {
    console.error("On-chain verification failed:", error);
    return false;
  }
}

function createFingerprint(json) {
  const jsonString = JSON.stringify(json);
  const hash = crypto.createHash('sha256');
  hash.update(jsonString);
  return hash.digest('hex');
}

async function main() {
  const zkdb = await initializeZKDB();

  const json = { gamer: "Merkle", strikes: 793287, place: "SP", weapon: "AK-47", place2: "Y" };
  json.fingerprint = createFingerprint(json);

  const start = process.hrtime();
  await zkdb.insert('counterstrike', json.gamer, json, false);
  const { proof, publicSignals } = await zkdb.genSignalProof({
    json: json,
    col_id: 'counterstrike',
    path: "gamer",
    id: `"${json.gamer}"`,
  });
  
  const vkey = JSON.parse(fs.readFileSync(resolve(__dirname, "../../../circom/build/circuits/db/verification_key.json")));
  const isValidOffChain = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  const isValidOnChain = await onChainVerification(zkdb, json);

  if (isValidOffChain && isValidOnChain) {
    await zkdb.insert('counterstrike', json.gamer, { ...json, zkProof: proof }, true);
    const end = process.hrtime(start);
    const timeInSeconds = end[0] + end[1] / 1e9;
    fs.appendFileSync(resolve(__dirname, "benchmark-report.txt"), `Write-Both - ${timeInSeconds.toFixed(6)} seconds\n`, 'utf8');
  } else {
    console.error("Both proof verifications failed.");
  }
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
