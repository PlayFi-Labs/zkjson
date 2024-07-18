# Mountain Merkle Range for FingerPrint Verification

This project, scaffolded with [zksync-cli](https://github.com/matter-labs/zksync-cli), focuses on the implementation of Merkle Mountain Ranges (MMRs) specifically for FingerPrint verification. 

MMRs are an advanced data structure derived from Merkle trees, designed to efficiently store lists of items. They are particularly beneficial for providing compact proofs of inclusion, which is crucial for verifying the authenticity and integrity of digital fingerprints in a blockchain environment. This feature makes it highly efficient to verify whether a fingerprint is part of a list without needing the entire dataset. Additionally, MMRs support append-only operations, allowing data to be added while maintaining the integrity and verifiability of the structure. This capability is essential for scenarios where data integrity and auditability are crucial, such as in blockchain technology and data security applications, making MMRs an ideal choice for fingerprint verification.

## Project Layout


- `/scripts`: Utility scripts for interaction.

The integration of MMRs for fingerprint verification offers a robust solution for ensuring the authenticity and integrity of data in blockchain applications. By leveraging the append-only and compact proof features of MMRs, this project aims to provide a secure and efficient method for managing digital fingerprints.

## Setting Up Environment

This project uses `.env` files to secure private keys. Follow these steps to set up:

1. Add your private key in `.env`:

```bash
FINGERPRINT_PROXY_SC=your_smart_contract_address_here...
ZKSYNC_SEPOLIA_PRIVATE_KEY=your_private_key_here...
```

## How to Use

To set up, you need to first start a zkSync node using Hardhat, and then deploy your contracts. Here are the steps:

1. **Install dependencies**: Before starting a zkSync node, you need to install the necessary dependencies. Run the following command:

```bash
npm install
```

## Useful Links

- [Official Site](https://www.playfi.ai/)
- [GitHub](https://github.com/PlayFi-Labs)
- [Twitter](https://twitter.com/PlayFiGaming)
- [Discord](https://discord.com/invite/playfi)

## License

This project is under the [MIT](./LICENSE) license.