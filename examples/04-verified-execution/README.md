# Example 04 — Verified Execution

## Overview

Every other tutorial trusts Parmana's own process: it calls the Runtime and
reads back whatever `ExecutionTrustRecord` comes out. This example proves
something stronger — that a completely separate, independent process can
verify Parmana's authorization **without trusting Parmana's runtime or
database at all**, using only:

- Parmana's public key (out-of-band, e.g. a config value)
- `@parmana/envelope-verifier`

It demonstrates two roles, in a single script:

- **PARMANA SIDE** — configures the Runtime, submits an approved
  `BusinessTransaction`, and shows the `SignedExecutionAuthorization`
  attached to the outgoing execution request.
- **RECEIVING SIDE** — an independent Express server using
  `requireParmanaAuthorization` (from `@parmana/envelope-verifier/express`)
  with a `MemoryNonceStore`, demonstrating four outcomes:
  1. Valid envelope → accepted (`200`)
  2. The same envelope replayed → rejected (`403`, `nonceUnseen: false`)
  3. Tampered payload (changed `decisionId`) → rejected (`403`,
     `signatureVerified: false`)
  4. Missing authorization → rejected (`401`)

Both roles run in the same process for convenience, but nothing about the
receiving side depends on that — it is a plain HTTP server that only ever
sees JSON over the wire and Parmana's public key.

---

## How Parmana's runtime reaches the receiving side

Parmana forwards every approved execution request to a pluggable
`ExecutionSystem` (`@parmana/execution-system`). This example wires
`RuntimeFactory.create(...)` with a small `RecordingHttpExecutionSystem`
(the same request-forwarding contract as the package's own
`HttpExecutionSystem`, plus recording for this example's console output) so
you can see exactly what left Parmana's process and exactly what the
receiving side saw.

---

## Files

| File | Purpose |
|------|---------|
| `transaction.json` | An approved `BusinessTransaction` (vendor-payment policy) |
| `run.ts` | Runs both roles end to end |

---

## Keys

This example uses the same key mechanism as the rest of the repo:
`@parmana/crypto`'s `FileKeyProvider`, keyId `"default"`, PEM files at
`<keyDirectory>/default.private.pem` / `default.public.pem`.

- If the repository's own keys (`<repo-root>/keys/`) are present, it uses
  them directly — no separate setup.
- If they are absent (e.g. a fresh clone), it generates a local ed25519
  keypair into `examples/04-verified-execution/.keys/` via the repo's
  `packages/crypto/scripts/generate-keypair.ts` script, and points
  `PARMANA_KEY_DIR` at it for the duration of the run. No key material is
  ever hardcoded in this example.

## Run

From the repository root, invoke the tsx CLI directly rather than through
`npx tsx` (in this workspace, `npx tsx <path>` was observed to mis-resolve
the entry path against `packages/api` instead of the repo root — the cause
wasn't isolated, but the repo's own `scripts/run-examples.ts` already avoids
`npx tsx` for its spawned examples, using this same direct-CLI form):

```bash
node ./node_modules/tsx/dist/cli.mjs examples/04-verified-execution/run.ts
```

### Running under the post-quantum provider (ML-DSA-65 / dilithium3)

No code path changes — only configuration and key material:

1. Node >= 24 is required (native `node:crypto` `ml-dsa-65` support).
2. Regenerate keys for dilithium3 (**do not** reuse the ed25519 keys —
   `--force` overwrites `default.private.pem`/`default.public.pem` in
   place):
   ```bash
   node ./node_modules/tsx/dist/cli.mjs packages/crypto/scripts/generate-keypair.ts \
     --algorithm dilithium3 --force
   ```
3. Run with the provider overridden:
   ```bash
   SIGNATURE_PROVIDER=dilithium3 node ./node_modules/tsx/dist/cli.mjs examples/04-verified-execution/run.ts
   ```

Remember to regenerate ed25519 keys again afterward (same command with
`--algorithm ed25519 --force`) if you want other examples/tests that expect
ed25519 keys to keep working.

---

## Expected Output

The script prints, in order:

1. The submitted Business Transaction.
2. Confirmation that the Runtime executed (policy evaluation, authorization
   signing, forwarding to the receiving side, verification, receipt
   generation).
3. The full `SignedExecutionAuthorization` that left Parmana's process.
4. The resulting `ExecutionTrustRecord`.
5. Scenario 1 (valid envelope) — the real HTTP response from the receiving
   side, `200` with `checks.nonceUnseen: true`.
6. Scenario 2 (replay) — `403`, `checks.nonceUnseen: false`.
7. Scenario 3 (tampered payload) — `403`, `checks.signatureVerified: false`.
8. Scenario 4 (missing authorization) — `401`.
9. A one-line summary of all four outcomes.

## What this does *not* prove

This example does not demonstrate persistent (cross-restart) nonce storage
— it uses `MemoryNonceStore`, which is explicitly unsafe for production (see
`@parmana/envelope-verifier`'s README). It also runs the receiving side in
the same OS process as Parmana's runtime purely for convenience; nothing in
the receiving side's code assumes that.
