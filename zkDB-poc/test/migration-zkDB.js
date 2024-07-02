const { resolve } = require("path");
const { DB } = require("../sdk");
const fs = require('fs');
const snarkjs = require("snarkjs");
const crypto = require('crypto');
require("@nomiclabs/hardhat-ethers");
const { expect } = require("chai");
const MongoClient = require('mongodb').MongoClient;

require('dotenv').config({ path: resolve(__dirname, '../../.env') });
require('events').EventEmitter.defaultMaxListeners = 15;

describe("DB Operations", function () {
  let db, url, dbName, client;

  this.timeout(0);

  before(async () => {
    // Set up database connection details
    url = process.env.MONGO_URL;
    dbName = process.env.MONGO_DB;

    if (!url || !dbName) {
      throw new Error("Database URL or Name is not defined in environment variables.");
    }

    const wasm = resolve(__dirname, "../../circom/build/circuits/db/index_js/index.wasm");
    const zkey = resolve(__dirname, "../../circom/build/circuits/db/index_0001.zkey");

    // Initialize the zkDB instance
    db = new DB({
      wasm,
      zkey,
      mongoUrl: url,
      dbName: dbName
    });

    await db.init();
    await db.createNewCollection('counterstrike', true);  // Ensure the collection is created

    // Initialize MongoDB client
    client = await MongoClient.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });
  });

  after(async () => {
    await db.close();
    await client.close();
  });

  function createFingerprint(json) {
    const jsonString = JSON.stringify(json);
    const hash = crypto.createHash('sha256');
    hash.update(jsonString);
    const fingerprint = hash.digest('hex');
    return fingerprint;
  }

  it("should insert and not store in MongoDB when storeInDB is false", async function () {
    const doc = { "gamer":"Merkle", "strikes": 793287, "place": "SP", "weapon": "AK-47", "place2": "Y"};
    const fingerprint = createFingerprint(doc);
    const json = { ...doc, fingerprint: fingerprint };

    try {
      await db.insert('counterstrike', json.gamer, json, false);
      const dbInstance = client.db(dbName);
      const collection = dbInstance.collection('counterstrike');
      const record = await collection.findOne({ "gamer":json.gamer });
      expect(record).to.be.null;
    } catch (error) {
      console.error("Error inserting document without storing in MongoDB:", error);
    }
  });

  it("should insert and store in MongoDB when storeInDB is true", async function () {
    const doc = { "gamer":"Merkle", "strikes": 793287, "place": "SP", "weapon": "AK-47", "place2": "Y"};
    const fingerprint = createFingerprint(doc);
    const json = { ...doc, fingerprint: fingerprint };

    try {
      await db.insert('counterstrike', json.gamer, json, true);
      const dbInstance = client.db(dbName);
      const collection = dbInstance.collection('counterstrike');
      const record = await collection.findOne({ "gamer":json.gamer });
      expect(record).to.not.be.null;
      expect(record.gamer).to.equal(json.gamer);
    } catch (error) {
      console.error("Error inserting document with storing in MongoDB:", error);
    }
  });

  it("should query JSON without storing in MongoDB when queryJson is used and storeInDB is false", async function () {
    const doc = { "gamer":"Merkle", "strikes": 793287, "place": "SP", "weapon": "AK-47", "place2": "Y"};
    const fingerprint = createFingerprint(doc);
    const json = { ...doc, fingerprint: fingerprint };

    try {
      await db.queryJson('counterstrike', json.gamer, json, false);
      const dbInstance = client.db(dbName);
      const collection = dbInstance.collection('counterstrike');
      const record = await collection.findOne({ "gamer":json.gamer });
      expect(record).to.be.null;
    } catch (error) {
      console.error("Error querying JSON without storing in MongoDB:", error);
    }
  });
});