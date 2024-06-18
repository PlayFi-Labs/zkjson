const { resolve } = require("path");
const MongoClient = require('mongodb').MongoClient;
const {
  path,
  val,
  toSignal,
  fromSignal,
  pad,
  encode,
  decode,
  encodePath,
  decodePath,
  encodeVal,
  decodeVal,
  encodeQuery,
  decodeQuery,
  DB,
} = require("../sdk");
const {
  insert,
  slice,
  unshift,
  shift,
  toArray,
  pop,
  length,
  push,
  next,
  arr,
  last,
  replace,
  get,
  pushArray,
  arrPush,
  arrGet,
  popArray,
  remove,
  bn,
  digits,
} = require("../../sdk/uint");
const fs = require('fs');
const snarkjs = require("snarkjs");
const crypto = require('crypto');
require("@nomiclabs/hardhat-ethers");


require('dotenv').config({ path: resolve(__dirname, '../../.env') });
require('events').EventEmitter.defaultMaxListeners = 15;


async function main() {
  // Dynamically import inquirer and chalk
  const { default: inquirer } = await import('inquirer');
  const { default: chalk } = await import('chalk');

  // Connect to the MongoDB server
  const url = process.env.MONGO_URL;
  const dbName = process.env.MONGO_DB;

  // Create a new MongoClient
  const client = new MongoClient(url);
  client.setMaxListeners(30); // Set max listeners on the client instance
  await client.connect();

  // Connect to the database
  const db = client.db(dbName);

  async function pauseForUserInput(message) {
    const { default: inquirer } = await import('inquirer');
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: message
      }
    ]);
  }
  
  async function initializeZKDB() {
    const wasm = resolve(
      __dirname,
      "../../circom/build/circuits/db/index_js/index.wasm"
    );
    const zkey = resolve(
      __dirname,
      "../../circom/build/circuits/db/index_0001.zkey"
    );
  
    const zkdb = new DB({ wasm, zkey });
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
      col_id: 0,
      path: "gamer",
      id: "Jack",
    });
  
    try {
      const result = await myru.validateProof(zkp);
      if (!result) {
        console.error("On-chain verification failed.");
      }else{
        return result;
      }
    } catch (error) {
        console.error("On-chain verification failed:", error);
        return false;
    }
  }

  const zkdb = await initializeZKDB();

  function createFingerprint(json) {
    const jsonString = JSON.stringify(json);
    const hash = crypto.createHash('sha256');
    hash.update(jsonString);
    const fingerprint = hash.digest('hex');
    return fingerprint;
  }

  const operationAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'operation',
      message: 'Which operation would you like to perform?',
      choices: ['write', 'query']
    }
  ]);

  if (operationAnswer.operation === 'write') {
    const jsonAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'jsonInput',
        message: 'Which record would you like to save (in json format)?'
      }
    ]);

    let jsonInfo;
    try {
      jsonInfo = JSON.parse(jsonAnswer.jsonInput);
    } catch (e) {
      console.log("Invalid JSON format. Please try again.");
      process.exit(1);
    }

    // Create a fingerprint for the JSON information
    const fingerprint = createFingerprint(jsonInfo);

    // Combine the JSON information with the fingerprint
    const json = { ...jsonInfo, fingerprint: fingerprint };

    console.log(chalk.green.bold(`✔ Json info and generated fingerprint`));
    console.log(json);

    await pauseForUserInput("Press ENTER to generate and verify the proof...");

    await zkdb.insert(0, "Jack", json);

    // Generate the proof
    const { proof, publicSignals } = await zkdb.genSignalProof({
      json: json,
      col_id: 0,
      path: "gamer",
      id: "Jack",
    });

    console.log(chalk.green.bold(`✔ Proof generated successfully`));

    const verificationAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'verificationType',
        message: 'Would you like to verify it On Chain, Off Chain or Both?',
        choices: ['On Chain', 'Off Chain', 'Both']
      }
    ]);

    if (verificationAnswer.verificationType === 'Off Chain') {
      await pauseForUserInput("Press ENTER to verify the proof off-chain...");

      // Load the verification key from a file
      const vkey = JSON.parse(fs.readFileSync(resolve(__dirname, "../../circom/build/circuits/db/verification_key.json")));

      // Verify the proof off-chain
      const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

      if (isValid) {
        console.log(chalk.green.bold(`✔ Off-chain proof verified successfully`));
      } else {
        console.log("Off-chain proof verification failed.");
        process.exit(1);
      }
    }

    if (verificationAnswer.verificationType === 'On Chain') {
      await pauseForUserInput("Press ENTER to verify the proof on-chain...");

      const isValidOnChain = await onChainVerification(zkdb, json);

      if (isValidOnChain) {
        console.log(chalk.green.bold(`✔ On-chain proof verified successfully`));
      } else {
        console.log("On-chain proof verification failed.");
        process.exit(1);
      }
    }

    await pauseForUserInput("Press ENTER to save the final JSON in the database...");

    // Combine json with zkp to create finalJson
    const finalJson = { ...json, zkProof: proof };

    // Insert finalJson into the database
    const collection1 = db.collection('counterstrike');
    const insertResult = await collection1.insertOne(finalJson);

    if (insertResult.acknowledged) {
      console.log("Storing in storage layer...");

      await pauseForUserInput("Press ENTER to complete the process...");

      console.log(chalk.green.bold(`✔ Process completed and JSON saved in Storage layer`));
      console.log("Final JSON with proof included:", finalJson);
    } else {
      console.log("Error inserting into database.");
      process.exit(1);
    }

    process.exit(0);
  } else if (operationAnswer.operation === 'query') {
    const gamerAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'gamer',
        message: 'Enter the gamer name:'
      }
    ]);

    const collection1 = db.collection('counterstrike');
    const fullRecord = await collection1.findOne({ "gamer": gamerAnswer.gamer });

    if (!fullRecord) {
      console.log("Gamer not found.");
      process.exit(1);
    }

    // Extract the necessary fields for fingerprint calculation
    const { gamer, strikes, place, weapon, place2 } = fullRecord;
    const recordForFingerprint = { gamer, strikes, place, weapon, place2 };

    console.log(chalk.green.bold(`✔ Gamer found in database`));
    console.log(recordForFingerprint);

    // Regenerate the fingerprint
    const regeneratedFingerprint = createFingerprint(recordForFingerprint);

    if (regeneratedFingerprint !== fullRecord.fingerprint) {
      console.log("Fingerprint does not match.");
      process.exit(1);
    }

    console.log(chalk.green.bold(`✔ Fingerprint matches`));

    const verificationAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'verificationType',
        message: 'Would you like to verify it On Chain, Off Chain or Both?',
        choices: ['On Chain', 'Off Chain', 'Both']
      }
    ]);

    if (verificationAnswer.verificationType === 'Off Chain' || verificationAnswer.verificationType === 'Both') {
      await pauseForUserInput("Press ENTER to regenerate and verify the proof off-chain...");

      await zkdb.insert(0, "Jack", fullRecord);

      // Regenerate the proof
      const { proof, publicSignals } = await zkdb.genSignalProof({
        json: fullRecord,
        col_id: 0,
        path: "gamer",
        id: "Jack",
      });

      console.log(chalk.green.bold(`✔ Proof regenerated successfully`));

      // Load the verification key from a file
      const vkey = JSON.parse(fs.readFileSync(resolve(__dirname, "../../circom/build/circuits/db/verification_key.json")));

      // Verify the proof off-chain
      const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

      if (isValid) {
        console.log(chalk.green.bold(`✔ Off-chain proof verified successfully`));
      } else {
        console.log("Off-chain proof verification failed.");
        process.exit(1);
      }
    }

    if (verificationAnswer.verificationType === 'On Chain' || verificationAnswer.verificationType === 'Both') {
      await pauseForUserInput("Press ENTER to verify the proof on-chain...");

      const isValidOnChain = await onChainVerification(zkdb, json);

      if (isValidOnChain) {
        console.log(chalk.green.bold(`✔ On-chain proof verified successfully`));
      } else {
        console.log("On-chain proof verification failed.");
        process.exit(1);
      }
    }

    // Print the JSON without the zkProof
    const { _id, zkProof, fingerprint, ...regeneratedJson } = fullRecord;

    console.log(chalk.bold(`✔ Regenerated JSON:`));
    console.log(chalk.green.bold(JSON.stringify(regeneratedJson, null, 2)));

    process.exit(0);
  } else {
    console.log("Invalid operation. Please try again.");
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
