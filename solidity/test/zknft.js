const crypto = require("crypto")
const snarkjs = require("snarkjs")
const { push, arr, toArray } = require("../../sdk/uint")
const { parse } = require("../../sdk/parse")
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { expect } = require("chai")
const { resolve } = require("path")
const { pad, path, val } = require("../../sdk/encoder")

function coerce(o) {
  if (o instanceof Uint8Array && o.constructor.name === "Uint8Array") return o
  if (o instanceof ArrayBuffer) return new Uint8Array(o)
  if (ArrayBuffer.isView(o)) {
    return new Uint8Array(o.buffer, o.byteOffset, o.byteLength)
  }
  throw new Error("Unknown type, must be binary type")
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const BASE = ALPHABET.length
const LEADER = ALPHABET.charAt(0)
const FACTOR = Math.log(BASE) / Math.log(256) // log(BASE) / log(256), rounded up
const iFACTOR = Math.log(256) / Math.log(BASE) // log(256) / log(BASE), rounded up

function toCID(source) {
  // @ts-ignore
  if (source instanceof Uint8Array);
  else if (ArrayBuffer.isView(source)) {
    source = new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
  } else if (Array.isArray(source)) {
    source = Uint8Array.from(source)
  }
  if (!(source instanceof Uint8Array)) {
    throw new TypeError("Expected Uint8Array")
  }
  if (source.length === 0) {
    return ""
  }
  // Skip & count leading zeroes.
  var zeroes = 0
  var length = 0
  var pbegin = 0
  var pend = source.length
  while (pbegin !== pend && source[pbegin] === 0) {
    pbegin++
    zeroes++
  }
  // Allocate enough space in big-endian base58 representation.
  var size = ((pend - pbegin) * iFACTOR + 1) >>> 0
  var b58 = new Uint8Array(size)
  // Process the bytes.
  while (pbegin !== pend) {
    var carry = source[pbegin]
    // Apply "b58 = b58 * 256 + ch".
    var i = 0
    for (
      var it1 = size - 1;
      (carry !== 0 || i < length) && it1 !== -1;
      it1--, i++
    ) {
      carry += (256 * b58[it1]) >>> 0
      b58[it1] = carry % BASE >>> 0
      carry = (carry / BASE) >>> 0
    }
    if (carry !== 0) {
      throw new Error("Non-zero carry")
    }
    length = i
    pbegin++
  }
  // Skip leading zeroes in base58 result.
  var it2 = size - length
  while (it2 !== size && b58[it2] === 0) {
    it2++
  }
  // Translate the result into a string.
  var str = LEADER.repeat(zeroes)
  for (; it2 < size; ++it2) {
    str += ALPHABET.charAt(b58[it2])
  }
  return str
}

async function deploy() {
  const [owner, user] = await ethers.getSigners()
  const VerifierIPFS = await ethers.getContractFactory("Groth16VerifierIPFS")
  const verifierIPFS = await VerifierIPFS.deploy()
  const ZKNFT = await ethers.getContractFactory("ZKNFT")
  const zknft = await ZKNFT.deploy(verifierIPFS.address)
  return { zknft, owner, user }
}

describe("zkNFT", function () {
  this.timeout(0)
  it("Should query metadata", async function () {
    const { user, owner, zknft } = await loadFixture(deploy)
    const json = { hello: "world" }
    const str = new TextEncoder().encode(JSON.stringify(json))
    const hash = coerce(crypto.createHash("sha256").update(str).digest())
    const cid = toCID(new Uint8Array([18, hash.length, ...Array.from(hash)]))
    await zknft.mint(user.address, `ipfs://${cid}`)
    let encoded = arr(256)
    for (let v of Array.from(str)) encoded = push(encoded, 256, 9, v)
    const enc = parse(encoded, 256)
    const _path = pad(path("hello"), 5)
    const _val = pad(val("world"), 5)
    const inputs = { path: _path, val: _val, encoded }
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      resolve(
        __dirname,
        "../../circom/build/circuits/ipfs/index_js/index.wasm",
      ),
      resolve(__dirname, "../../circom/build/circuits/ipfs/index_0001.zkey"),
    )
    const zkp = [
      ...proof.pi_a.slice(0, 2),
      ...proof.pi_b[0].slice(0, 2).reverse(),
      ...proof.pi_b[1].slice(0, 2).reverse(),
      ...proof.pi_c.slice(0, 2),
      ...publicSignals,
    ]
    expect(await zknft.query(0, _path, zkp)).to.eql("world")
  })
})