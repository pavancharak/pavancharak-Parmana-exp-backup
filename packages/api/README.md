# @parmana/api

The HTTP surface over the canonical Execution Trust runtime (`@parmana/runtime`):
`POST /execute`, `POST /verify`, `GET /verify/:id`, `POST /receipt`,
`POST /replay`, and the `/transactions` and `/trust-records` read routes.

## Running the test suite

Most of this package's tests are hermetic and require no environment setup.

### Supabase-backed integration tests

A subset of integration tests exercise the real Supabase-backed storage
provider (`SupabaseStorageProvider`) against a live Supabase project, rather
than the in-memory provider. These tests cannot run from a bare clone with no
credentials, and are skipped automatically — with a logged reason — when the
required environment variables are absent:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`)

Setting these alone is not enough to run these tests: since the G-3 fix
(docs/VERIFICATION-GAPS.md), a suite that detects `SUPABASE_*` configured
without `ALLOW_LIVE_SUPABASE=1` also set refuses to run at all — a hard
failure naming the missing flag, not a silent run and not a silent skip. Set
both `SUPABASE_*` and `ALLOW_LIVE_SUPABASE=1` to actually run these tests:

- `tests/unit/transactions-api.test.ts` (persistence cases only — most of
  this file is hermetic)
- `tests/integration/verification-negative.integration.test.ts`
- `tests/integration/trust-record-get.integration.test.ts`
- `tests/integration/trust-record-lifecycle.integration.test.ts`
- `tests/integration/workflow-negative.integration.test.ts`
- `tests/integration/workflow-supabase.integration.test.ts`
- `tests/integration/receipt-negative.integration.test.ts`
- `tests/integration/receipt-signature.integration.test.ts`
- `tests/integration/replay.integration.test.ts`
- `tests/integration/supabase-caller-audit-sink.integration.test.ts` (added
  when the durable `SupabaseCallerAuditSink` closed G-13)

The skip check lives in `tests/helpers/supabase-availability.ts`.

The sibling `@parmana/storage` package has its own Supabase-gated suites,
routed through the same `resolveSupabaseGate` mechanism (its own copy of the
helper, kept independent by design — see that file's comment) and the same
`ALLOW_LIVE_SUPABASE=1` requirement:
`packages/storage/tests/integration/supabase-execution-trust-record-ordering.integration.test.ts`,
`supabase-nonce-store.integration.test.ts` (G-13), and
`supabase-business-transaction-duplicate.integration.test.ts` (G-1).

### Known non-hermetic gap: policy directory

Independent of Supabase, any test that drives a real execution through this
package's `application` singleton (`src/application.ts`) needs
`PARMANA_POLICY_DIR` to point at a directory of policy definitions
(`@parmana/policy`'s `FilePolicyRepository` resolves against
`config.policy.directory`, which is `process.env.PARMANA_POLICY_DIR` with no
repo-relative fallback — see `packages/shared/src/config/Config.ts`). On a
machine without this env var set, those tests fail with a `TypeError` inside
`FilePolicyRepository.load()` rather than skipping gracefully. This is a
production-code config gap, not a test-fixture issue, and is tracked as a
follow-up rather than fixed by test-side changes.
