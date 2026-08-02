import type {
  RefusalRecord,
  RefusalRecordRepository,
} from "@parmana/shared";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Supabase implementation of RefusalRecordRepository (RFC-0021).
 *
 * Unlike SupabaseExecutionTrustRecordRepository, there is no
 * append-only sub-history to assemble on read -- a Refusal Record is
 * a single row, one insert, one lookup.
 */
export class SupabaseRefusalRecordRepository
  implements RefusalRecordRepository
{
  constructor(
    private readonly client: SupabaseClient,
  ) {}

  async create(
    record: RefusalRecord,
  ): Promise<RefusalRecord> {
    const { error } = await this.client
      .from("refusal_records")
      .insert({
        refusal_record_id:
          record.refusalRecordId,

        business_transaction_id:
          record.businessTransactionId,

        decision_json:
          record.decision,

        evaluated_intent_json:
          record.evaluatedIntent,

        binding_violations_json:
          record.bindingViolations ?? null,

        submitted_by:
          record.submittedBy ?? null,

        refusal_record_hash:
          record.refusalRecordHash,

        signature_json:
          record.signature,

        created_at:
          record.createdAt.toISOString(),
      });

    if (error) {
      throw error;
    }

    return record;
  }

  async findByTransactionId(
    businessTransactionId: string,
  ): Promise<RefusalRecord | null> {
    const {
      data: row,
      error,
    } = await this.client
      .from("refusal_records")
      .select("*")
      .eq(
        "business_transaction_id",
        businessTransactionId,
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!row) {
      return null;
    }

    return {
      refusalRecordId:
        row.refusal_record_id,

      businessTransactionId:
        row.business_transaction_id,

      decision:
        row.decision_json,

      evaluatedIntent:
        row.evaluated_intent_json,

      bindingViolations:
        row.binding_violations_json ?? undefined,

      submittedBy:
        row.submitted_by ?? undefined,

      refusalRecordHash:
        row.refusal_record_hash,

      signature:
        row.signature_json,

      createdAt:
        new Date(row.created_at),
    };
  }
}
