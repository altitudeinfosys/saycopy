import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  type AudioRecordingController,
  type AudioRecordingState,
  MAX_RECORDING_DURATION_LABEL,
  MAX_RECORDING_DURATION_MS,
  useExpoAudioRecordingController,
} from '../audio/audioRecorder';
import LanguageSelect from '../components/LanguageSelect';
import RecordingPanel from '../components/RecordingPanel';
import ResultCard from '../components/ResultCard';
import { createResultActions, type ResultActions } from '../components/ActionBar';
import type { HistoryItem, Tag } from '../domain/history';
import { LANGUAGE_OPTIONS, type LanguageId } from '../domain/languages';
import { DEFAULT_TRANSCRIPTION_MODEL_ID, type ModelPresetId } from '../domain/modelPresets';
import type { TranscriptionFlowResult } from '../flows/transcriptionFlow';
import {
  isStaleOpenRouterOperationError,
  type RecordFlowProcessors,
} from '../runtime/appDependencies';
import { DEFAULT_APP_SETTINGS, type SettingsRepository } from '../storage/settingsRepository';
import type { HistoryRepository } from '../storage/sqlite/historyRepository';

type RecordScreenProps = {
  readonly historyRepository?: HistoryRepository;
  readonly recordFlowProcessors?: RecordFlowProcessors;
  readonly recordingController?: AudioRecordingController;
  readonly resultActions?: ResultActions;
  readonly settingsRepository?: SettingsRepository;
};

type RecordScreenContentProps = Omit<RecordScreenProps, 'recordingController'> & {
  readonly recordingController: AudioRecordingController;
};

type SettingsLoadStatus = 'loading' | 'ready' | 'failed';

const SETTINGS_LOAD_FAILURE_MESSAGE = 'Could not load default settings.';
const SOURCE_LANGUAGE_SAVE_FAILURE_MESSAGE = 'Could not save recording language.';

function getLanguageLabel(languageId: LanguageId) {
  return LANGUAGE_OPTIONS.find((language) => language.id === languageId)?.label ?? 'Selected language';
}

function getRecorderFailureMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (isMessageBearingObject(error)) {
    return error.message;
  }

  return 'Recording failed. Try again.';
}

function isRecordButtonBusy(state: AudioRecordingState) {
  return (
    state.status === 'requesting_permission' ||
    state.status === 'stopping' ||
    state.status === 'processing'
  );
}

function isRecordButtonActive(state: AudioRecordingState) {
  return state.status === 'recording' || state.status === 'stopping';
}

