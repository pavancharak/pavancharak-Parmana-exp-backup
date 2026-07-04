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

const result = await Promise.race([
  this.client
    .from("execution_trust_records")
    .select("*")
    .eq(
      "business_transaction_id",
      businessTransactionId,
    )
    .maybeSingle(),

  new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Query1 timeout")),
      3000,
    ),
  ),
]);




const {
  data: record,
  error,
} = result as any;

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
  );




const executions = executionResult.data;
const executionError = executionResult.error;

if (executionError) {
  throw executionError;
}


const overrides: Override[] = [];

 // console.time("query3");

// const overrideResult = await Promise.race([
 //  this.client
  //   .from("overrides")
  //   .select("override_json")
 //    .eq(
  //     "business_transaction_id",
   //    businessTransactionId,
  //   ),

 //  new Promise((_, reject) =>
  //   setTimeout(
     //  () => reject(new Error("Query3 timeout")),
     //  3000,
  //   ),
 //  ),
// ]);

// console.timeEnd("query3");

// console.dir(overrideResult, {
 //  depth: null,
// });

//  const overrides = (overrideResult as any).data;
// const overrideError = (overrideResult as any).error;

// if (overrideError) {
 //  throw overrideError;
// }


const verificationResult = await this.client
  .from("verifications")
  .select("verification_json")
  .eq(
    "business_transaction_id",
    businessTransactionId,
  );

const verifications = verificationResult.data;
const verificationError = verificationResult.error;

if (verificationError) {
  throw verificationError;
}


const receiptResult = await Promise.race([
  this.client
    .from("receipts")
    .select("receipt_json")
    .eq(
      "business_transaction_id",
      businessTransactionId,
    ),

  new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Query5 timeout")),
      3000,
    ),
  ),
]) as any;

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
      (e) => e.execution_json as Execution,
    ),

  overrides:
    (overrides ?? []).map(
  (o: any) => o.override_json as Override,
),

  verifications:
    (verifications ?? []).map(
      (v) => v.verification_json as Verification,
    ),

  receipts:
  (receipts ?? []).map(
    (r: any) => r.receipt_json as Receipt,
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


const result = await Promise.race([
  this.client
    .from("verifications")
    .insert({
      verification_id: verification.verificationId,
      business_transaction_id: businessTransactionId,
      verification_json: verification,
      verified_at: verification.verifiedAt.toISOString(),
    }),

  new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Verification insert timeout")),
      3000,
    ),
  ),
]) as any;



  if (result.error) {
    throw result.error;
  }



  await this.touch(businessTransactionId);


}/**
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