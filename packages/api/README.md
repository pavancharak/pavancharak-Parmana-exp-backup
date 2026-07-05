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

Set these (typically via a repo-root `.env`, gitignored) to run:

- `test/verification-negative.integration.test.ts`
- `test/trust-record-get.integration.test.ts`
- `test/trust-record-lifecycle.integration.test.ts`
- `test/workflow-negative.integration.test.ts`
- `test/workflow-supabase.integration.test.ts`
- `test/receipt-negative.integration.test.ts`
- `test/receipt-signature.integration.test.ts`
- `test/replay.integration.test.ts`

The skip check lives in `test/helpers/supabase-availability.ts`.

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
