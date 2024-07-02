const newMemEmptyTrie = require("./circomlibjs").newMemEmptyTrie;
const MongoClient = require('mongodb').MongoClient;
const snarkjs = require('snarkjs');
const { is, indexOf, range, isNil } = require('ramda');
const { pad, toSignal, encode, toIndex } = require('./encoder');
const Collection = require('./collection');

class DB {
  constructor({
    size_val = 8,
    size_path = 4,
    level = 168,
    size_json = 256,
    size_txs = 10,
    level_col = 8,
    wasm,
    zkey,
    wasmRU,
    zkeyRU,
    mongoUrl,  // Add MongoDB connection URL
    dbName,    // Add MongoDB database name
  }) {
    this.wasm = wasm;
    this.zkey = zkey;
    this.wasmRU = wasmRU;
    this.zkeyRU = zkeyRU;
    this.level_col = level_col;
    this.size_val = size_val;
    this.size_path = size_path;
    this.level = level;
    this.size_json = size_json;
    this.size_txs = size_txs;
    this.count = 0;
    this.ids = [];
    this.mongoUrl = mongoUrl;
    this.dbName = dbName;
  }

  async init() {
    // Connect to MongoDB
    this.client = await MongoClient.connect(this.mongoUrl);
    this.db = this.client.db(this.dbName);
    this.documents = this.db.collection('counterstrike');
    this.tree = await newMemEmptyTrie();
    this.cols = {};
  }

  async close() {
    await this.client.close();
  }

  async createNewCollection(collectionName, store) {
    if (!collectionName || typeof collectionName !== 'string') {
      throw new Error('Invalid collection name');
    }
    
    let _col = this.cols[collectionName];
    if (!_col) {
      _col = new Collection({
        size_val: this.size_val,
        size_path: this.size_path,
        level: this.level,
        size_json: this.size_json,
      });
      await _col.init();
      this.cols[collectionName] = _col;
    }

    if (store) {
      try {
        await this.db.createCollection(collectionName);
        console.log(`Collection '${collectionName}' created successfully`);
      } catch (error) {
        if (error.codeName === 'NamespaceExists') {
          console.log(`Collection '${collectionName}' already exists.`);
        } else {
          throw error;
        }
      }
    }

    return _col;
  }

  async getColTree(colName, store) {
    let _col = this.cols[colName];
    if (!_col) {
      _col = await this.createNewCollection(colName, store);
    }
    return _col;
  }

  // Insert document
  /// @param {String} colName - The collection name
  /// @param {String} _key - The document ID
  /// @param {Object} _val - The document value
  /// @param {Boolean} store - Whether to store the document in the database
  async insert(colName, _key, _val, store) {
    const _col = await this.getColTree(colName, store);
    let update = false;
    let res_doc;

    if ((await _col.get(_key)).found) {
      update = true;
      res_doc = await _col.update(_key, _val);
    } else {
      res_doc = await _col.insert(_key, _val, store);
    }

    const res_col = await this.updateDB(_col, colName);

    // Ensure _val includes col_id and key fields
    const documentToInsert = { ..._val, col_id: colName, key: _key };
    if (store) {
      await this.db.collection(colName).updateOne({ _id: _key }, { $set: documentToInsert }, { upsert: true });
    }
    return { update, doc: res_doc, col: res_col, tree: _col.tree };
  }

  // Insert JSON document
  /// @param {String} colName - The collection name
  /// @param {String} _key - The document ID
  /// @param {Object} _val - The document value
  /// @param {String} _path - The path to query
  /// @param {Boolean} store - Whether to store the document in the database
  async queryJson(colName, _key, _val, _path, store) {
    const _col = await this.getColTree(colName, store);
    await _col.insert(_key, _val, store);
    await this.updateDB(_col, colName);

    // Ensure _val includes col_id and key fields
    const documentToGen = { ..._val, col_id: colName, key: _key };

    // Generate proof
    const proofResult = await this.genProof({
      json: documentToGen,
      col_id: colName,
      path: _path,
      id: _key
    });

    // Return the proof result
    return proofResult;
  }

