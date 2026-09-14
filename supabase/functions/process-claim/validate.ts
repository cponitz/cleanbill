// The validator lives in _shared/validate.ts (the claim API's pre-check uses addressMatches too); this shim keeps the
// historical import path and the Deno test location (validate_test.ts) stable.
export * from "../_shared/validate.ts";
