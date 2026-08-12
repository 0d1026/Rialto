export enum ErrorCode {
  DISCOVERY_UNAVAILABLE = "discovery_unavailable",
  DISCOVERY_INVALID_QUERY = "discovery_invalid_query",
  DISCOVERY_RESOURCE_NOT_FOUND = "discovery_resource_not_found",
  SELLER_UNREACHABLE = "seller_unreachable",
  SELLER_DID_NOT_REQUEST_PAYMENT = "seller_did_not_request_payment",
  UNSUPPORTED_SCHEME = "unsupported_scheme",
  FACILITATOR_VERIFY_REJECTED = "facilitator_verify_rejected",
  FACILITATOR_SETTLE_FAILED = "facilitator_settle_failed",
  RECEIPT_VERIFICATION_FAILED = "receipt_verification_failed",
  INTERNAL_ERROR = "internal_error",
}