  async updateDB(_col, colName) {
    const root = _col.tree.F.toObject(_col.tree.root).toString();
    const colID = BigInt(this.getIDForColName(colName));  // Ensure col is a BigInt
    return await this.tree.update(colID, [root]);
  }

  async update(colName, _key, _val) {
    const _col = await this.getColTree(colName, true); // store is always true for update
    const res_doc = await _col.update(_key, _val);
    const res_col = await this.updateDB(_col, colName);
    await this.db.collection(colName).updateOne({ _id: _key }, { $set: { ..._val, col_id: colName, key: _key } }, { upsert: true });
    return { doc: res_doc, col: res_col, tree: _col.tree };
  }

  async delete(colName, _key) {
    const _col = await this.getColTree(colName, true); // store is always true for delete
    const res_doc = await _col.delete(_key);
    const res_col = await this.updateDB(_col, colName);
    await this.db.collection(colName).deleteOne({ _id: _key });
    return { doc: res_doc, col: res_col, tree: _col.tree };
  }

  async get(colName, _key) {
    const _col = await this.getColTree(colName, true); // store is always true for get
    return await _col.get(_key);
  }

  async getJson(colName, _key) {
    return await this.documents.findOne({ col_id: colName, key: _key });
  }

  async getCol(colName) {
    const colID = this.getIDForColName(colName);
    return await this.tree.find(colID);
  }

  getIDForColName(colName) {
    if (typeof colName === 'number') {
      return colName;
    }
    if (this.ids.indexOf(colName) === -1) {
      this.ids.push(colName);
    }
    return this.ids.indexOf(colName);
  }

  parse(res, tree, level) {
    const isOld0 = res.isOld0 ? "1" : "0";
    const oldRoot = tree.F.toObject(res.oldRoot).toString();
    const newRoot = tree.F.toObject(res.newRoot).toString();
    const oldKey = res.isOld0 ? "0" : tree.F.toObject(res.oldKey).toString();
    const oldValue = res.isOld0 ? "0" : tree.F.toObject(res.oldValue).toString();
    let siblings = res.siblings;
    for (let i = 0; i < siblings.length; i++) {
      siblings[i] = tree.F.toObject(siblings[i]);
    }
    while (siblings.length < level) siblings.push(0);
    siblings = siblings.map(s => s.toString());
    return { isOld0, oldRoot, oldKey, oldValue, siblings, newRoot };
  }

