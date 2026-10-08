import * as Sentry from '@sentry/react-native';
import type { ErrorEvent, StackFrame } from '@sentry/core';

import { configureErrorReporting } from './errorReporting';

const SAFE_TAGS = new Set(['operation', 'category', 'provider', 'retryable', 'httpStatus']);

/** Reconstruct rather than redact: newly added SDK fields cannot leak content. */
export function scrubErrorEvent(event: ErrorEvent): ErrorEvent {
  const tags = Object.fromEntries(Object.entries(event.tags ?? {}).filter(([key, value]) =>
    SAFE_TAGS.has(key) && /^(?:[A-Za-z0-9_.-]{1,100})$/.test(String(value)),
  ).map(([key, value]) => [key, String(value)]));
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    release: event.release,
    dist: event.dist,
    environment: event.environment,
    level: event.level ?? 'error',
    tags,
    debug_meta: {
      images: event.debug_meta?.images?.flatMap((image) =>
        image.type === 'sourcemap' && /^[a-fA-F0-9-]{32,36}$/.test(image.debug_id)
          ? [{ type: 'sourcemap' as const, debug_id: image.debug_id,
            code_file: scrubFrame({ filename: image.code_file }).filename ?? 'index.bundle' }]
          : [],
      ),
    },
    exception: {
      values: (event.exception?.values ?? [{}]).map((exception) => ({
        type: 'ApplicationError',
        value: tags.operation
          ? `${tags.operation} failed (${tags.category ?? 'unknown'}).`
          : 'Unhandled application error.',
        mechanism: exception.mechanism ? {
          type: exception.mechanism.type,
          handled: exception.mechanism.handled,
        } : undefined,
        stacktrace: exception.stacktrace ? {
          frames: exception.stacktrace.frames?.map(scrubFrame),
        } : undefined,
      })),
    },
  };
}

function scrubFrame(frame: StackFrame): StackFrame {
  // Preserve bundle locations for source maps, excluding query strings and local paths.
  const filename = frame.filename?.split(/[?#]/)[0].split('/').pop();
  return {
    filename: filename && /^[A-Za-z0-9_.-]+$/.test(filename) ? filename : undefined,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
  };
}

export function initializeSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // Local development can run without a DSN; EAS builds require it.
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_APP_ENVIRONMENT ?? 'development',
    sendDefaultPii: false,
    sampleRate: 1,
    tracesSampleRate: 0,
    tracePropagationTargets: [],
    enableLogs: false,
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: false,
    enableAutoPerformanceTracing: false,
    enableCaptureFailedRequests: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: scrubErrorEvent,
    beforeSendTransaction: () => null,
    integrations: (defaults) => defaults.filter((integration) =>
      !['Breadcrumbs', 'HttpClient', 'UserInteraction', 'MobileReplay', 'Dedupe'].includes(integration.name),
    ),
  });
  configureErrorReporting((error, diagnostics) => {
    Sentry.captureException(error, { tags: { ...diagnostics } });
  });
}
