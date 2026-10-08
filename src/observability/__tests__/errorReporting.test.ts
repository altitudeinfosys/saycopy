import * as Sentry from '@sentry/react-native';
import { createAppError } from '../../domain/errors';
import { configureErrorReporting, reportError } from '../errorReporting';
import { initializeSentry, scrubErrorEvent } from '../sentry';
import { runTranscriptionFlow } from '../../flows/transcriptionFlow';
import { createTemporaryAudioFileCleanup } from '../../audio/fileCleanup';
import { createSpeechPlayer } from '../../speech/speechPlayer';

afterEach(() => {
  configureErrorReporting(undefined);
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  jest.clearAllMocks();
});

it('reports safe HTTP diagnostics once, excluding the original message and payload', () => {
  const capture = jest.fn();
  configureErrorReporting(capture);
  const error = createAppError('unknown', 'private transcript sk-or-v1-secret', {
    provider: 'openrouter', cause: { httpStatus: 400, payload: 'BASE64_PRIVATE_AUDIO' },
  });
  reportError(error, 'openRouter.transcribe');
  reportError(error, 'RecordScreen.process');
  expect(capture).toHaveBeenCalledTimes(1);
  const [safeError, diagnostics] = capture.mock.calls[0];
  expect(safeError.message).toBe('openRouter.transcribe failed (unknown).');
  expect(diagnostics).toEqual({ operation: 'openRouter.transcribe', category: 'unknown',
    provider: 'openrouter', httpStatus: 400 });
  expect(JSON.stringify(diagnostics)).not.toMatch(/private|secret|BASE64/);
});

it('records distinct failures and never lets a broken reporting sink interrupt recovery', () => {
  const capture = jest.fn(() => { throw new Error('reporter unavailable'); });
  configureErrorReporting(capture);
  expect(() => reportError(new Error('private text'), 'storage.save')).not.toThrow();
  expect(() => reportError(new Error('private text'), 'storage.save')).not.toThrow();
  expect(capture).toHaveBeenCalledTimes(2);
});

it('does not treat expected cancellation as an error', () => {
  const capture = jest.fn(); configureErrorReporting(capture);
  const error = new Error('cancelled'); error.name = 'StaleOpenRouterOperationError';
  reportError(error, 'translation.run');
  expect(capture).not.toHaveBeenCalled();
});

it('scrubs automatic errors, props, contexts, breadcrumbs, frame locals, and user details', () => {
  const secret = 'PRIVATE_CONTENT_API_KEY';
  const result = scrubErrorEvent({ type: undefined, event_id: 'test', release: 'saycopy@1.1.1',
    dist: '12', message: secret, user: { email: secret }, extra: { props: secret },
    contexts: { response: { text: secret } }, request: { headers: { Authorization: secret } },
    breadcrumbs: [{ message: secret }], tags: { transcript: secret },
    exception: { values: [{ value: secret, stacktrace: { frames: [{
      filename: 'file:///private/user/index.bundle?token='+secret, function: secret,
      vars: { audio: secret }, context_line: secret, lineno: 42, colno: 9,
    }] } }] },
    debug_meta: { images: [{ type: 'sourcemap', code_file: 'file:///private/index.bundle',
      debug_id: '12345678-1234-1234-1234-123456789012' }] },
  });
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(result.exception?.values?.[0].stacktrace?.frames?.[0]).toEqual({
    filename: 'index.bundle', lineno: 42, colno: 9, in_app: undefined,
  });
  expect(result.debug_meta?.images?.[0]).toMatchObject({ code_file: 'index.bundle' });
  expect(result.release).toBe('saycopy@1.1.1'); expect(result.dist).toBe('12');
});

it('configures unsampled error reporting, disabled content capture, and the SDK sink', () => {
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
  initializeSentry();
  expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ sampleRate: 1,
    sendDefaultPii: false, maxBreadcrumbs: 0, tracesSampleRate: 0,
    attachScreenshot: false, attachViewHierarchy: false, beforeSend: scrubErrorEvent }));
  reportError(new Error('private original'), 'storage.save');
  expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
    tags: { operation: 'storage.save', category: 'unknown' },
  });
});

it('reports Light cleanup failure while saving the original transcript', async () => {
  const capture = jest.fn(); configureErrorReporting(capture);
  const createHistoryItem = jest.fn(async (input) => ({ id: 'history', ...input }));
  const result = await runTranscriptionFlow({
    provider: { transcribeAudio: async () => ({ text: 'private transcript' }),
      cleanupTranscript: async () => { throw new Error('private provider response'); } },
    historyRepository: { createHistoryItem },
  }, { audio: { base64Audio: 'private audio', format: 'm4a' }, sourceLanguageId: 'auto',
    modelPresetId: 'balanced', cleanupEnabled: true });
  expect(result.status).toBe('cleanup_failed');
  expect(createHistoryItem).toHaveBeenCalledWith(expect.objectContaining({ primaryText: 'private transcript' }));
  expect(capture).toHaveBeenCalledTimes(1);
  expect(capture.mock.calls[0][0].message).not.toContain('private');
});

it('reports best-effort temporary deletion failure without throwing or including the file path', async () => {
  const capture = jest.fn(); configureErrorReporting(capture);
  const cleanup = createTemporaryAudioFileCleanup({ deleter: {
    deleteAsync: () => { throw new Error('private path'); },
  } });
  await expect(cleanup.cleanup({ uri: 'file:///private/recording.m4a' })).resolves.toBeUndefined();
  expect(capture).toHaveBeenCalledTimes(1);
  expect(capture.mock.calls[0][0].message).not.toContain('private');
});

it('reports asynchronous system speech failures', async () => {
  const capture = jest.fn(); configureErrorReporting(capture);
  const speak = jest.fn();
  await createSpeechPlayer({ stop: async () => undefined, getAvailableVoicesAsync: async () => [],
    speak }).speak('private translation', 'spanish');
  speak.mock.calls[0][1].onError(new Error('private speech failure'));
  expect(capture).toHaveBeenCalledTimes(1);
  expect(capture.mock.calls[0][0].message).toBe('speechPlayer.speak failed (unknown).');
});
