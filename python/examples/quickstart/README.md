# Quickstart

Constructs a `ParmanaClient`, submits a Business Transaction through
`POST /execute`, and prints the resulting Execution Trust Record.

## What this proves

- The client can reach a real running Parmana Runtime and get back a
  fully-formed `ExecutionTrustRecord`, including the fields a previous
  SDK version silently dropped or never modeled:
  - `trust_record.signature` (a real `Signature` object, not missing)
  - `trust_record.executions[0].evidence` (what was actually executed)
  - `trust_record.executions[0].completed_at` / `.metadata`
- `trust_record.signature.algorithm` decodes to a real `SignatureAlgorithm`
  enum member (`isinstance` holds), not a bare string.

## Prerequisites

- Node.js >= 22 and the repo's root `npm install` already run (to build/run
  `packages/api` via `tsx`).
- A local Parmana API server running on `http://localhost:3000`. From the
  repo root:

  ```bash
  PARMANA_STORAGE=memory \
    PARMANA_POLICY_DIR=/absolute/path/to/policies \
    PARMANA_KEY_DIR=/absolute/path/to/keys \
    VENDOR_PAYMENT_TOKEN=quickstart-demo-token \
    node_modules/.bin/tsx packages/api/src/server.ts
  ```

  `memory` storage is used here so the example has no external database
  dependency. The repo's committed `.env` defaults to Supabase-backed
  storage; override `PARMANA_STORAGE` as shown above to run fully locally.

  The Execution Gateway is wired into this server unconditionally
  (`createExecutionSystem()` always builds one), so it needs a Gateway
  keypair (`keys/gateway.private.pem` / `.public.pem`, not generated
  automatically, run `npm run generate:gateway-keys`) and a credential
  for the one wired connector (`VENDOR_PAYMENT_TOKEN`, any placeholder
  value works against the mock connector).

  > On this repo's current setup, plain `npm run dev` / `npx tsx ...`
  > from the repo root do not resolve correctly, because both the root
  > `package.json` and `typescript/package.json` declare
  > `"name": "parmana"`. Invoke the local `tsx` binary directly, as shown
  > above (pre-existing, unrelated to the Python SDK -- see the
  > consolidated core-API findings note).

- The Python SDK installed: `pip install -e ./python`.

## Run

```bash
python python/examples/quickstart/run.py
```

## Expected output (real run against a local server, 2026-07-12)

```
Connected to http://localhost:3000 (SDK v1.0.0)

Business Transaction ID: be045836-0016-4c96-838e-a8934cbe0ee9
Trust Record ID:         cabb41d7-1ab5-4cc9-a950-5c4300c6a826
Trust Record Hash:       fdb313e82c7cd86cf5f1dfb0ab90ac72f550a67a91891ebfce9462a73e9da103
Signature Algorithm:     SignatureAlgorithm.ED25519

Full Execution Trust Record:
{
  "trust_record_id": "cabb41d7-1ab5-4cc9-a950-5c4300c6a826",
  ...
  "executions": [
    {
      ...
      "evidence": {
        "business_transaction_id": "be045836-0016-4c96-838e-a8934cbe0ee9",
        "action": "payments:execute",
        "target": "vendor://payments",
        "parameters": { "amount": 1000, "currency": "USD" },
        "success": true,
        "executed_at": "2026-07-12 07:25:59.706000+00:00",
        "attributes": {
          "connector": {
            "connectorId": "vendor-payment",
            "connectorVersion": "1.0.0",
            "capability": "payments:execute",
            "sanitizedEndpoint": "vendor://payments",
            "credentialProviderId": "environment",
            "responseSummary": { "success": true, "metadata": {} },
            "connectorEvidenceHash": "1903ba5fd1e4b27ac643e690a8ccf12d503710125dd88c1971ae18890748c70c"
          }
        }
      },
      "metadata": { "authorizationId": "7824fffb-dbb2-4046-9436-fbbd0ea777fa" }
    }
  ],
  ...
  "signature": {
    "algorithm": "ed25519",
    "key_id": "default",
    "value": "9zEj+jTwPgjqBiZwZ9t2V4HurABRfLsS3yNuviy+w+LYpxQZVV5Ra3k79z32Xqr8rtrlIEyWdTu80zknwbdYAQ==",
    "signed_at": "2026-07-12 07:25:59.707000+00:00"
  }
}
```

IDs, hashes, and signature values will differ on every run. The `attributes.connector` block
is populated by `@parmana/connector-sdk`'s `SdkConnectorExecutor`, not present in records
created before that package existed.
