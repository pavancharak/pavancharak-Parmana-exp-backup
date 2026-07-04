import type {
  BusinessTransaction,
  BusinessTransactionRepository,
} from "@parmana/shared";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase implementation of BusinessTransactionRepository.
 */
export class SupabaseBusinessTransactionRepository
  implements BusinessTransactionRepository
{
  constructor(
    private readonly client: SupabaseClient,
  ) {}

  /**
   * Persist immutable BusinessTransaction.
   */
  async create(
    transaction: BusinessTransaction,
  ): Promise<BusinessTransaction> {
    const { error } = await this.client
      .from("business_transactions")
      .insert({
        business_transaction_id:
          transaction.businessTransactionId,

        status:
          transaction.status,

        authority_json:
          transaction.authority,

        authorization_json:
          transaction.authorization,

        intent_json:
          transaction.intent,

        metadata_json:
          transaction.metadata,

        policy_json:
          transaction.policy,

        signals_json:
          transaction.signals,

        created_at:
          transaction.createdAt.toISOString(),
      });

    if (error) {
      throw error;
    }

    return transaction;
  }

  /**
   * Find transaction by id.
   */
  async findById(
    businessTransactionId: string,
  ): Promise<BusinessTransaction | null> {
    const { data, error } = await this.client
      .from("business_transactions")
      .select("*")
      .eq(
        "business_transaction_id",
        businessTransactionId,
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    return {
      businessTransactionId:
        data.business_transaction_id,

      status:
        data.status,

      authority:
        data.authority_json,

      authorization:
        data.authorization_json,

      intent:
        data.intent_json,

      metadata:
        data.metadata_json,

      policy:
        data.policy_json,

      signals:
        data.signals_json,

      createdAt:
        new Date(data.created_at),
    } as BusinessTransaction;
  }

  /**
   * True if transaction exists.
   */
  async exists(
    businessTransactionId: string,
  ): Promise<boolean> {
    const { count, error } =
      await this.client
        .from("business_transactions")
        .select(
          "*",
          {
            head: true,
            count: "exact",
          },
        )
        .eq(
          "business_transaction_id",
          businessTransactionId,
        );

    if (error) {
      throw error;
    }

    return (count ?? 0) > 0;
  }

  /**
   * List transactions.
   */
  async list(
    page: number,
    pageSize: number,
  ): Promise<
    readonly BusinessTransaction[]
  > {
    const from =
      (page - 1) * pageSize;

    const to =
      from + pageSize - 1;

    const { data, error } =
      await this.client
        .from("business_transactions")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false,
          },
        )
        .range(from, to);

    if (error) {
      throw error;
    }

    return (data ?? []).map(
      (row) =>
        ({
          businessTransactionId:
            row.business_transaction_id,

          status:
            row.status,

          authority:
            row.authority_json,

          authorization:
            row.authorization_json,

          intent:
            row.intent_json,

          metadata:
            row.metadata_json,

          policy:
            row.policy_json,

          signals:
            row.signals_json,

          createdAt:
            new Date(row.created_at),
        }) as BusinessTransaction,
    );
  }
}