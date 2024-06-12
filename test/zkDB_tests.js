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
} = require("../sdk/uint");
const { parse } = require("../sdk/parse");
const { expect } = require("chai");
const { groth16 } = require("snarkjs");
const fs = require('fs');
const snarkjs = require("snarkjs");

require('dotenv').config({ path: resolve(__dirname, '../.env') });

// Define a constant with the JSON information
const jsonInfo = { gamer: "Marcus", strikes: 7800, place: "SP", weapon: "AK-47", place2: "C"};

describe("zkDB-zkJSON", function () {
  this.timeout(0);
  it.only("should generate and verify proofs", async () => {
    
    // Connect to the MongoDB server
    const url = process.env.MONGO_URL;
    const dbName = process.env.MONGO_DB;
   
    // Create a new MongoClient
    const client = new MongoClient(url);
    await client.connect();

    console.log("Connected successfully to server");

    // Connect to the database
    const db = client.db(dbName);

    // Define the paths to the wasm, zkey, and verification key files
    const wasm = resolve(
      __dirname,
      "../circom/build/circuits/db/index_js/index.wasm"
    );
    const zkey = resolve(
      __dirname,
      "../circom/build/circuits/db/index_0001.zkey"
    );
    const vkey = resolve(
      __dirname,
      "../circom/build/circuits/db/verification_key.json"
    );

    // Create a new instance of the DB class
    const zkdb = new DB({ wasm, zkey });

    // Initialize the database
    await zkdb.init();
    await zkdb.addCollection();
    await zkdb.insert(0, "Jack", jsonInfo);

    // Generate the proof
    const { proof, publicSignals } = await zkdb.genSignalProof({
      json: jsonInfo,
      col_id: 0,
      path: "gamer",
      id: "Jack",
    });

    // Load the verification key from a file
    const vKey = JSON.parse(fs.readFileSync(vkey));

    // Verify the proof
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

    // Assert that the proof is valid
    expect(isValid).to.be.true;

    // Combine jsonInfo with zkp to create finalJson
    const finalJson = { ...jsonInfo, zkProof: proof };

    // Insert finalJson into the database
    const collection1 = db.collection('counterstrike');
    await collection1.insertOne(finalJson);

    console.log("Inserted finalJson into the database");
  });
});