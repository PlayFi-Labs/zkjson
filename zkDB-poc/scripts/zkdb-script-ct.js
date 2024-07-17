const { resolve } = require("path");
const { DB } = require("../sdk");
const fs = require('fs');
const snarkjs = require("snarkjs");
const crypto = require('crypto');
const { ethers, JsonRpcProvider } = require('ethers');

const { insertFingerprint, checkFingerprint } = require('./utils/fingerPrint_func');

require("@nomiclabs/hardhat-ethers");


require('dotenv').config({ path: resolve(__dirname, '../../.env') });
require('events').EventEmitter.defaultMaxListeners = 15;

async function main() {

  const { default: inquirer } = await import('inquirer');
  const { default: chalk } = await import('chalk');

  const wasm = resolve(__dirname, "../../circom/build/circuits/db/index_js/index.wasm");
  const zkey = resolve(__dirname, "../../circom/build/circuits/db/index_0001.zkey");

  const url = process.env.MONGO_URL;
  const dbName = process.env.MONGO_DB;

  async function pauseForUserInput(message) {
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: message
      }
    ]);
  }

  async function initializeZKDB() {
    const zkdb = new DB({
      wasm,
      zkey,
      mongoUrl: url,
      dbName: dbName
    });
    await zkdb.init();
    await zkdb.addCollection();
    return zkdb;
  }

  // On-chain verification
  async function onChainVerification(zkdb, fullRecord) {

    const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const provider = new JsonRpcProvider('http://127.0.0.1:8545');
    const committer = new ethers.Wallet(
      privateKey,
      provider
    );
    const nonce = await provider.getTransactionCount(committer.address, 'latest');
    const VerifierRU = new ethers.ContractFactory(
      require('../artifacts/contracts/verifier_rollup.sol/Groth16VerifierRU.json').abi,
      require('../artifacts/contracts/verifier_rollup.sol/Groth16VerifierRU.json').bytecode,
      committer
    );
    const verifierRU = await VerifierRU.deploy({ nonce: nonce, gasLimit: 30000000 });
    console.log(`VerifierRU deployed to: ${verifierRU.address}`);
    
    const VerifierDB = new ethers.ContractFactory(
        require('../artifacts/contracts/verifier_db.sol/Groth16VerifierDB.json').abi,
        require('../artifacts/contracts/verifier_db.sol/Groth16VerifierDB.json').bytecode,
        committer
    );
    const verifierDB = await VerifierDB.deploy({ nonce: nonce, gasLimit: 30000000 });
    console.log(`VerifierDB deployed to: ${verifierDB.address}`);
  
    const MyRU = new ethers.ContractFactory(
        require('../artifacts/contracts/MyRollup.sol/MyRollup.json').abi,
        require('../artifacts/contracts/MyRollup.sol/MyRollup.json').bytecode,
        committer
    );
    const myru = await MyRU.deploy(verifierRU.address, verifierDB.address, committer.address, { nonce: nonce, gasLimit: 30000000 });
  
    // Generar la prueba
    const zkp = await zkdb.genProof({
      json: fullRecord,
      col_id: 'counterstrike',
      path: "gamer",
      id: extractGamer(fullRecord),
    });
  
    try {
      // Validate the proof on-chain
      const result = await myru.validateProof(zkp);
      if (!result) {
        console.error("La verificación en cadena falló.");
      } else {
        return result;
      }
    } catch (error) {
        console.error("On-chain verification failed:", error);
      return false;
    }
  }

  function createFingerprint(json) {
    const jsonString = JSON.stringify(json);
    const hash = crypto.createHash('sha256');
    hash.update(jsonString);
    const fingerprint = hash.digest('hex');
    return '0x' + fingerprint; 
  }

  function extractGamer(json) {
    return `"${json.gamer}"`;
  }

  function filterFields(originalJson) {
    const fieldsToKeep = ['gamer', 'strikes', 'place', 'weapon', 'place2'];
    const filteredJson = {};
  
    fieldsToKeep.forEach(field => {
      if (originalJson.hasOwnProperty(field)) {
        filteredJson[field] = originalJson[field];
      }
    });
  
    return filteredJson;
  }

  const zkdb = await initializeZKDB();

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

    const fingerprint = createFingerprint(jsonInfo);
    const json = { ...jsonInfo, fingerprint: fingerprint };

    console.log(chalk.green.bold(`✔ Json info and generated fingerprint`));
    console.log(json);

    await pauseForUserInput("Press ENTER to generate and verify the proof...");

    await zkdb.insert('counterstrike', json.gamer, json, false);
    await insertFingerprint(fingerprint);
    const fingerPrintInserted = await checkFingerprint(fingerprint);

    if (fingerPrintInserted) {
      console.log(chalk.green.bold(`✔ FingerPrint inserted successfully`));
    } else {
      console.log("FingerPrint insert failed");
      process.exit(1);
    }

    const { proof, publicSignals } = await zkdb.genSignalProof({
      json: json,
      col_id: 'counterstrike',
      path: "gamer",
      id: extractGamer(json),
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

      const vkey = JSON.parse(fs.readFileSync(resolve(__dirname, "../../circom/build/circuits/db/verification_key.json")));

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

    if (verificationAnswer.verificationType === 'Both') {
      await pauseForUserInput("Press ENTER to verify the proof with both methods...");

      const vkey = JSON.parse(fs.readFileSync(resolve(__dirname, "../../circom/build/circuits/db/verification_key.json")));

      const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      const isValidOnChain = await onChainVerification(zkdb, json);

      if (isValidOnChain && isValid) {
        console.log(chalk.green.bold(`✔ Both proofs verified successfully`));
      } else {
        console.log("Both proof verification failed.");
        process.exit(1);
      }
    }

    await pauseForUserInput("Press ENTER to save the final JSON in the database...");

    const finalJson = { ...json, zkProof: proof };

    await zkdb.insert('counterstrike', finalJson.gamer, finalJson, true);

    process.exit(0);

  } else if (operationAnswer.operation === 'query') {
    const gamerAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'gamer',
        message: 'Enter the gamer name:'
      }
    ]);

    const collection1 = zkdb.db.collection('counterstrike');

    const fullRecord = await collection1.findOne({ "gamer": gamerAnswer.gamer });

    if (!fullRecord) {
      console.log("Gamer not found.");
      process.exit(1);
    }

    const { "gamer": gamer, "strikes": strikes, "place": place, "weapon": weapon, "place2": place2 } = fullRecord;
    const recordForFingerprint = { "gamer": gamer, "strikes": strikes, "place": place, "weapon": weapon, "place2": place2 };

    console.log(chalk.green.bold(`✔ Gamer found in database`));
    console.log(recordForFingerprint);

    const regeneratedFingerprint = createFingerprint(recordForFingerprint);

    const isAppended = await checkFingerprint(fullRecord.fingerprint);

    if (!isAppended) {
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

    if (verificationAnswer.verificationType === 'Off Chain') {
      await pauseForUserInput("Press ENTER to regenerate and verify the proof off-chain...");

      const zkp = await zkdb.queryJson('counterstrike', fullRecord.gamer, fullRecord, "gamer", false);

      if (zkp) {
        console.log(chalk.green.bold(`✔ Gamer found in database`));
      } else {
        console.log("Gamer not found.");
        process.exit(1);
      }

      const { proof, publicSignals } = await zkdb.genSignalProof({
        json: fullRecord,
        col_id: 'counterstrike',
        path: "gamer",
        id: extractGamer(fullRecord),
      });

      console.log(chalk.green.bold(`✔ Proof regenerated successfully`));

      const vkey = JSON.parse(fs.readFileSync(resolve(__dirname, "../../circom/build/circuits/db/verification_key.json")));

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

      const zkp = await zkdb.queryJson('counterstrike', fullRecord.gamer, fullRecord, "gamer", false);

      if (zkp) {
        console.log(chalk.green.bold(`✔ Gamer found in database`));
      } else {
        console.log("Gamer not found.");
        process.exit(1);
      }

      const isValidOnChain = await onChainVerification(zkdb, fullRecord);

      if (isValidOnChain) {
        console.log(chalk.green.bold(`✔ On-chain proof verified successfully`));
      } else {
        console.log("On-chain proof verification failed.");
        process.exit(1);
      }
    }

    if (verificationAnswer.verificationType === 'Both') {
      await pauseForUserInput("Press ENTER to verify the proof on-chain...");

      const zkp = await zkdb.queryJson('counterstrike', fullRecord.gamer, fullRecord, "gamer", false);

      if (zkp) {
        console.log(chalk.green.bold(`✔ Gamer found in database`));
      } else {
        console.log("Gamer not found.");
        process.exit(1);
      }

      const { proof, publicSignals } = await zkdb.genSignalProof({
        json: fullRecord,
        col_id: 'counterstrike',
        path: "gamer",
        id: extractGamer(fullRecord),
      });

      const vkey = JSON.parse(fs.readFileSync(resolve(__dirname, "../../circom/build/circuits/db/verification_key.json")));

      const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

      const isValidOnChain = await onChainVerification(zkdb, fullRecord);

      if (isValidOnChain && isValid) {
        console.log(chalk.green.bold(`✔ Both Proofs verified successfully`));
      } else {
        console.log("Both Proof System verification failed.");
        process.exit(1);
      }
    }

    const { _id, zkProof, fingerprint, ...regeneratedJson } = fullRecord;

    console.log(chalk.bold(`✔ Regenerated JSON:`));
    console.log(chalk.green.bold(JSON.stringify(filterFields(regeneratedJson), null, 2)));

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