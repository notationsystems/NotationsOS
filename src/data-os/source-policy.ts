import type {
  RetentionPolicy,
  SourceRegistration,
  SourceUseDecision,
  SourceUseRequest,
} from './contracts';
import { parseISOInstant as instant, requireIdentifier, requireRecord, requireText } from './validation';

const OPERATIONS = new Set(['DERIVE', 'EXPORT', 'INDEX', 'INGEST', 'MODEL_TRAINING', 'PUBLISH', 'RETRIEVE']);
const AUDIENCES = new Set(['CUSTOMER', 'INTERNAL', 'PUBLIC', 'TENANT']);

function sortedUnique(values: readonly string[], field: string, allowEmpty = false): string[] {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0) || new Set(values).size !== values.length) {
    throw new Error(`${field} must contain unique, non-empty values.`);
  }
  for (const value of values) requireText(value, field);
  return [...values].sort();
}

function validateRetention(retention: RetentionPolicy, effectiveUntil?: string): void {
  requireRecord(retention, 'retention');
  if (!['INDEFINITE', 'UNTIL_SOURCE_EXPIRY', 'UNTIL'].includes(retention.mode)) {
    throw new Error('retention.mode is unsupported.');
  }
  if (retention.mode === 'UNTIL') {
    if (!retention.until) throw new Error('UNTIL retention requires retention.until.');
    const until = instant(retention.until, 'retention.until');
    if (effectiveUntil && until > instant(effectiveUntil, 'effectiveUntil')) {
      throw new Error('Retention cannot extend beyond the source policy expiry.');
    }
  } else if (retention.until !== undefined) {
    throw new Error('retention.until is only valid for UNTIL retention.');
  }
}

export function validateSourceRegistration(registration: SourceRegistration): void {
  requireRecord(registration, 'sourceRegistration');
  for (const [field, value] of Object.entries({
    registrationId: registration.registrationId,
    sourceId: registration.sourceId,
    displayName: registration.displayName,
    sourceClass: registration.sourceClass,
    licenseId: registration.licenseId,
    policyVersion: registration.policyVersion,
  })) requireText(value, field);
  for (const field of ['registrationId', 'sourceId', 'licenseId', 'policyVersion'] as const) requireIdentifier(registration[field], field);

  const effectiveFrom = instant(registration.effectiveFrom, 'effectiveFrom');
  if (registration.effectiveUntil !== undefined && instant(registration.effectiveUntil, 'effectiveUntil') <= effectiveFrom) {
    throw new Error('effectiveUntil must be later than effectiveFrom.');
  }

  const allowedOperations = sortedUnique(registration.allowedOperations, 'allowedOperations', true);
  const approvalRequired = sortedUnique(registration.approvalRequiredOperations === undefined ? [] : registration.approvalRequiredOperations, 'approvalRequiredOperations', true);
  if (allowedOperations.some((operation) => !OPERATIONS.has(operation)) || approvalRequired.some((operation) => !OPERATIONS.has(operation))) {
    throw new Error('Source registration contains an unsupported operation.');
  }
  if (allowedOperations.some((operation) => approvalRequired.includes(operation))) {
    throw new Error('An operation cannot be both allowed and approval-required.');
  }
  if (allowedOperations.length === 0 && approvalRequired.length === 0) {
    throw new Error('A source policy must name at least one allowed or approval-required operation.');
  }

  const permittedPurposes = sortedUnique(registration.permittedPurposes, 'permittedPurposes');
  const prohibitedPurposes = sortedUnique(registration.prohibitedPurposes === undefined ? [] : registration.prohibitedPurposes, 'prohibitedPurposes', true);
  if (permittedPurposes.some((purpose) => prohibitedPurposes.includes(purpose))) {
    throw new Error('A purpose cannot be both permitted and prohibited.');
  }

  const audiences = sortedUnique(registration.allowedAudiences, 'allowedAudiences');
  if (audiences.some((audience) => !AUDIENCES.has(audience))) {
    throw new Error('Source registration contains an unsupported audience.');
  }
  validateRetention(registration.retention, registration.effectiveUntil);
}

function decision(registration: SourceRegistration, request: SourceUseRequest): Pick<SourceUseDecision, 'state' | 'reasons'> {
  const reasons: string[] = [];
  const requestedAt = instant(request.requestedAt, 'request.requestedAt');
  if (requestedAt < instant(registration.effectiveFrom, 'effectiveFrom') ||
      (registration.effectiveUntil !== undefined && requestedAt >= instant(registration.effectiveUntil, 'effectiveUntil'))) {
    reasons.push('OUTSIDE_EFFECTIVE_WINDOW');
  }
  if ((registration.prohibitedPurposes ?? []).includes(request.purpose)) reasons.push('PURPOSE_PROHIBITED');
  else if (!registration.permittedPurposes.includes(request.purpose)) reasons.push('PURPOSE_NOT_PERMITTED');
  if (!registration.allowedAudiences.includes(request.audience)) reasons.push('AUDIENCE_NOT_PERMITTED');

  const approvalRequired = (registration.approvalRequiredOperations ?? []).includes(request.operation);
  if (!approvalRequired && !registration.allowedOperations.includes(request.operation)) reasons.push('OPERATION_NOT_PERMITTED');

  if (reasons.length > 0) return { state: 'DENIED', reasons: reasons.sort() };
  return approvalRequired
    ? { state: 'APPROVAL_REQUIRED', reasons: ['EXPLICIT_APPROVAL_REQUIRED'] }
    : { state: 'ALLOWED', reasons: ['EXPLICIT_POLICY_GRANT'] };
}

/**
 * Evaluates one exact request. No permission is inherited from another
 * operation, purpose, audience, source registration, or time window.
 */
export function evaluateSourceUse(registration: SourceRegistration, request: SourceUseRequest): SourceUseDecision {
  validateSourceRegistration(registration);
  requireRecord(request, 'sourceUseRequest');
  if (request.registrationId !== registration.registrationId) {
    throw new Error('Source-use request must name the evaluated registration.');
  }
  requireIdentifier(request.requestId, 'request.requestId');
  requireText(request.purpose, 'request.purpose');
  if (!OPERATIONS.has(request.operation) || !AUDIENCES.has(request.audience)) {
    throw new Error('Source-use request contains an unsupported operation or audience.');
  }
  instant(request.requestedAt, 'request.requestedAt');

  const result = decision(registration, request);
  return {
    decisionId: `source-use:${request.requestId}`,
    requestId: request.requestId,
    registrationId: registration.registrationId,
    sourceId: registration.sourceId,
    request: {
      purpose: request.purpose,
      operation: request.operation,
      audience: request.audience,
      requestedAt: request.requestedAt,
    },
    state: result.state,
    reasons: result.reasons,
    evaluatedAt: request.requestedAt,
  };
}
