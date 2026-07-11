import type {
  Execution,
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
  Override,
  Receipt,
  Verification,
} from "@parmana/shared";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Supabase implementation of ExecutionTrustRecordRepository.
 *
 * Stores the immutable Trust Record header in
 * execution_trust_records and stores runtime
 * artifacts in their respective tables.
 */
export class SupabaseExecutionTrustRecordRepository
  implements ExecutionTrustRecordRepository
{
  constructor(
    private readonly client: SupabaseClient,
  ) {}

  /**
   * Creates the Trust Record header.
   */
  async create(
    record: ExecutionTrustRecord,
  ): Promise<ExecutionTrustRecord> {
    const { error } = await this.client
      .from("execution_trust_records")
      .insert({
        trust_record_id:
          record.trustRecordId,

        business_transaction_id:
          record.businessTransactionId,

        transaction_json:
          record.transaction,

        trust_record_hash:
          record.trustRecordHash,

        signature_json:
          record.signature,

        created_at:
          record.createdAt.toISOString(),

        updated_at:
          record.updatedAt.toISOString(),
      });

    if (error) {
      throw error;
    }

    return record;
  }
/**
 * Loads the complete Trust Record aggregate.
 */
async findByTransactionId(
  businessTransactionId: string,
): Promise<ExecutionTrustRecord | null> {

const {
  data: record,
  error,
} = await this.client
  .from("execution_trust_records")
  .select("*")
  .eq(
    "business_transaction_id",
    businessTransactionId,
  )
  .maybeSingle();

  if (error) {
    throw error;
  }

  if (!record) {
    return null;
  }
const executionResult = await this.client
  .from("executions")
  .select("execution_json")
  .eq(
    "business_transaction_id",
    businessTransactionId,
  )
  .order(
    "created_at",
    { ascending: true },
  )
  .order(
    "seq",
    { ascending: true },
  );



const executions = executionResult.data;
const executionError = executionResult.error;

if (executionError) {
  throw executionError;
}


const overrideResult = await this.client
  .from("overrides")
  .select("override_json")
  .eq(
    "business_transaction_id",
    businessTransactionId,
  )
  .order(
    "created_at",
    { ascending: true },
  )
  .order(
    "seq",
    { ascending: true },
  );

const overrides = overrideResult.data;
const overrideError = overrideResult.error;

if (overrideError) {
  throw overrideError;
}


const verificationResult = await this.client
  .from("verifications")
  .select("verification_json")
  .eq(
    "business_transaction_id",
    businessTransactionId,
  )
  .order(
    "verified_at",
    { ascending: true },
  )
  .order(
    "seq",
    { ascending: true },
  );
const verifications = verificationResult.data;
const verificationError = verificationResult.error;

if (verificationError) {
  throw verificationError;
}


const receiptResult = await this.client
  .from("receipts")
  .select("receipt_json")
  .eq(
    "business_transaction_id",
    businessTransactionId,
  )
  .order(
    "issued_at",
    { ascending: true },
  )
  .order(
    "seq",
    { ascending: true },
  );

const receipts = receiptResult.data;
const receiptError = receiptResult.error;
if (receiptError) {
  throw receiptError;
}


  const trustRecord: ExecutionTrustRecord = {
  trustRecordId:
    record.trust_record_id,

  businessTransactionId:
    record.business_transaction_id,

  transaction:
    record.transaction_json,


executions:
  (executions ?? []).map(
    (
      e: {
        readonly execution_json: Execution;
      },
    ) => e.execution_json,
  ),

overrides:
  (overrides ?? []).map(
    (
      o: {
        readonly override_json: Override;
      },
    ) => o.override_json,
  ),

verifications:
  (verifications ?? []).map(
    (
      v: {
        readonly verification_json: Verification;
      },
    ) => v.verification_json,
  ),

receipts:
  (receipts ?? []).map(
    (
      r: {
        readonly receipt_json: Receipt;
      },
    ) => r.receipt_json,
  ),


  trustRecordHash:
    record.trust_record_hash,

  signature:
    record.signature_json,

  createdAt:
    new Date(record.created_at),

  updatedAt:
    new Date(record.updated_at),
};



return trustRecord;
}
/**
 * Appends an Execution.
 */
async appendExecution(
  businessTransactionId: string,
  execution: Execution,
): Promise<void> {
  const { error } = await this.client
    .from("executions")
    .insert({
      execution_id:
        execution.executionId,

      business_transaction_id:
        businessTransactionId,

      execution_json:
        execution,

      created_at:
        execution.startedAt.toISOString(),
    });

  if (error) {
    throw error;
  }

  await this.touch(
    businessTransactionId,
  );
}
/**
 * Replaces an immutable Execution snapshot.
 *
 * @deprecated
 */
async replaceExecution(
  execution: Execution,
): Promise<void> {
  const { error } = await this.client
    .from("executions")
    .update({
      execution_json:
        execution,
    })
    .eq(
      "execution_id",
      execution.executionId,
    );

  if (error) {
    throw error;
  }

  await this.touch(
    execution.businessTransactionId,
  );
}
/**
 * Appends an Override.
 */
async appendOverride(
  businessTransactionId: string,
  override: Override,
): Promise<void> {
  const { error } = await this.client
    .from("overrides")
    .insert({
      override_id:
        override.overrideId,

      business_transaction_id:
        businessTransactionId,

      override_json:
        override,

      created_at:
        override.approvedAt.toISOString(),
    });

  if (error) {
    throw error;
  }

  await this.touch(
    businessTransactionId,
  );
}
/**
 * Appends a Verification.
 */
async appendVerification(
  businessTransactionId: string,
  verification: Verification,
): Promise<void> {
  const { error } = await this.client
    .from("verifications")
    .insert({
      verification_id: verification.verificationId,
      business_transaction_id: businessTransactionId,
      verification_json: verification,
      verified_at: verification.verifiedAt.toISOString(),
    });

  if (error) {
    throw error;
  }

  await this.touch(businessTransactionId);
}
/**
 * Appends a Receipt.
 */
async appendReceipt(
  businessTransactionId: string,
  receipt: Receipt,
): Promise<void> {
  const { error } = await this.client
    .from("receipts")
    .insert({
      receipt_id:
        receipt.receiptId,

      business_transaction_id:
        businessTransactionId,

      receipt_json:
        receipt,

      issued_at:
        receipt.issuedAt.toISOString(),
    });

  if (error) {
    throw error;
  }

  await this.touch(
    businessTransactionId,
  );
}
/**
 * Updates the Trust Record timestamp.
 */
private async touch(
  businessTransactionId: string,
): Promise<void> {

 

  const result = await this.client
    .from("execution_trust_records")
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq(
      "business_transaction_id",
      businessTransactionId,
    );



  if (result.error) {
    
    throw result.error;
  }


}
}