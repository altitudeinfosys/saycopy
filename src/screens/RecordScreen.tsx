import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  type AudioRecordingController,
  type AudioRecordingState,
  MAX_RECORDING_DURATION_MS,
  useExpoAudioRecordingController,
} from '../audio/audioRecorder';
import LanguageSelect from '../components/LanguageSelect';
import ModeSegmentedControl, { type RecordMode } from '../components/ModeSegmentedControl';
import RecordingPanel from '../components/RecordingPanel';
import ResultCard from '../components/ResultCard';
import { createResultActions, type ResultActions } from '../components/ActionBar';
import type { AppError } from '../domain/errors';
import type { HistoryItem, Tag } from '../domain/history';
import { LANGUAGE_OPTIONS, type ConcreteLanguageId, type LanguageId } from '../domain/languages';
import { DEFAULT_TRANSCRIPTION_MODEL_ID, type ModelPresetId } from '../domain/modelPresets';
import type { TranscriptionFlowResult } from '../flows/transcriptionFlow';
import type { TranslationFlowResult } from '../flows/translationFlow';
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

function getFlowFailureMessage(error: unknown) {
  if (isAppError(error) || isMessageBearingObject(error)) {
    return error.message;
  }

  return 'OpenRouter request failed. Try again.';
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

function isAppError(value: unknown): value is AppError {
  return (
    isMessageBearingObject(value) &&
    'category' in value &&
    typeof value.category === 'string'
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
  const [mode, setMode] = useState<RecordMode>(DEFAULT_APP_SETTINGS.defaultMode);
  const [sourceLanguageId, setSourceLanguageId] = useState<LanguageId>(
    DEFAULT_APP_SETTINGS.sourceLanguageId,
  );
  const [targetLanguageId, setTargetLanguageId] = useState<ConcreteLanguageId>(
    DEFAULT_APP_SETTINGS.targetLanguageId,
  );
  const [modelPresetId, setModelPresetId] = useState<ModelPresetId>(
    DEFAULT_APP_SETTINGS.modelPresetId,
  );
  const [customModelId, setCustomModelId] = useState(DEFAULT_APP_SETTINGS.customModelId);
  const [transcriptionModelId, setTranscriptionModelId] = useState(
    DEFAULT_APP_SETTINGS.transcriptionModelId,
  );
  const [cleanupEnabled, setCleanupEnabled] = useState(DEFAULT_APP_SETTINGS.cleanupEnabled);
  const [manualText, setManualText] = useState('');
  const [areRecordingOptionsExpanded, setAreRecordingOptionsExpanded] = useState(false);
  const [isManualTextExpanded, setIsManualTextExpanded] = useState(
    DEFAULT_APP_SETTINGS.defaultMode === 'translate',
  );
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [isManualTranslationPending, setIsManualTranslationPending] = useState(false);
  const [resultMode, setResultMode] = useState<RecordMode>('transcribe');
  const [resultText, setResultText] = useState('');
  const [originalText, setOriginalText] = useState('');
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
  const trimmedManualText = manualText.trim();
  const targetLanguageLabel = useMemo(
    () => getLanguageLabel(targetLanguageId),
    [targetLanguageId],
  );
  const sourceLanguageLabel = useMemo(
    () => getLanguageLabel(sourceLanguageId),
    [sourceLanguageId],
  );
  const languageOptionsTitle =
    mode === 'translate' ? 'Translation languages' : 'Recording language';
  const languageOptionsSummary =
    mode === 'translate'
      ? `From ${sourceLanguageLabel} to ${targetLanguageLabel}`
      : `Source: ${sourceLanguageLabel}`;
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

        setMode(loadedSettings.defaultMode);
        setSourceLanguageId(loadedSettings.sourceLanguageId);
        setTargetLanguageId(loadedSettings.targetLanguageId);
        setModelPresetId(loadedSettings.modelPresetId);
        setCustomModelId(loadedSettings.customModelId);
        setTranscriptionModelId(loadedSettings.transcriptionModelId);
        setCleanupEnabled(loadedSettings.cleanupEnabled);
        setAreRecordingOptionsExpanded(false);
        setIsManualTextExpanded(loadedSettings.defaultMode === 'translate');
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
    return () => {
      invalidateOpenRouterOperations();
      void activeRecordingController.cancel();
    };
  }, [activeRecordingController, invalidateOpenRouterOperations]);

  const saveResult = useCallback(
    (
      nextMode: RecordMode,
      nextResultText: string,
      nextOriginalText = '',
      historyItem?: HistoryItem,
    ) => {
      setResultMode(nextMode);
      setResultText(nextResultText);
      setOriginalText(nextOriginalText);
      setVisibleHistoryItemId(historyItem?.id ?? null);
      setCurrentResultTags([...(historyItem?.tags ?? [])]);
      setFlowErrorText('');
      setSavedHistoryCount((currentCount) => currentCount + 1);
      setAreRecordingOptionsExpanded(false);
      setIsManualTextExpanded(false);
    },
    [setVisibleHistoryItemId],
  );

  const applyTranscriptionResult = useCallback(
    (result: TranscriptionFlowResult) => {
      saveResult('transcribe', result.transcript, '', result.historyItem);

      if (result.status === 'cleanup_failed') {
        setFlowErrorText(result.notice.message);
      }
    },
    [saveResult],
  );

  const applyTranslationResult = useCallback(
    (result: TranslationFlowResult) => {
      if (result.status === 'translation_failed') {
        setResultMode('translate');
        setResultText(result.primaryText);
        setOriginalText(result.sourceText);
        setVisibleHistoryItemId(null);
        setCurrentResultTags([]);
        setFlowErrorText(result.error.message);
        setAreRecordingOptionsExpanded(false);
        setIsManualTextExpanded(false);
        return;
      }

      saveResult('translate', result.translatedText, result.sourceText, result.historyItem);
    },
    [saveResult, setVisibleHistoryItemId],
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

        if (mode === 'translate') {
          const result = await recordFlowProcessors.runTranslation(
            {
              sourceType: 'voice',
              audio,
              sourceLanguageId,
              targetLanguageId,
              modelPresetId,
              customModelId,
              ...(transcriptionModelId === DEFAULT_TRANSCRIPTION_MODEL_ID
                ? {}
                : { transcriptionModelId }),
            },
            { isCurrent },
          );

          if (isCurrent()) {
            applyTranslationResult(result);
          }
          return;
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
    applyTranslationResult,
    cleanupEnabled,
    customModelId,
    didSettingsLoadFail,
    isOpenRouterOperationCurrent,
    mode,
    modelPresetId,
    recordFlowProcessors,
    sourceLanguageId,
    startOpenRouterOperation,
    targetLanguageId,
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

  async function handleTranslateText() {
    if (isManualTranslationPending) {
      return;
    }

    if (!areSettingsReady) {
      if (didSettingsLoadFail) {
        setFlowErrorText(SETTINGS_LOAD_FAILURE_MESSAGE);
      }
      return;
    }

    setResultText('');
    setOriginalText('');
    setFlowErrorText('');
    setVisibleHistoryItemId(null);
    setCurrentResultTags([]);

    if (!trimmedManualText) {
      setFlowErrorText('Enter text to translate.');
      return;
    }

    if (!recordFlowProcessors) {
      setFlowErrorText('OpenRouter processing is not configured.');
      return;
    }

    const operationGeneration = startOpenRouterOperation();
    const isCurrent = () => isOpenRouterOperationCurrent(operationGeneration);

    void activeRecordingController.cancel();
    setIsManualTranslationPending(true);

    try {
      const result = await recordFlowProcessors.runTranslation(
        {
          sourceType: 'manual',
          text: trimmedManualText,
          sourceLanguageId,
          targetLanguageId,
          modelPresetId,
          customModelId,
        },
        { isCurrent },
      );

      if (isCurrent()) {
        applyTranslationResult(result);
      }
    } catch (error) {
      if (isStaleOpenRouterOperationError(error) || !isCurrent()) {
        return;
      }

      setFlowErrorText(getFlowFailureMessage(error));
    } finally {
      if (isCurrent()) {
        setIsManualTranslationPending(false);
      }
    }
  }

  function handleModeChange(nextMode: RecordMode) {
    invalidateOpenRouterOperations();
    setMode(nextMode);
    void activeRecordingController.cancel();
    setResultText('');
    setOriginalText('');
    setFlowErrorText('');
    setVisibleHistoryItemId(null);
    setCurrentResultTags([]);
    setIsManualTranslationPending(false);
    setSavedHistoryCount(0);
    setAreRecordingOptionsExpanded(false);
    setIsManualTextExpanded(nextMode === 'translate');
  }

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
        setIsManualTranslationPending(false);
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
    setIsManualTranslationPending(false);
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

      const updateInput =
        resultMode === 'translate'
          ? {
              primaryText: nextText,
              sourceText: originalText,
              translatedText: nextText,
            }
          : {
              primaryText: nextText,
            };

      void (async () => {
        try {
          await historyRepository.updateHistoryText(historyItemId, updateInput);
        } catch {
          if (currentHistoryItemIdRef.current === historyItemId) {
            setFlowErrorText('Could not update saved history.');
          }
        }
      })();
    },
    [historyRepository, originalText, resultMode],
  );

  function handleSourceLanguageChange(languageId: LanguageId) {
    setSourceLanguageId(languageId);
  }

  function handleTargetLanguageChange(languageId: LanguageId) {
    if (languageId !== 'auto') {
      setTargetLanguageId(languageId);
    }
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
          <Text style={styles.screenStatus}>{mode === 'transcribe' ? 'Transcribe' : 'Translate'}</Text>
        </View>
        <View style={styles.cleanupPill}>
          <Text style={styles.cleanupText}>
            {cleanupEnabled ? 'Light cleanup on' : 'Light cleanup off'}
          </Text>
        </View>
      </View>

      <ModeSegmentedControl value={mode} onChange={handleModeChange} />

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
              label={mode === 'translate' ? 'From language' : 'Source language'}
              onChange={handleSourceLanguageChange}
              value={sourceLanguageId}
            />

            {mode === 'translate' ? (
              <LanguageSelect
                label="To language"
                onChange={handleTargetLanguageChange}
                value={targetLanguageId}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {shouldUseCompactRecorder ? (
        <View style={styles.compactRecorder}>
          <View style={styles.compactRecorderText}>
            <Text style={styles.compactRecorderTitle}>Ready for another recording</Text>
            <Text style={styles.compactRecorderMeta}>60 second max</Text>
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

      {mode === 'translate' ? (
        <View style={styles.translatePanel}>
          <Pressable
            accessibilityLabel={isManualTextExpanded ? 'Hide text input' : 'Show text input'}
            accessibilityRole="button"
            accessibilityState={{ expanded: isManualTextExpanded }}
            onPress={() => setIsManualTextExpanded((isExpanded) => !isExpanded)}
            style={styles.manualInputToggle}
          >
            <View style={styles.optionsToggleText}>
              <Text style={styles.optionsTitle}>Text to translate</Text>
              <Text style={styles.optionsSummary}>
                {trimmedManualText ? 'Typed text ready' : 'Optional typed translation'}
              </Text>
            </View>
            <Text style={styles.optionsAction}>
              {isManualTextExpanded ? 'Hide' : 'Show'}
            </Text>
          </Pressable>

          {isManualTextExpanded ? (
            <View style={styles.inputGroup}>
              <TextInput
                accessibilityLabel="Text to translate"
                multiline
                onChangeText={setManualText}
                placeholder="Type or paste text to translate"
                placeholderTextColor="#94A3B8"
                style={styles.manualInput}
                textAlignVertical="top"
                value={manualText}
              />
            </View>
          ) : null}

          {isManualTextExpanded ? (
            <Pressable
              accessibilityLabel="Translate text"
              accessibilityRole="button"
              accessibilityState={{ disabled: isManualTranslationPending || !areSettingsReady }}
              disabled={isManualTranslationPending || !areSettingsReady}
              onPress={() => void handleTranslateText()}
              style={[
                styles.translateButton,
                (isManualTranslationPending || !areSettingsReady) && styles.translateButtonDisabled,
              ]}
            >
              <Text style={styles.translateButtonText}>
                {isManualTranslationPending ? 'Translating' : 'Translate text'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {areSettingsLoading ? (
        <Text accessibilityLiveRegion="polite" style={styles.settingsLoadText}>
          Loading default settings
        </Text>
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
          mode={resultMode}
          onAddTag={handleAddResultTag}
          onChangeText={handleResultTextChange}
          originalText={originalText}
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
  translatePanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 16,
    padding: 16,
  },
  manualInputToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 44,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  manualInput: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 22,
    minHeight: 104,
    padding: 12,
    writingDirection: 'auto',
  },
  translateButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    minHeight: 46,
    justifyContent: 'center',
  },
  translateButtonDisabled: {
    opacity: 0.55,
  },
  translateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
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
