/**
 * Execution Binding Result.
 *
 * Indicates whether the execution request
 * matches the previously authorized action.
 */
export interface ExecutionBindingResult {
  /**
   * True if the execution request is valid.
   */
  readonly valid: boolean;

  /**
   * Optional failure reason.
   */
  readonly reason?: string;
}