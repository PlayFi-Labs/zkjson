// SPDX-License-Identifier: MIT

pragma solidity >=0.7.0 <0.9.0;
import "hardhat/console.sol";
contract ZKQuery {

  function digits (uint x) private pure returns(uint) {
    uint p = 0;
    while(x > 0){
      x /= 10;
      p++;
    }
    return p;
  }

  function getValLen(uint[] memory path, uint[] memory _json) private pure returns(uint, uint){
    require (_json[0] == 4, "not raw value");
    uint i = 1;
    uint start;
    uint[] memory path2 = toArr(path);
    uint vallen;
    while(i < _json.length){
      start = i;
      (uint[] memory _path, uint i2) = getPath(i, _json);
      i = i2;
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
      if(_path.length != path2.length){
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
  
  function getPath(uint i, uint[] memory _json) private pure returns(uint[] memory, uint){
    uint[] memory _path;
    assembly {
      let json := add(_json, 0x20)
      let len := mload(add(json, mul(i, 0x20)))
      i := add(i, 1)
      _path := msize()
      mstore(_path, sub(mload(_json), i))
      let _path0 := add(_path, 0x20)
      mstore(_path0, len)
      let pi := 0x20
      for { let i2 := 0 } lt(i2, len) { i2 := add(i2, 1) } {
	let plen := mload(add(json, mul(i, 0x20)))
        mstore(add(_path0, pi), plen)
	pi := add(pi, 0x20)
	i := add(i, 1)
	let plen2 := 1
	if iszero(plen) {
          if iszero(mload(add(json, mul(i, 0x20)))){
	    plen2 := 2
          }
        }
	for { let i3 := 0 } lt(i3, plen2) { i3 := add(i3, 1) } {
	  mstore(add(_path0, pi), mload(add(json, mul(i, 0x20))))
	  pi := add(pi, 0x20)
	  i := add(i, 1)
	}
      }
      mstore(_path, div(pi, 0x20))
      mstore(0x40, add(_path, add(0x20, pi)))
    }
    return (_path, i);
  }
  
  function getVal(uint[] memory path, uint[] memory _json) private pure returns(uint[] memory){
    require (_json[0] == 4, "not raw value");
    (uint vallen, uint i) = getValLen(path, _json);
    uint[] memory val = new uint[](vallen);
    uint[] memory path2 = toArr(path);
    while(i < _json.length){
      (uint[] memory _path, uint i2) = getPath(i, _json);
      i = i2;
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
      if(_path.length != path2.length){
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
  
  
  function toArr(uint[] memory json) internal pure returns(uint[] memory){
    uint[]  memory _json;
    assembly {
      let ji := 0x0
      let prev := 0
      let start := add(json, 0x20)
      _json := msize()
      mstore(_json, mload(json))
      let _json0 := add(_json, 0x20)
      for { let i := 0 } lt(i, mload(json)) { i := add(i, 1) } {
	let v := mload(add(start, mul(i, 0x20)))
	if gt(v,0) {  
	  let p := 0
	  let x := v
	  let on := 0
	  let cur := 0
	  let len := 0
	  let num := 0
	  let is9 := 0
          for { } gt(v, 0) { } {
	    v := div(v, 10)
            p := add(p, 1)
          }
	  for { } gt(p, 0) { } {
	    let n := div(x, exp(10, sub(p, 1)))
	    let _on := on  
            if and(iszero(_on), gt(n, 0)) {
              on := 1
              if eq(n, 9) {
                len := 8
                is9 := 0
              }
	      if iszero(eq(n, 9)) {
                len := n
              }
              cur := 0
            }
	    if eq(_on, 1) {
	      num := add(num, mul(n, exp(10, sub(sub(len, cur), 1))))
              cur := add(cur, 1)
              if eq(cur, len) {
                prev := mul(prev, exp(10, len))
                if eq(is9, 1) {
                  prev := add(prev, num)
                }
	        if iszero(eq(is9, 1)) {
                  num := add(num, prev)
                  prev := 0
		  mstore(add(_json0, ji), num)
                  ji := add(ji, 0x20)
                }
                cur := 0
                on := 0
                len := 0
                num := 0
                is9 := 0
              }
            }
	    x := sub(x, mul(exp(10, sub(p, 1)), n))
	    p := sub(p, 1)
	  }
	}
      }
      mstore(_json, div(ji, 0x20))
      mstore(0x40, add(_json, add(0x20, ji)))
    }
    return _json;
  }

  function _toString(uint8[] memory charCodes) private pure returns (string memory) {
    bytes memory stringBytes = new bytes(charCodes.length);
    for (uint i = 0; i < charCodes.length; i++) stringBytes[i] = bytes1(charCodes[i]);
    return string(stringBytes);
  }

  function _qInt (uint[] memory value) internal pure returns (int) {
    require(value[0] == 2 && value[2] == 0, "not int");
    return int(value[3]) * (value[1] == 1 ? int(1) : int(-1));
  }
  
  function _qFloat (uint[] memory value) internal pure returns (uint[3] memory) {
    require(value[0] == 2 && value[2] != 0, "not float");
    uint[3] memory float;
    float[0] = value[1];
    float[1] = value[2];
    float[2] = value[3];
    return float;
  }

  function _qRaw (uint[] memory value) internal pure returns (uint[] memory) {
    require(value[0] == 4, "not object or array");
    return value;
  }

  function _qString (uint[] memory value) internal pure returns (string memory) {
    require(value[0] == 3, "not string");
    uint8[] memory charCodes = new uint8[](value[1]);
    for(uint i = 0; i < value[1];i++) charCodes[i] = uint8(value[i+2]);
    string memory str = _toString(charCodes);
    return str;
  }

  function _qBool (uint[] memory value) internal pure returns (bool) {
    require(value[0] == 1, "not bool");
    return value[1] == 1 ? true : false;
  }
  
  function _qNull (uint[] memory value) internal pure returns (bool) {
    require(value[0] == 0, "not null");
    return true;
  }

  function _parseZKP(uint[] calldata zkp) internal pure returns (uint[2] memory, uint[2][2] memory, uint[2] memory, uint[] memory) {
    uint[2] memory _pA;
    uint[2][2] memory _pB;
    uint[2] memory _pC;
    uint[] memory sigs = new uint[](zkp.length - 8);
    for(uint i = 0; i < 2; i++) _pA[i] = zkp[i];
    for(uint i = 2; i < 4; i++) _pB[0][i - 2] = zkp[i];
    for(uint i = 4; i < 6; i++) _pB[1][i - 4] = zkp[i];
    for(uint i = 6; i < 8; i++) _pC[i - 6] = zkp[i];
    for(uint i = 8; i < zkp.length; i++) sigs[i - 8] = zkp[i];
    return (_pA, _pB, _pC, sigs);
  }

  function getInt (uint[] memory path, uint[] memory raw) internal pure returns (int) {
    uint[] memory value = getVal(path, raw);
    return _qInt(value);
  }

  function getString (uint[] memory path, uint[] memory raw) internal pure returns (string memory) {
    uint[] memory value = getVal(path, raw);
    _qString(value);
  }

  function getBool (uint[] memory path, uint[] memory raw) internal pure returns (bool) {
    uint[] memory value = getVal(path, raw);
    _qBool(value);
  }

  function getNull (uint[] memory path, uint[] memory raw) internal pure returns (bool) {
    uint[] memory value = getVal(path, raw);
    _qNull(value);
  }
  
}
