// ABI for the Batcher contract — the EIP-7702 delegation target.
// Mirrors src/Batcher.sol.
// <Written by AI.>

export const BATCHER_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "CallExecuted",
    inputs: [
      { name: "index", type: "uint256", indexed: true },
      { name: "target", type: "address", indexed: true },
      { name: "success", type: "bool", indexed: false },
      { name: "returnData", type: "bytes", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "MigrationCompleted",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "successCount", type: "uint256", indexed: false },
      { name: "totalCount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

export type BatcherCall = {
  target: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
  /** Optional explicit gas hint. When set, the wallet skips its own per-call
   *  estimation (which under EIP-5792 simulates each call independently and
   *  fails for sequence-dependent calls like swap-after-approve). */
  gas?: bigint;
};
