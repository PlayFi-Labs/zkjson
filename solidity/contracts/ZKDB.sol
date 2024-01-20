pragma solidity >=0.7.0 <0.9.0;

import "hardhat/console.sol";

interface VerifierDB {
  function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[14] calldata _pubSignals) view external returns (bool);

}

interface VerifierRU {
  function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[11] calldata _pubSignals) view external returns (bool);

}

contract ZKDB {
  address public verifierRU;
  address public verifierDB;
  address public comitter;
  uint public root;
  uint constant public SIZE = 5;
  
  constructor (address _verifierRU, address _verifierDB, address _comitter){
    verifierRU = _verifierRU;
    verifierDB = _verifierDB;
    comitter = _comitter;
  }

  function digits (uint x) public pure returns(uint) {
    uint p = 0;
    while(x > 0){
        x /= 10;
        p++;
    }
    return p;
  }

  function getValLen(uint[] memory path, uint[] memory _json) public pure returns(uint, uint){
    require (_json[0] == 4, "not raw value");
    uint i = 1;
    uint start;
    uint[] memory path2 = toArr(path);
    uint vallen;
    while(i < _json.length){
      start = i;
      uint pathlen = getPathLen(i, _json);
      uint[] memory _path = new uint[](pathlen);
      uint len = _json[i];
      i++;
      _path[0] = len;
      uint pi = 1;
      for(uint i2=0;i2 < len; i2++){
	uint plen = _json[i];
	_path[pi] = plen;
	pi++;
	i++;
	uint plen2 = plen;
	if(plen == 0){
	  plen2 = _json[i] == 0 ? 2 : 1;
	}
	for(uint i3 = 0; i3 < plen2; i3++){
	  _path[pi] = _json[i];
	  pi++;
	  i++;
	}
      }

      uint _type = _json[i];
      i++;
      uint vlen = 1;
      if(_type == 1){
	vlen++;
	i++;
      }else if (_type == 2){
	vlen += 3;
	i += 3;
      }else if(_type == 3){
	uint slen = _json[i];
	vlen += slen + 1;
	i += slen + 1;
      }
      uint path_match = 1;
      if(pathlen != path2.length){
	path_match = 0;
      }else{
	for(uint i4 = 0; i4 < path2.length; i4++){
	  if(_path[i4] != path2[i4]) path_match = 0;
	}
      }
      if(path_match == 1){
	vallen = vlen;
	break;
      }
    }
    return (vallen, start);
  }
  
  function getPathLen(uint i, uint[] memory _json) public pure returns(uint){
    uint len = _json[i];
    i++;
    uint pi = 1;
    for(uint i2=0;i2 < len; i2++){
      uint plen = _json[i];
      pi++;
      i++;
      uint plen2 = plen;
      if(plen == 0) plen2 = _json[i] == 0 ? 2 : 1;
      pi += plen2;
      i += plen2;
    }
    return pi;
  }
  
  function getVal(uint[] memory path, uint[] memory _json) public pure returns(uint[] memory){
    require (_json[0] == 4, "not raw value");
    (uint vallen, uint i) = getValLen(path, _json);
    uint[] memory val = new uint[](vallen);
    uint[] memory path2 = toArr(path);
    while(i < _json.length){
      uint pathlen = getPathLen(i, _json);
      uint[] memory _path = new uint[](pathlen);
      uint len = _json[i];
      i++;
      _path[0] = len;
      uint pi = 1;
      for(uint i2=0;i2 < len; i2++){
	uint plen = _json[i];
	_path[pi] = plen;
	pi++;
	i++;
	uint plen2 = plen;
	if(plen == 0){
	  plen2 = _json[i] == 0 ? 2 : 1;
	}
	for(uint i3 = 0; i3 < plen2; i3++){
	  _path[pi] = _json[i];
	  pi++;
	  i++;
	}
      }

      uint _type = _json[i];
      i++;
      uint[] memory _val = new uint[](vallen);
      _val[0] = _type;
      if(_type == 1){
	_val[1] = _json[i];
	i++;
      }else if (_type == 2){
	_val[1] = _json[i];
	i++;
	_val[2] = _json[i];
	i++;
	_val[3] = _json[i];
	i++;
      }else if(_type == 3){
	uint slen = _json[i];
	_val[1] = slen;
	i++;
	for(uint i3 = 0;i3 < slen; i3++){
	  _val[i3 + 2] = _json[i];
	  i++;
	}
      }
      uint path_match = 1;
      if(pathlen != path2.length){
	path_match = 0;
      }else{
	for(uint i4 = 0; i4 < path2.length; i4++){
	  if(_path[i4] != path2[i4]) path_match = 0;
	}
      }
      if(path_match == 1){
	val = _val;
	break;
      }
    }
    return val;
  }
  
  function getLen(uint[] memory json) public pure returns(uint, uint){
    uint ji = 0;
    uint prev = 0;
    uint jlen = 0;
    for(uint j = 0; j < json.length; j++){
      if(json[j] > 0){
	jlen = j + 1;
	uint p = digits(json[j]);
	uint x = json[j];
	uint on = 0;
	uint cur = 0;
	uint len = 0;
	uint num = 0;
	uint is9 = 0;
	while(p > 0){
	  uint n = x / 10 ** (p - 1);
	  if(on == 0 && n > 0){
	    on = 1;
	    if(n == 9){
	      len = 8;
	      is9 = 0;
	    }else{
	      len = n;
	    }
	    cur = 0;
	  }else if(on == 1){
	    num += n * 10 ** (len - cur - 1);
	    cur++;
	    if(cur == len){
	      prev *= 10 ** len;
	      if(is9 == 1){
		prev += num;
	      }else{
		num += prev;
		prev = 0;
		ji++;
	      }
	      cur = 0;
	      on = 0;
	      len = 0;
	      num = 0;
	      is9 = 0;
	    }
	  }
	  x -= 10 ** (p - 1) * n;
	  p--;
	}
      }
    }
    return (ji, jlen);
  }
  
  function toArr(uint[] memory json) public pure returns(uint[] memory){
    (uint _len, uint _jlen) = getLen(json);
    uint[]  memory _json = new uint[](_len);
    uint ji = 0;
    uint prev = 0;
    for(uint j = 0; j < _jlen; j++){
      uint p = digits(json[j]);
      uint x = json[j];
      uint on = 0;
      uint cur = 0;
      uint len = 0;
      uint num = 0;
      uint is9 = 0;
      while(p > 0){
	uint n = x / 10 ** (p - 1);
	if(on == 0 && n > 0){
	  on = 1;
	  if(n == 9){
	    len = 8;
	    is9 = 0;
	  }else{
	    len = n;
	  }
	  cur = 0;
	}else if(on == 1){
	  num += n * 10 ** (len - cur - 1);
	  cur++;
	  if(cur == len){
	    prev *= 10 ** len;
	    if(is9 == 1){
	      prev += num;
	    }else{
	      num += prev;
	      prev = 0;
	      _json[ji] = num;
	      ji++;
	    }
	    cur = 0;
	    on = 0;
	    len = 0;
	    num = 0;
	    is9 = 0;
	  }
	}
	x -= 10 ** (p - 1) * n;
	p--;
      }
    }
    return _json;
  }
  
  function commit (uint[] calldata zkp) public returns (uint) {
    require (zkp[9] == root, "wrong merkle root");
    require(msg.sender == comitter, "sender is not comitter");
    root = zkp[8];
    verifyRU(zkp);
    return root;
    
  }

  function verifyRU(uint[] calldata zkp) public view returns (bool) {
    uint[2] memory _pA;
    uint[2][2] memory _pB;
    uint[2] memory _pC;
    uint[11] memory sigs;
    for(uint i = 0; i < 2; i++) _pA[i] = zkp[i];
    for(uint i = 2; i < 4; i++) _pB[0][i - 2] = zkp[i];
    for(uint i = 4; i < 6; i++) _pB[1][i - 4] = zkp[i];
    for(uint i = 6; i < 8; i++) _pC[i - 6] = zkp[i];
    for(uint i = 8; i < 19; i++) sigs[i - 8] = zkp[i];
    require(VerifierRU(verifierRU).verifyProof(_pA, _pB, _pC, sigs), "invalid proof");
    return true;
  }

  function verifyDB(uint[] calldata zkp) public view returns (bool) {
    uint[2] memory _pA;
    uint[2][2] memory _pB;
    uint[2] memory _pC;
    uint[SIZE * 2 + 4] memory sigs;
    for(uint i = 0; i < 2; i++) _pA[i] = zkp[i];
    for(uint i = 2; i < 4; i++) _pB[0][i - 2] = zkp[i];
    for(uint i = 4; i < 6; i++) _pB[1][i - 4] = zkp[i];
    for(uint i = 6; i < 8; i++) _pC[i - 6] = zkp[i];
    for(uint i = 8; i < SIZE * 2 + 12; i++) sigs[i - 8] = zkp[i];
    require(VerifierDB(verifierDB).verifyProof(_pA, _pB, _pC, sigs), "invalid proof");
    return true;
  }

  function validateQuery(uint[] memory path, uint[] calldata zkp) public view returns(uint[] memory){
    require(zkp[19] == root, "root mismatch");
    require(zkp[8] == 1, "value doesn't exist");
    require(zkp[SIZE * 2 + 10] == path[0], "wrong collection");
    require(zkp[SIZE * 2 + 11] == path[1], "wrong doc");
    require(path.length <= SIZE + 2, "path too long");
    for(uint i = 9; i < 9 + path.length - 2; i++) require(path[i - 7] == zkp[i], "wrong path");
    
    uint[] memory value = new uint[](SIZE);
    for(uint i = 9 + SIZE; i < 9 + SIZE * 2; i++) value[i - (9 + SIZE)] = zkp[i];
    
    return toArr(value);
  }

  function getInt (uint[] memory path, uint[] memory raw) public pure returns (int) {
    uint[] memory value = getVal(path, raw);
    require(value[0] == 2 && value[2] == 0, "not int");
    return int(value[3]) * (value[1] == 1 ? int(1) : int(-1));
  }

  function getString (uint[] memory path, uint[] memory raw) public pure returns (string memory) {
    uint[] memory value = getVal(path, raw);
    require(value[0] == 3, "not string");
    uint8[] memory charCodes = new uint8[](value[1]);
    for(uint i = 0; i < value[1];i++) charCodes[i] = uint8(value[i+2]);
    string memory str = toString(charCodes);
    return str;
  }

  function getBool (uint[] memory path, uint[] memory raw) public pure returns (bool) {
    uint[] memory value = getVal(path, raw);
    require(value[0] == 1, "not bool");
    return value[1] == 1 ? true : false;
  }

  function getNull (uint[] memory path, uint[] memory raw) public pure returns (bool) {
    uint[] memory value = getVal(path, raw);
    require(value[0] == 0, "not null");
    return true;
  }

  function qInt (uint[] memory path, uint[] calldata zkp) public view returns (int) {
    uint[] memory value = validateQuery(path, zkp);
    require(value[0] == 2 && value[2] == 0, "not int");
    verifyDB(zkp);
    return int(value[3]) * (value[1] == 1 ? int(1) : int(-1));
  }

  function toString(uint8[] memory charCodes) public pure returns (string memory) {
    bytes memory stringBytes = new bytes(charCodes.length);
    for (uint i = 0; i < charCodes.length; i++) stringBytes[i] = bytes1(charCodes[i]);
    return string(stringBytes);
  }

  function qFloat (uint[] memory path, uint[] calldata zkp) public view returns (uint[3] memory) {
    uint[] memory value = validateQuery(path, zkp);
    require(value[0] == 2 && value[2] == 1, "not float");
    verifyDB(zkp);
    uint[3] memory float;
    float[0] = value[1];
    float[1] = value[2];
    float[2] = value[3];
    return float;
  }

  function qRaw (uint[] memory path, uint[] calldata zkp) public view returns (uint[] memory) {
    uint[] memory value = validateQuery(path, zkp);
    require(value[0] == 4, "not object or array");
    verifyDB(zkp);
    return value;
  }
  
  function qString (uint[] memory path, uint[] calldata zkp) public view returns (string memory) {
    uint[] memory value = validateQuery(path, zkp);
    require(value[0] == 3, "not string");
    verifyDB(zkp);
    uint8[] memory charCodes = new uint8[](value[1]);
    for(uint i = 0; i < value[1];i++) charCodes[i] = uint8(value[i+2]);
    string memory str = toString(charCodes);
    return str;
  }

  function qBool (uint[] memory path, uint[] calldata zkp) public view returns (bool) {
    uint[] memory value = validateQuery(path, zkp);
    require(value[0] == 1, "not bool");
    verifyDB(zkp);
    return value[1] == 1 ? true : false;
  }
  
  function qNull (uint[] memory path, uint[] calldata zkp) public view returns (bool) {
    uint[] memory value = validateQuery(path, zkp);
    require(value[0] == 0, "not null");
    verifyDB(zkp);
    return true;
  }

}
