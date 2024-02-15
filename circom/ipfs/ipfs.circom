pragma circom 2.1.5;
include "../utils/uint.circom";
include "./parse.circom";
include "../../node_modules/circomlib/circuits/sha256/sha256.circom";
include "../json/json.circom";

function packBits(bits) {
  var packed[32];
  for (var i = 0; i < 32; i++) {
    for (var i2 = 0; i2 < 8; i2++) {
      packed[i] += bits[i * 8 + i2] * (1 << (8 - 1 - i2));
    }
  }
  return packed;
}
template IPFS (size_json, size_path, size_val) {
    signal input encoded[size_json];
    signal json[size_json];
    signal input path[size_path];
    signal input val[size_val];
    signal output exist;
    signal output out[32];
    var binary[136];
    var _json[size_json];
    var _path[size_json];
    var _val[size_json];
    var _temp[size_json];
    _json = parse(encoded, size_json, _path, _val, _json, _temp);
    json <-- _json;
    var c[9] = [0, size_json, 0, 0, 0, 0, 0, 0, 0];
    var i = 0;
    while(c[5] == 0){
        c = next(encoded, c);
        for(var j = 0; j < 8; j++){
           binary[i] = ((c[0] >> (7 - j)) & 1);
           i++;
        }
    }
    component sha = Sha256(136);
    sha.in <-- binary;
    //out <== sha.out;
    var packed[32] = packBits(sha.out);
    out <== packed;
    component _json2 = JSON(256, 5, 5);
    _json2.json <-- _json;
    _json2.path <== path;
    _json2.val <== val;
    exist <== _json2.exist;
}