  _getVal(j, p) {
    if (p.length === 0) {
      return j;
    } else {
      const sp = p[0].split("[");
      for (let v of sp) {
        if (/]$/.test(v)) {
          j = j && j[v.replace(/]$/, "") * 1];
        } else {
          j = j && j[v];
        }
        // Add a check to see if j is undefined
        if (j === undefined) {
          return undefined;
        }
      }
      return this._getVal(j, p.slice(1));
    }
  }

  getVal(j, p) {
    if (p === "") return j;
    return this._getVal(j, p.split("."));
  }

  async genProof({ json, col_id, path, id }) {
    const inputs = await this.getInputs({
      id,
      col_id,
      json,
      path,
      val: this.getVal(json, path),
    });
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      this.wasm,
      this.zkey,
    );
    return [
      ...proof.pi_a.slice(0, 2),
      ...proof.pi_b[0].slice(0, 2).reverse(),
      ...proof.pi_b[1].slice(0, 2).reverse(),
      ...proof.pi_c.slice(0, 2),
      ...publicSignals,    
    ];
  }

  // Generate proof for signal
  /// @param {Object} json - The JSON object to query
  /// @param {String} col_id - The collection ID
  /// @param {String} path - The path to query
  /// @param {String} id - The document ID
  async genSignalProof({ json, col_id, path, id }) {
    const inputs = await this.getInputs({
      id,
      col_id,
      json,
      path,
      val: this.getVal(json, path),
    });
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      this.wasm,
      this.zkey,
    );
    return { proof, publicSignals };
  }

  async genRollupProof(txs) {
    const inputs = await this.getRollupInputs({ queries: txs });
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      this.wasmRU,
      this.zkeyRU,
    );
    return [
      ...proof.pi_a.slice(0, 2),
      ...proof.pi_b[0].slice(0, 2).reverse(),
      ...proof.pi_b[1].slice(0, 2).reverse(),
      ...proof.pi_c.slice(0, 2),
      ...publicSignals,
    ];
  }

  async query(col_id, id, path, json) {
    const document = await this.documents.findOne({ col_id, key: id });
    if (!document) {
      console.error(`Document not found for col_id: ${col_id}, key: ${id}`);
      throw new Error('Document not found');
    }
    console.log(`Document found:`, document);

    // Use the document directly if it doesn't contain a 'value' field
    const valueToQuery = document.value ? document.value : document;

    const val = this.getVal(valueToQuery, path);
    if (val === undefined) {
      console.error(`Value not found for path: ${path}`);
      throw new Error(`Value not found for path: ${path}`);
    }

    const inputs = await this.genProof({ col_id, id, json, path });
    const sigs = inputs.slice(8);
    const params = [[sigs[12], sigs[13], ...sigs.slice(1, 6)], inputs];
    let type =
      val === null
        ? 0
        : typeof val === 'string'
        ? 3
        : typeof val === 'boolean'
        ? 1
        : typeof val === 'number'
        ? Number.isInteger(val)
          ? 2
          : 2.5
        : 4;
    switch (type) {
      case 0:
        return await this.zkdb.qNull(...params);
      case 1:
        return await this.zkdb.qBool(...params);
      case 2:
        return (await this.zkdb.qInt(...params)).toString() * 1;
      case 2.5:
        return (await this.zkdb.qFloat(...params)).map((n) => n.toString() * 1);
      case 3:
        return await this.zkdb.qString(...params);
      case 4:
        return (await this.zkdb.qRaw(...params)).map((n) => n.toString() * 1);
    }
  }

  async getRollupInputs({ queries }) {
    let write, _json;
    let oldRoot = [];
    let newRoot = [];
    let oldKey = [];
    let oldValue = [];
    let siblings = [];
    let isOld0 = [];
    let oldRoot_db = [];
    let newRoot_db = [];
    let oldKey_db = [];
    let oldValue_db = [];
    let siblings_db = [];
    let isOld0_db = [];
    let newKey_db = [];
    let newKey = [];
    let _res;
    let json = [];
    let fnc = [];
    for (let i = 0; i < this.size_txs; i++) {
      const v = queries[i];
      if (!v) {
        json.push(range(0, this.size_json).map(() => "0"));
        fnc.push([0, 0]);
        newRoot.push(newRoot[i - 1]);
        oldRoot.push("0");
        oldKey.push("0");
        oldValue.push("0");
        siblings.push(range(0, this.level).map(() => "0"));
        isOld0.push("0");
        oldRoot_db.push(newRoot_db[i - 1]);
        newRoot_db.push(newRoot_db[i - 1]);
        oldKey_db.push("0");
        oldValue_db.push("0");
        siblings_db.push(range(0, this.level_col).map(() => "0"));
        isOld0_db.push("0");
        newKey_db.push("0");
        newKey.push("0");
        continue;
      }
      _json = v[2];
      const { update, tree, col: res2, doc: res } = await this.insert(...v);
      const icol = this.parse(res, tree, this.level);
      const idb = this.parse(res2, this.tree, this.level_col);
      _res = idb;
      const _newKey = toIndex(v[1]);
      json.push(pad(toSignal(encode(_json)), this.size_json));
      const _newKey_db = v[0].toString();
      fnc.push(update ? [0, 1] : [1, 0]);
      newRoot.push(idb.newRoot);
      oldRoot.push(icol.oldRoot);
      oldKey.push(icol.oldKey);
      oldValue.push(icol.oldValue);
      siblings.push(icol.siblings);
      isOld0.push(icol.isOld0);
      oldRoot_db.push(idb.oldRoot);
      newRoot_db.push(idb.newRoot);
      oldKey_db.push(idb.oldKey);
      oldValue_db.push(idb.oldValue);
      siblings_db.push(idb.siblings);
      isOld0_db.push(idb.isOld0);
      newKey_db.push(_newKey_db);
      newKey.push(_newKey);
    }

    return {
      fnc,
      oldRoot,
      newRoot,
      oldKey,
      oldValue,
      siblings,
      isOld0,
      oldRoot_db,
      oldKey_db,
      oldValue_db,
      siblings_db,
      isOld0_db,
      newKey_db,
      newKey,
      json,
    };
  }

  async getQueryInputs({ id, col_id, json }) {
    const {
      update,
      tree,
      col: res2,
      doc: res,
    } = await this.insert(col_id, id, json, true); // store is always true for query inputs
    const icol = this.parse(res, tree, this.level);
    const idb = this.parse(res2, this.tree, this.level_col);
    const newKey = toIndex(id);
    const newKey_db = col_id.toString();
    return {
      fnc: update ? [0, 1] : [1, 0],
      oldRoot: icol.oldRoot,
      oldKey: icol.oldKey,
      oldValue: icol.oldValue,
      siblings: icol.siblings,
      isOld0: icol.isOld0,
      oldRoot_db: idb.oldRoot,
      oldKey_db: idb.oldKey,
      oldValue_db: idb.oldValue,
      siblings_db: idb.siblings,
      isOld0_db: idb.isOld0,
      newRoot: idb.newRoot,
      newKey_db,
      newKey,
      json: pad(toSignal(encode(json)), this.size_json),
    };
  }

  async getInputs({ id, col_id, json, path, val }) {
    const col_root = this.tree.F.toObject(this.tree.root).toString();
    const col_res = await this.getCol(col_id);

    let col_siblings = col_res.siblings;
    for (let i = 0; i < col_siblings.length; i++) {
      col_siblings[i] = this.tree.F.toObject(col_siblings[i]);
    }
    while (col_siblings.length < this.level_col) col_siblings.push(0);
    col_siblings = col_siblings.map(s => s.toString());
    const col_key = this.getIDForColName(col_id);
    const col = await this.getColTree(col_id, true); // store is always true for inputs
    const col_inputs = await col.getInputs({ id, json, path, val });
    return {
      path: col_inputs.path,
      val: col_inputs.val,
      json: col_inputs.json,
      root: col_inputs.root,
      siblings: col_inputs.siblings,
      key: toIndex(id),
      col_key,
      col_siblings,
      col_root,
    };
  }

  getID(num) {
    if (!isNil(num)) {
      if (indexOf(num)(this.ids) !== -1) {
        throw Error('id exists');
      }
      return num;
    } else {
      while (indexOf(this.count)(this.ids) !== -1) {
        this.count++;
      }
      return this.count++;
    }
  }

  async addCollection(num) {
    if (!isNil(num) && (!is(Number, num) || Math.round(num) !== num)) {
      throw Error('id is not an integer');
    }
    const id = this.getID(num);
    const col = await this.tree.find(id);
    if (col.found) throw Error("collection exists");
    const _col = new Collection({
      size_val: this.size_val,
      size_path: this.size_path,
      level: this.level,
      size_json: this.size_json,
    });
    await _col.init();
    this.cols[id] = _col;
    const root = _col.tree.F.toObject(_col.tree.root).toString();
    await this.tree.insert(id, [root]);
    return id;
  }
}

module.exports = DB;