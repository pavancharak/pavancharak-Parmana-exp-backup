import {
  MemoryExecutionAuditSink,
  type ExecutionAuditSink,
} from "@parmana/execution-control";

/**
 * Creates the Execution Audit sink.
 *
 * Current implementation:
 *   In-memory.
 *
 * Future:
 *   Replace with a persistent audit sink
 *   (Postgres, Supabase, Kafka, SIEM, etc.)
 *   without changing the bootstrap.
 */
export function createExecutionAuditSink(): ExecutionAuditSink {
  return new MemoryExecutionAuditSink();
}