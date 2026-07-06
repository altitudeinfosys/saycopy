import * as SecureStore from 'expo-secure-store';

import {
  createDemoHistoryRepository,
  createDemoSettingsRepository,
} from '../storage/demoAppRepositories';
import type { SettingsRepository } from '../storage/settingsRepository';
import {
  createSecureTokenStore,
  type SecureStoreLike,
  type SecureTokenStore,
} from '../storage/secureTokenStore';
import type { HistoryRepository } from '../storage/sqlite/historyRepository';
import { runTranscriptionFlow, type RunTranscriptionFlowInput } from '../flows/transcriptionFlow';
import { runTranslationFlow, type RunTranslationFlowInput } from '../flows/translationFlow';
import type {
  FlowHistoryRepository,
  TemporaryAudioCleanup,
  TranscriptionProvider,
  TranslationProvider,
} from '../flows/types';
import { createOpenRouterClient, type OpenRouterFetch } from '../providers/openRouter/client';
import { createOpenRouterProvider } from '../providers/openRouter/provider';

export type RecordFlowProcessors = {
  readonly runTranscription: ReturnType<typeof createTranscriptionProcessor>;
  readonly runTranslation: ReturnType<typeof createTranslationProcessor>;
};

export type RecordFlowRunOptions = {
  readonly isCurrent?: () => boolean;
};

export type AppDependencies = {
  readonly historyRepository: HistoryRepository;
  readonly settingsRepository: SettingsRepository;
  readonly tokenStore: SecureTokenStore;
  readonly recordFlowProcessors: RecordFlowProcessors;
};

export type CreateAppDependenciesOptions = {
  readonly fetch?: OpenRouterFetch;
  readonly historyRepository?: HistoryRepository;
  readonly secureStore?: SecureStoreLike;
  readonly settingsRepository?: SettingsRepository;
  readonly temporaryAudio?: TemporaryAudioCleanup;
};

type OpenRouterProviderDependencies = TranscriptionProvider & TranslationProvider;

export class StaleOpenRouterOperationError extends Error {
  readonly code = 'stale_openrouter_operation';

  constructor() {
    super('OpenRouter operation was cancelled.');
    this.name = 'StaleOpenRouterOperationError';
  }
}

export function isStaleOpenRouterOperationError(
  error: unknown,
): error is StaleOpenRouterOperationError {
  return error instanceof StaleOpenRouterOperationError;
}

export function createAppDependencies({
  fetch = createGlobalOpenRouterFetch(),
  historyRepository = createDemoHistoryRepository(),
  secureStore = SecureStore,
  settingsRepository = createDemoSettingsRepository(),
  temporaryAudio,
}: CreateAppDependenciesOptions = {}): AppDependencies {
  const tokenStore = createSecureTokenStore(secureStore);
  const openRouterClient = createOpenRouterClient({
    fetch,
    getToken: tokenStore.getToken,
  });
  const provider = createOpenRouterProvider({ client: openRouterClient });

  return {
    historyRepository,
    settingsRepository,
    tokenStore,
    recordFlowProcessors: createRecordFlowProcessors({
      historyRepository,
      provider,
      temporaryAudio,
    }),
  };
}

export function createRecordFlowProcessors({
  historyRepository,
  provider,
  temporaryAudio,
}: {
  readonly historyRepository: HistoryRepository;
  readonly provider: OpenRouterProviderDependencies;
  readonly temporaryAudio?: TemporaryAudioCleanup;
}): RecordFlowProcessors {
  return {
    runTranscription: createTranscriptionProcessor({
      historyRepository,
      provider,
      temporaryAudio,
    }),
    runTranslation: createTranslationProcessor({
      historyRepository,
      provider,
      temporaryAudio,
    }),
  };
}

function createTranscriptionProcessor({
  historyRepository,
  provider,
  temporaryAudio,
}: {
  readonly historyRepository: HistoryRepository;
  readonly provider: TranscriptionProvider;
  readonly temporaryAudio?: TemporaryAudioCleanup;
}) {
  return (input: RunTranscriptionFlowInput, options: RecordFlowRunOptions = {}) =>
    runTranscriptionFlow(
      {
        historyRepository: createGuardedHistoryRepository(historyRepository, options),
        provider,
        temporaryAudio,
      },
      input,
    );
}

function createTranslationProcessor({
  historyRepository,
  provider,
  temporaryAudio,
}: {
  readonly historyRepository: HistoryRepository;
  readonly provider: TranslationProvider;
  readonly temporaryAudio?: TemporaryAudioCleanup;
}) {
  return (input: RunTranslationFlowInput, options: RecordFlowRunOptions = {}) =>
    runTranslationFlow(
      {
        historyRepository: createGuardedHistoryRepository(historyRepository, options),
        provider,
        temporaryAudio,
      },
      input,
    );
}

function createGuardedHistoryRepository(
  historyRepository: HistoryRepository,
  options: RecordFlowRunOptions,
): FlowHistoryRepository {
  return {
    async createHistoryItem(input) {
      assertCurrentOperation(options);

      return historyRepository.createHistoryItem(input);
    },
  };
}

function assertCurrentOperation(options: RecordFlowRunOptions): void {
  if (options.isCurrent && !options.isCurrent()) {
    throw new StaleOpenRouterOperationError();
  }
}

function createGlobalOpenRouterFetch(): OpenRouterFetch {
  return async (url, init) =>
    fetch(url, {
      body: init.body,
      headers: { ...init.headers },
      method: init.method,
      signal: init.signal,
    });
}
