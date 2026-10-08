import { isAppError } from '../domain/errors';

export type ErrorDiagnostics = Readonly<Record<string, string | number | boolean>>;
export type ErrorSink = (error: Error, diagnostics: ErrorDiagnostics) => void;

let sink: ErrorSink | undefined;
let reported = new WeakSet<object>();

export function configureErrorReporting(nextSink: ErrorSink | undefined): void {
  sink = nextSink;
  reported = new WeakSet<object>();
}

/** Report fixed diagnostics only. Never pass original errors or user content to the SDK. */
export function reportError(error: unknown, operation: string): void {
  if (!sink || isExpectedCancellation(error)) return;
  if (typeof error === 'object' && error !== null && reported.has(error)) return;

  const category = isAppError(error) ? error.category : 'unknown';
  const diagnostics: Record<string, string | number | boolean> = {
    operation: /^[A-Za-z0-9_.-]{1,100}$/.test(operation) ? operation : 'application',
    category,
  };
  if (isAppError(error)) {
    if (error.provider === 'openrouter') diagnostics.provider = 'openrouter';
    if (typeof error.retryable === 'boolean') diagnostics.retryable = error.retryable;
    const cause = error.cause;
    if (typeof cause === 'object' && cause !== null && 'httpStatus' in cause &&
        typeof cause.httpStatus === 'number' && Number.isInteger(cause.httpStatus) &&
        cause.httpStatus >= 100 && cause.httpStatus <= 599) {
      diagnostics.httpStatus = cause.httpStatus;
    }
  }
  try {
    const safeError = new Error(`${diagnostics.operation} failed (${category}).`);
    sink(safeError, diagnostics);
    if (typeof error === 'object' && error !== null) reported.add(error);
  } catch {
    // Reporting must never interrupt recording/recovery or recursively report itself.
  }
}

function isExpectedCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === 'StaleOpenRouterOperationError';
}
