// writeOnChain.js
const { resolve } = require("path");
const { DB } = require("../../sdk");
const fs = require('fs');
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

async function onChainVerification(zkdb, fullRecord, reportPath) {
  let start, end;

  // Measure ethers setup time
  start = process.hrtime();
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
  end = process.hrtime(start);
  let ethersSetupTime = end[0] + end[1] / 1e9;
  fs.appendFileSync(reportPath, `OnChain verification (ethers setup) - ${ethersSetupTime.toFixed(6)} seconds\n`, 'utf8');

  // Measure verification process time
  start = process.hrtime();
  const zkp = await zkdb.genProof({
    json: fullRecord,
    col_id: 'counterstrike',
    path: "gamer",
    id: `"${fullRecord.gamer}"`,
  });
  end = process.hrtime(start);
  let proofGenerationProcess = end[0] + end[1] / 1e9;
  fs.appendFileSync(reportPath, `OnChain verification (proof generation process) - ${proofGenerationProcess.toFixed(6)} seconds\n`, 'utf8');

  try {
    start = process.hrtime();
    const result = await myru.validateProof(zkp);
    end = process.hrtime(start);
    let verificationProcessTime = end[0] + end[1] / 1e9;
    fs.appendFileSync(reportPath, `OnChain verification (verify process) - ${verificationProcessTime.toFixed(6)} seconds\n`, 'utf8');
    return { result, zkp };
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
  const reportPath = resolve(__dirname, "benchmark-report-w-OnChain.txt");
  const zkdb = await initializeZKDB();

  // Measure total time
  const totalStart = process.hrtime();

  const json = { gamer: "Merkle", strikes: 793287, place: "SP", weapon: "AK-47", place2: "Y" };

  // Measure fingerprint creation time
  let start = process.hrtime();
  json.fingerprint = createFingerprint(json);
  let end = process.hrtime(start);
  let fingerprintTime = end[0] + end[1] / 1e9;
  fs.appendFileSync(reportPath, `Fingerprint creation - ${fingerprintTime.toFixed(6)} seconds\n`, 'utf8');

  // Measure zkdb insertion time
  start = process.hrtime();
  await zkdb.insert('counterstrike', json.gamer, json, false);
  end = process.hrtime(start);
  let zkdbInsertionTime = end[0] + end[1] / 1e9;
  fs.appendFileSync(reportPath, `zkdb insertion - ${zkdbInsertionTime.toFixed(6)} seconds\n`, 'utf8');

  // Measure on-chain verification time
  const res = await onChainVerification(zkdb, json, reportPath);

  // Measure final insertion in MongoDB time
  let finalInsertionTime = 0;
  if (res.result) {
    start = process.hrtime();
    await zkdb.insert('counterstrike', json.gamer, { ...json, zkProof: res.zkp }, true);
    end = process.hrtime(start);
    finalInsertionTime = end[0] + end[1] / 1e9;
    fs.appendFileSync(reportPath, `Final insertion in MongoDB - ${finalInsertionTime.toFixed(6)} seconds\n`, 'utf8');
  } else {
    console.error("On-chain proof verification failed.");
  }

  // Measure total time
  const totalEnd = process.hrtime(totalStart);
  const totalTime = totalEnd[0] + totalEnd[1] / 1e9;
  fs.appendFileSync(reportPath, `Total - ${totalTime.toFixed(6)} seconds\n`, 'utf8');

  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});