function isMessageBearingObject(value: unknown): value is { readonly message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

export default function RecordScreen(props: RecordScreenProps = {}) {
  if (props.recordingController) {
    return <RecordScreenContent {...props} recordingController={props.recordingController} />;
  }

  return <RecordScreenWithDefaultController {...props} />;
}

function RecordScreenWithDefaultController(
  props: Omit<RecordScreenProps, 'recordingController'>,
) {
  const recordingController = useExpoAudioRecordingController();

  return <RecordScreenContent {...props} recordingController={recordingController} />;
}

function RecordScreenContent({
  historyRepository,
  recordFlowProcessors,
  recordingController,
  resultActions,
  settingsRepository,
}: RecordScreenContentProps) {
  const [sourceLanguageId, setSourceLanguageId] = useState<LanguageId>(
    DEFAULT_APP_SETTINGS.sourceLanguageId,
  );
  const [modelPresetId, setModelPresetId] = useState<ModelPresetId>(
    DEFAULT_APP_SETTINGS.modelPresetId,
  );
  const [customModelId, setCustomModelId] = useState(DEFAULT_APP_SETTINGS.customModelId);
  const [transcriptionModelId, setTranscriptionModelId] = useState(
    DEFAULT_APP_SETTINGS.transcriptionModelId,
  );
  const [cleanupEnabled, setCleanupEnabled] = useState(DEFAULT_APP_SETTINGS.cleanupEnabled);
  const [areRecordingOptionsExpanded, setAreRecordingOptionsExpanded] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [resultText, setResultText] = useState('');
  const [currentHistoryItemId, setCurrentHistoryItemId] = useState<string | null>(null);
  const [currentResultTags, setCurrentResultTags] = useState<Tag[]>([]);
  const [flowErrorText, setFlowErrorText] = useState('');
  const [savedHistoryCount, setSavedHistoryCount] = useState(0);
  const [settingsLoadStatus, setSettingsLoadStatus] = useState<SettingsLoadStatus>(
    settingsRepository ? 'loading' : 'ready',
  );
  const autoProcessedAudioUriRef = useRef<string | null>(null);
  const currentHistoryItemIdRef = useRef<string | null>(null);
  const operationGenerationRef = useRef(0);
  const sourceLanguageSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const sourceLanguageSaveRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const [defaultResultActions] = useState(createResultActions);
  const activeRecordingController = recordingController;
  const activeResultActions = resultActions ?? defaultResultActions;
  const recordingState = useSyncExternalStore(
    activeRecordingController.subscribe,
    activeRecordingController.getState,
    activeRecordingController.getState,
  );

  const hasSavedResult = currentHistoryItemId !== null;
  const hasResult = resultText.length > 0 || hasSavedResult;
  const sourceLanguageLabel = useMemo(
    () => getLanguageLabel(sourceLanguageId),
    [sourceLanguageId],
  );
  const isAutoDetectActive = sourceLanguageId === 'auto';
  const languageOptionsTitle = 'Recording language';
  const languageOptionsSummary = `Source: ${sourceLanguageLabel}`;
  const languageOptionsToggleLabel = areRecordingOptionsExpanded
    ? 'Hide language options'
    : 'Show language options';
  const areSettingsReady = settingsLoadStatus === 'ready';
  const areSettingsLoading = settingsLoadStatus === 'loading';
  const didSettingsLoadFail = settingsLoadStatus === 'failed';
  const isRecording = isRecordButtonActive(recordingState);
  const isRecorderBusy = isRecordButtonBusy(recordingState);
  const recordingBusyLabel =
    areSettingsLoading
      ? 'Loading settings'
      : didSettingsLoadFail
        ? 'Settings unavailable'
        : recordingState.status === 'requesting_permission'
          ? 'Preparing recorder'
          : recordingState.status === 'stopping'
            ? 'Stopping recording'
            : recordingState.status === 'processing'
              ? 'Creating result'
              : undefined;
  const recorderCue =
    recordingState.status === 'requesting_permission'
      ? 'Requesting microphone permission'
      : recordingState.status === 'processing'
        ? 'Creating result'
        : recordingState.status === 'failed'
          ? isStaleOpenRouterOperationError(recordingState.error)
            ? ''
            : getRecorderFailureMessage(recordingState.error)
          : '';
  const processingMessage =
    recordingState.status === 'processing' ? 'Transcribing your recording' : '';
  const visibleFlowErrorText = didSettingsLoadFail
    ? SETTINGS_LOAD_FAILURE_MESSAGE
    : flowErrorText;
  const shouldUseCompactRecorder = hasResult && !isRecording && !isRecorderBusy;
  const visibleRecordingElapsedMs =
    recordingState.status === 'recording' ? recordingElapsedMs : 0;

  useEffect(() => {
    let isActive = true;

    async function loadDefaultSettings() {
      if (!settingsRepository) {
        setSettingsLoadStatus('ready');
        return;
      }

      setSettingsLoadStatus('loading');

      try {
        const loadedSettings = await settingsRepository.getSettings();
        if (!isActive) {
          return;
        }

        setSourceLanguageId(loadedSettings.sourceLanguageId);
        setModelPresetId(loadedSettings.modelPresetId);
        setCustomModelId(loadedSettings.customModelId);
        setTranscriptionModelId(loadedSettings.transcriptionModelId);
        setCleanupEnabled(loadedSettings.cleanupEnabled);
        setAreRecordingOptionsExpanded(false);
        setSettingsLoadStatus('ready');
      } catch {
        if (isActive) {
          setSettingsLoadStatus('failed');
          setFlowErrorText(SETTINGS_LOAD_FAILURE_MESSAGE);
        }
      }
    }

    void loadDefaultSettings();

    return () => {
      isActive = false;
    };
  }, [settingsRepository]);

  const invalidateOpenRouterOperations = useCallback(() => {
    operationGenerationRef.current += 1;
  }, []);

  const startOpenRouterOperation = useCallback(() => {
    operationGenerationRef.current += 1;

    return operationGenerationRef.current;
  }, []);

  const isOpenRouterOperationCurrent = useCallback((operationGeneration: number) => {
    return operationGenerationRef.current === operationGeneration;
  }, []);

  const setVisibleHistoryItemId = useCallback((historyItemId: string | null) => {
    currentHistoryItemIdRef.current = historyItemId;
    setCurrentHistoryItemId(historyItemId);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      invalidateOpenRouterOperations();
      void activeRecordingController.cancel();
    };
  }, [activeRecordingController, invalidateOpenRouterOperations]);

  const saveResult = useCallback(
    (nextResultText: string, historyItem?: HistoryItem) => {
      setResultText(nextResultText);
      setVisibleHistoryItemId(historyItem?.id ?? null);
      setCurrentResultTags([...(historyItem?.tags ?? [])]);
      setFlowErrorText('');
      setSavedHistoryCount((currentCount) => currentCount + 1);
      setAreRecordingOptionsExpanded(false);
    },
    [setVisibleHistoryItemId],
  );

  const applyTranscriptionResult = useCallback(
    (result: TranscriptionFlowResult) => {
      saveResult(result.transcript, result.historyItem);

      if (result.status === 'cleanup_failed') {
        setFlowErrorText(result.notice.message);
      }
    },
    [saveResult],
  );

  const handleAddResultTag = useCallback(
    async (tagName: string) => {
      const historyItemId = currentHistoryItemId;

      if (!historyRepository || !historyItemId) {
        throw new Error('Tags are unavailable for this result.');
      }

      let tag: Tag;
      try {
        tag = await historyRepository.assignTag(historyItemId, tagName);
      } catch (error) {
        if (currentHistoryItemIdRef.current !== historyItemId) {
          return null;
        }

        throw error;
      }

      if (currentHistoryItemIdRef.current !== historyItemId) {
        return null;
      }

      const normalizedLabel = tag.label.trim().toLowerCase();
      setCurrentResultTags((currentTags) => {
        if (
          !normalizedLabel ||
          currentTags.some((currentTag) => currentTag.label.trim().toLowerCase() === normalizedLabel)
        ) {
          return currentTags;
        }

        return [...currentTags, tag];
      });

      return tag;
    },
    [currentHistoryItemId, historyRepository],
  );

  const processStoppedRecording = useCallback(async () => {
    if (!areSettingsReady) {
      if (didSettingsLoadFail) {
        setFlowErrorText(SETTINGS_LOAD_FAILURE_MESSAGE);
      }
      return;
    }

    const operationGeneration = startOpenRouterOperation();
    const isCurrent = () => isOpenRouterOperationCurrent(operationGeneration);

    try {
      await activeRecordingController.processStoppedAudio(async (audio) => {
        if (!recordFlowProcessors) {
          throw new Error('OpenRouter processing is not configured.');
        }

        const result = await recordFlowProcessors.runTranscription(
          {
            audio,
            sourceLanguageId,
            modelPresetId,
            customModelId,
            cleanupEnabled,
            ...(transcriptionModelId === DEFAULT_TRANSCRIPTION_MODEL_ID
              ? {}
              : { transcriptionModelId }),
          },
          { isCurrent },
        );

        if (isCurrent()) {
          applyTranscriptionResult(result);
        }
      });
    } catch (error) {
      if (isStaleOpenRouterOperationError(error) || !isCurrent()) {
        return;
      }
      // Failure details are surfaced through recorder state.
    }
  }, [
    activeRecordingController,
    areSettingsReady,
    applyTranscriptionResult,
    cleanupEnabled,
    customModelId,
    didSettingsLoadFail,
    isOpenRouterOperationCurrent,
    modelPresetId,
    recordFlowProcessors,
    sourceLanguageId,
    startOpenRouterOperation,
    transcriptionModelId,
  ]);

  useEffect(() => {
    if (recordingState.status === 'recording') {
      autoProcessedAudioUriRef.current = null;
    }
  }, [recordingState.status]);

  useEffect(() => {
    if (recordingState.status !== 'recording') {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setRecordingElapsedMs((currentElapsedMs) =>
        Math.min(currentElapsedMs + 1000, MAX_RECORDING_DURATION_MS),
      );
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [recordingState.status]);

  useEffect(() => {
    if (
      recordingState.status !== 'stopped' ||
      recordingState.stopReason !== 'max_duration' ||
      !recordingState.audio
    ) {
      return;
    }

    const audioUri = recordingState.audio.uri ?? null;
    if (autoProcessedAudioUriRef.current === audioUri) {
      return;
    }

    autoProcessedAudioUriRef.current = audioUri;
    void processStoppedRecording();
  }, [processStoppedRecording, recordingState]);

  async function handleRecordPress() {
    if (!areSettingsReady) {
      if (didSettingsLoadFail) {
        setFlowErrorText(SETTINGS_LOAD_FAILURE_MESSAGE);
      }
      return;
    }

    if (isRecorderBusy) {
      return;
    }

    if (!isRecording) {
      try {
        invalidateOpenRouterOperations();
        setRecordingElapsedMs(0);
        setFlowErrorText('');
        await activeRecordingController.start();
      } catch {
        // Failure details are surfaced through recorder state.
      }
      return;
    }

    try {
      await activeRecordingController.stop();
      await processStoppedRecording();
    } catch {
      // Failure details are surfaced through recorder state.
    }
  }

  async function handleCancelRecording() {
    if (recordingState.status !== 'recording') {
      return;
    }

    invalidateOpenRouterOperations();
    autoProcessedAudioUriRef.current = null;
    setFlowErrorText('');

    try {
      await activeRecordingController.cancel();
      setRecordingElapsedMs(0);
    } catch {
      // Failure details are surfaced through recorder state.
    }
  }

  const handleResultTextChange = useCallback(
    (nextText: string) => {
      setResultText(nextText);

      const historyItemId = currentHistoryItemIdRef.current;
      if (!historyRepository || !historyItemId) {
        return;
      }

      void (async () => {
        try {
          await historyRepository.updateHistoryText(historyItemId, { primaryText: nextText });
        } catch {
          if (currentHistoryItemIdRef.current === historyItemId) {
            setFlowErrorText('Could not update saved history.');
          }
        }
      })();
    },
    [historyRepository],
  );

  function handleSourceLanguageChange(languageId: LanguageId) {
    setSourceLanguageId(languageId);
    setFlowErrorText((currentErrorText) =>
      currentErrorText === SOURCE_LANGUAGE_SAVE_FAILURE_MESSAGE ? '' : currentErrorText,
    );

    if (!settingsRepository) {
      return;
    }

    sourceLanguageSaveRequestIdRef.current += 1;
    const requestId = sourceLanguageSaveRequestIdRef.current;
    sourceLanguageSaveChainRef.current = sourceLanguageSaveChainRef.current.then(async () => {
      try {
        await settingsRepository.saveSettings({ sourceLanguageId: languageId });
      } catch {
        if (isMountedRef.current && sourceLanguageSaveRequestIdRef.current === requestId) {
          setFlowErrorText(SOURCE_LANGUAGE_SAVE_FAILURE_MESSAGE);
        }
      }
    });
  }

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.content}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
    >
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.screenTitle}>Record</Text>
          <Text style={styles.screenStatus}>Transcribe</Text>
        </View>
        <View style={styles.cleanupPill}>
          <Text style={styles.cleanupText}>
            {cleanupEnabled ? 'Light cleanup on' : 'Light cleanup off'}
          </Text>
        </View>
      </View>

      <View style={styles.optionsCard}>
        <Pressable
          accessibilityLabel={languageOptionsToggleLabel}
          accessibilityRole="button"
          accessibilityState={{ expanded: areRecordingOptionsExpanded }}
          onPress={() => setAreRecordingOptionsExpanded((isExpanded) => !isExpanded)}
          style={styles.optionsToggle}
        >
          <View style={styles.optionsToggleText}>
            <Text style={styles.optionsTitle}>{languageOptionsTitle}</Text>
            <Text style={styles.optionsSummary}>{languageOptionsSummary}</Text>
          </View>
          <Text style={styles.optionsAction}>
            {areRecordingOptionsExpanded ? 'Hide' : 'Show'}
          </Text>
        </Pressable>

        {areRecordingOptionsExpanded ? (
          <View style={styles.optionsBody}>
            <LanguageSelect
              includeAuto
              label="Source language"
              onChange={handleSourceLanguageChange}
              value={sourceLanguageId}
            />
            {isAutoDetectActive ? (
              <Text style={styles.autoDetectNote}>
                Auto-detect uses GPT-4o Transcribe to preserve the detected language. Select a
                language to use {transcriptionModelId} instead.
              </Text>
            ) : null}

          </View>
        ) : null}
      </View>

      {shouldUseCompactRecorder ? (
        <View style={styles.compactRecorder}>
          <View style={styles.compactRecorderText}>
            <Text style={styles.compactRecorderTitle}>Ready for another recording</Text>
            <Text style={styles.compactRecorderMeta}>{MAX_RECORDING_DURATION_LABEL}</Text>
          </View>
          <Pressable
            accessibilityLabel="Tap to record"
            accessibilityRole="button"
            accessibilityState={{ disabled: !areSettingsReady }}
            disabled={!areSettingsReady}
            onPress={() => void handleRecordPress()}
            style={[styles.compactRecordButton, !areSettingsReady && styles.compactRecordButtonDisabled]}
          >
            <Text style={styles.compactRecordButtonText}>Record again</Text>
            <Text style={styles.compactRecordButtonSubtext}>Tap to record</Text>
          </Pressable>
        </View>
      ) : (
        <RecordingPanel
          busyLabel={recordingBusyLabel}
          elapsedMs={visibleRecordingElapsedMs}
          isDisabled={isRecorderBusy || !areSettingsReady}
          isRecording={isRecording}
          onCancelPress={() => void handleCancelRecording()}
          onRecordPress={handleRecordPress}
        />
      )}

      {areSettingsLoading ? (
        <Text accessibilityLiveRegion="polite" style={styles.settingsLoadText}>
          Loading default settings
        </Text>
      ) : null}

      {processingMessage ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityLabel={processingMessage}
          style={styles.processingStatus}
          testID="processing-status"
        >
          <ActivityIndicator color="#2563EB" size="small" />
          <Text style={styles.processingStatusText}>{processingMessage}</Text>
        </View>
      ) : null}

      {recorderCue ? (
        <Text
          accessibilityLiveRegion={recordingState.status === 'failed' ? 'assertive' : 'polite'}
          accessibilityRole={recordingState.status === 'failed' ? 'alert' : 'text'}
          style={[
            styles.recorderCue,
            recordingState.status === 'failed' ? styles.recorderCueError : null,
          ]}
        >
          {recorderCue}
        </Text>
      ) : null}

      {visibleFlowErrorText ? (
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={styles.flowErrorText}
        >
          {visibleFlowErrorText}
        </Text>
      ) : null}

      {savedHistoryCount > 0 ? (
        <View style={styles.savedRow}>
          <Text accessibilityLiveRegion="polite" style={styles.savedLabel}>
            Saved to history
          </Text>
          <Text style={styles.savedMeta}>
            {savedHistoryCount} {savedHistoryCount === 1 ? 'item' : 'items'} in this session
          </Text>
        </View>
      ) : null}

      {hasResult ? (
        <ResultCard
          actions={activeResultActions}
          canAddTag={Boolean(historyRepository && currentHistoryItemId)}
          key={currentHistoryItemId ?? 'unsaved-result'}
          mode="transcribe"
          onAddTag={handleAddResultTag}
          onChangeText={handleResultTextChange}
          tags={currentResultTags}
          value={resultText}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  content: {
    gap: 18,
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  titleGroup: {
    flexShrink: 1,
  },
  screenTitle: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '800',
  },
  screenStatus: {
    color: '#64748B',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  cleanupPill: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 1,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cleanupText: {
    color: '#047857',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  optionsCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  optionsToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionsToggleText: {
    flex: 1,
    gap: 2,
  },
  optionsTitle: {
    color: '#111827',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  optionsSummary: {
    color: '#64748B',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  optionsAction: {
    color: '#2563EB',
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '800',
  },
  optionsBody: {
    borderColor: '#E2E8F0',
    borderTopWidth: 1,
    gap: 16,
    padding: 14,
  },
  autoDetectNote: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1E40AF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    padding: 10,
  },
  compactRecorder: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#BBF7D0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14,
  },
  compactRecorderText: {
    flex: 1,
    gap: 3,
    minWidth: 170,
  },
  compactRecorderTitle: {
    color: '#111827',
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  compactRecorderMeta: {
    color: '#64748B',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  compactRecordButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    minHeight: 46,
    minWidth: 128,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  compactRecordButtonDisabled: {
    backgroundColor: '#64748B',
  },
  compactRecordButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  compactRecordButtonSubtext: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  processingStatus: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  processingStatusText: {
    color: '#1D4ED8',
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  savedRow: {
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    padding: 12,
  },
  savedLabel: {
    color: '#166534',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  savedMeta: {
    color: '#15803D',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  recorderCue: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    marginTop: -8,
  },
  recorderCueError: {
    color: '#B91C1C',
  },
  flowErrorText: {
    color: '#B91C1C',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    marginTop: -8,
  },
  settingsLoadText: {
    color: '#64748B',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    marginTop: -8,
  },
});
