// queryOffChain.js
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

async function main() {
  const zkdb = await initializeZKDB();

  const collection = zkdb.db.collection('counterstrike');
  const fullRecord = await collection.findOne({ "gamer": "Merkle" });

  if (!fullRecord) {
    console.log("Gamer not found.");
    process.exit(1);
  }
  await zkdb.queryJson('counterstrike', fullRecord.gamer, fullRecord, "gamer", false);
  
  const start = process.hrtime();
  const { proof, publicSignals } = await zkdb.genSignalProof({
    json: fullRecord,
    col_id: 'counterstrike',
    path: "gamer",
    id: `"${fullRecord.gamer}"`,
  });

  const vkey = JSON.parse(fs.readFileSync(resolve(__dirname, "../../../circom/build/circuits/db/verification_key.json")));
  const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const end = process.hrtime(start);

  const timeInSeconds = end[0] + end[1] / 1e9;
  fs.appendFileSync(resolve(__dirname, "benchmark-report.txt"), `Query-OffChain - ${timeInSeconds.toFixed(6)} seconds\n`, 'utf8');

  if (!isValid) {
    console.error("Off-chain proof verification failed.");
  }
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
