pragma circom 2.1.5;
include "../../node_modules/circomlib/circuits/smt/smtverifier.circom";
include "../collection/collection.circom";
include "../../node_modules/circomlib/circuits/poseidon.circom";

template DB (level_col, level, size_json, size_path, size_val) {  
    signal input path[size_path];
    signal input val[size_val];
    signal input json[size_json];
    signal input siblings[level];
    signal input col_siblings[level_col];
    signal input col_root;
    signal input col_key;
    signal input root;
    signal input key;
    signal output exist;

    component smtVerifier = SMTVerifier(level_col);
    component hash = Poseidon(1);
    hash.inputs[0] <== root;
    smtVerifier.enabled <== 1;
    smtVerifier.fnc <== 0;
    smtVerifier.oldKey <== 0;
    smtVerifier.oldValue <== 0;
    smtVerifier.isOld0 <== 0;
    smtVerifier.root <== col_root;
    smtVerifier.siblings <== col_siblings;
    smtVerifier.key <== col_key;
    smtVerifier.value <== hash.out;   

    component _coll = Collection(level, size_json, size_path, size_val);
    _coll.path <== path;
    _coll.val <== val;
    _coll.siblings <== siblings;
    _coll.json <== json;
    _coll.root <== root;
    _coll.key <== key;
    exist <== _coll.exist;
}
