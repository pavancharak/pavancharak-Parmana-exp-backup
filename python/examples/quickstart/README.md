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
    node_modules/.bin/tsx packages/api/src/server.ts
  ```

  `memory` storage is used here so the example has no external database
  dependency. The repo's committed `.env` defaults to Supabase-backed
  storage; override `PARMANA_STORAGE` as shown above to run fully locally.

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

## Expected output (real run against a local server, 2026-07-06)

```
Connected to http://localhost:3000 (SDK v1.0.0)

Business Transaction ID: 111a9197-21b3-42fb-8b7b-a000f1278680
Trust Record ID:         71dc39c9-2f24-401c-b999-6cbc12ee4156
Trust Record Hash:       8d8fc49457038134776ac20fee289991596ab30dff5765e2d1007aed2f51ad69
Signature Algorithm:     SignatureAlgorithm.ED25519

Full Execution Trust Record:
{
  "trust_record_id": "71dc39c9-2f24-401c-b999-6cbc12ee4156",
  ...
  "executions": [
    {
      ...
      "evidence": {
        "business_transaction_id": "111a9197-21b3-42fb-8b7b-a000f1278680",
        "action": "VendorPayment",
        "target": "vendor/V-100",
        "parameters": { "amount": 1000, "currency": "USD" },
        "success": true,
        "executed_at": "2026-07-06 04:06:57.303000+00:00",
        "attributes": {}
      },
      "metadata": { "authorizationId": "05574322-a94d-470b-afef-ceb435b13023" }
    }
  ],
  ...
  "signature": {
    "algorithm": "ed25519",
    "key_id": "default",
    "value": "5haUPDvgK5y5/ZC/6LD0AYEft/7OPYSaoHe/l2mF+hmE6/rTvMbrjYzwxknCMmaPvDvPsHaX7WED910IHKRyBw==",
    "signed_at": "2026-07-06 04:06:57.305000+00:00"
  }
}
```

IDs, hashes, and signature values will differ on every run.
