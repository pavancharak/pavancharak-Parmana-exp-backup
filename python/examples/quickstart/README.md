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

- Node.js >= 24 and the repo's root `npm install` already run (to build/run
  `packages/api` via `tsx`).
- A local Parmana API server running on `http://localhost:3000`, with
  caller authentication disabled (this example never supplies an
  `api_key`) and a Gateway keypair present (`keys/default.{private,public}.pem`,
  `keys/gateway.{private,public}.pem` -- not generated automatically;
  `npx tsx scripts/generate-keypair.ts --algorithm ed25519 --key-id default`
  and `... --key-id gateway`). From the repo root:

  ```bash
  PARMANA_STORAGE=memory \
    PARMANA_POLICY_DIR=/absolute/path/to/policies \
    PARMANA_KEY_DIR=/absolute/path/to/keys \
    PARMANA_AUTH_DISABLED=true \
    npx tsx packages/api/src/server.ts
  ```

  `memory` storage is used here so the example has no external database
  dependency. The repo's committed `.env` defaults to Supabase-backed
  storage; override `PARMANA_STORAGE` as shown above to run fully locally.

  This example targets `test:fixture-execute`, a generic,
  `NODE_ENV=test`-only fixture connector (`createTestFixtureConnector.ts`)
  that needs no credential of its own -- the `payments:execute`/
  `vendor-payment` connector and its `VENDOR_PAYMENT_TOKEN` this example
  originally targeted were removed from the repository entirely
  (docs/VERIFICATION-GAPS.md G-27), not renamed.

- The Python SDK installed: `pip install -e ./python`.

## Automated proof

`python/tests/test_quickstart_example.py` runs this exact script (via
its exported `run_quickstart()`) against a real, freshly-spawned local
server on every `pytest` run -- this isn't just an example that happens
to compile, it's asserted to actually work.

## Run

```bash
python python/examples/quickstart/run.py
```

## Expected output (real run against a local server, 2026-08-11)

```
Connected to http://127.0.0.1:3999 (SDK v1.0.5)

Business Transaction ID: 922d87cc-9417-4d10-b9ec-a7ace53226d5
Trust Record ID:         97c2d623-0de7-4794-b9e5-902332bdcf53
Trust Record Hash:       d11af9c31333bc5f0a2a1ff4124c47379798829f216223cf60dc3484268b2883
Signature Algorithm:     SignatureAlgorithm.ED25519

Full Execution Trust Record:
{
  "trust_record_id": "97c2d623-0de7-4794-b9e5-902332bdcf53",
  ...
  "executions": [
    {
      ...
      "evidence": {
        "business_transaction_id": "922d87cc-9417-4d10-b9ec-a7ace53226d5",
        "action": "test:fixture-execute",
        "target": "vendor://payments",
        "parameters": { "amount": 1000, "currency": "USD" },
        "success": true,
        "executed_at": "2026-08-11 07:09:42.662000+00:00",
        "attributes": {
          "connector": {
            "connectorId": "test-fixture",
            "connectorVersion": "1.0.0",
            "capability": "test:fixture-execute",
            "sanitizedEndpoint": "vendor://payments",
            "credentialProviderId": "static",
            "responseSummary": { "success": true, "metadata": {} },
            "connectorEvidenceHash": "6263f537a7bcb8d941cea5f6b12bd1589b51879c88221a8c57101fc7fed2539c"
          }
        }
      },
      "metadata": { "authorizationId": "3808f0d4-a158-431d-b4ae-98196cda32d9" }
    }
  ],
  ...
  "signature": {
    "algorithm": "ed25519",
    "key_id": "default",
    "value": "JEMIPJQ3fvSEnjoHOqypoaTx3xNyiSd4LCInlchJhSuzhc8wH5RsiMJla5/idVIdzT2xX/aNzPEJbfBZjK1VBw==",
    "signed_at": "2026-08-11 07:09:42.673000+00:00"
  }
}
```

IDs, hashes, and signature values will differ on every run. The `attributes.connector` block
is populated by `@parmana/connector-sdk`'s `SdkConnectorExecutor`, not present in records
created before that package existed.
