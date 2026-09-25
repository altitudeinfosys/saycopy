import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  type AudioRecordingController,
  MAX_RECORDING_DURATION_LABEL,
  useExpoAudioRecordingController,
} from '../audio/audioRecorder';
import { createResultActions, type ResultActions } from '../components/ActionBar';
import LanguagePickerButton from '../components/LanguagePickerButton';
import TagEditor from '../components/TagEditor';
import type { HistorySourceType, Tag, TranslateHistoryItem } from '../domain/history';
import { getLanguageLabel, type ConcreteLanguageId, type LanguageId } from '../domain/languages';
import type { ModelPresetId } from '../domain/modelPresets';
import {
  isStaleOpenRouterOperationError,
  type TranslateProcessors,
} from '../runtime/appDependencies';
import { createSpeechPlayer, type SpeechPlayer } from '../speech/speechPlayer';
import { DEFAULT_APP_SETTINGS, type SettingsRepository } from '../storage/settingsRepository';
import type { HistoryRepository } from '../storage/sqlite/historyRepository';

type TranslateScreenProps = {
  readonly historyRepository?: HistoryRepository;
  readonly recordingController?: AudioRecordingController;
  readonly resultActions?: ResultActions;
  readonly settingsRepository?: SettingsRepository;
  readonly speechPlayer?: SpeechPlayer;
  readonly translateProcessors?: TranslateProcessors;
};

type TranslateScreenContentProps = Omit<TranslateScreenProps, 'recordingController'> & {
  readonly recordingController: AudioRecordingController;
};

type Translation = {
  readonly sourceText: string;
  readonly translatedText: string;
  readonly sourceLanguageId: LanguageId;
  readonly targetLanguageId: ConcreteLanguageId;
  readonly sourceType: HistorySourceType;
  readonly sttModelId?: string;
  readonly textModelId?: string;
};

const SAVED_LIST_LIMIT = 20;

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { readonly message: unknown };
    if (typeof message === 'string' && message) {
      return message;
    }
  }

  return fallback;
}

function isTranslateItem(item: { readonly mode: string }): item is TranslateHistoryItem {
  return item.mode === 'translate';
}

function getUniqueTags(items: readonly TranslateHistoryItem[]): Tag[] {
  const tagsByLabel = new Map<string, Tag>();

  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const key = tag.label.trim().toLowerCase();
      if (key && !tagsByLabel.has(key)) {
        tagsByLabel.set(key, tag);
      }
    }
  }

  return [...tagsByLabel.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export default function TranslateScreen(props: TranslateScreenProps = {}) {
  if (props.recordingController) {
    return <TranslateScreenContent {...props} recordingController={props.recordingController} />;
  }

  return <TranslateScreenWithDefaultController {...props} />;
}

function TranslateScreenWithDefaultController(
  props: Omit<TranslateScreenProps, 'recordingController'>,
) {
  const recordingController = useExpoAudioRecordingController();

  return <TranslateScreenContent {...props} recordingController={recordingController} />;
}

function TranslateScreenContent({
  historyRepository,
  recordingController,
  resultActions,
  settingsRepository,
  speechPlayer,
  translateProcessors,
}: TranslateScreenContentProps) {
  const [sourceLanguageId, setSourceLanguageId] = useState<LanguageId>(
    DEFAULT_APP_SETTINGS.translateSourceLanguageId,
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
  const [areSettingsReady, setAreSettingsReady] = useState(!settingsRepository);
  const [inputText, setInputText] = useState('');
  const [inputSourceType, setInputSourceType] = useState<HistorySourceType>('manual');
  const [inputSttModelId, setInputSttModelId] = useState<string | undefined>();
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [savedItem, setSavedItem] = useState<TranslateHistoryItem | null>(null);
  const [savedTags, setSavedTags] = useState<Tag[]>([]);
  const [savedItems, setSavedItems] = useState<TranslateHistoryItem[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | undefined>();
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [noticeText, setNoticeText] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const operationGenerationRef = useRef(0);
  const [defaultResultActions] = useState(createResultActions);
  const [defaultSpeechPlayer] = useState(() => speechPlayer ?? createSpeechPlayer());
  const activeResultActions = resultActions ?? defaultResultActions;
  const activeSpeechPlayer = speechPlayer ?? defaultSpeechPlayer;
  const recordingState = useSyncExternalStore(
    recordingController.subscribe,
    recordingController.getState,
    recordingController.getState,
  );
  const isRecording = recordingState.status === 'recording';
  const isRecorderBusy =
    recordingState.status === 'requesting_permission' ||
    recordingState.status === 'stopping' ||
    recordingState.status === 'processing';
  const trimmedInput = inputText.trim();
  const canSwap = sourceLanguageId !== 'auto';
  const isBusy = isTranslating || isTranscribing || isRecorderBusy;
  const allTags = useMemo(() => getUniqueTags(savedItems), [savedItems]);
  const visibleSavedItems = useMemo(() => {
    const normalizedTag = selectedTag?.trim().toLowerCase();
    const filtered = normalizedTag
      ? savedItems.filter((item) =>
          (item.tags ?? []).some((tag) => tag.label.trim().toLowerCase() === normalizedTag),
        )
      : savedItems;

    return filtered.slice(0, SAVED_LIST_LIMIT);
  }, [savedItems, selectedTag]);

  const startOperation = useCallback(() => {
    operationGenerationRef.current += 1;

    return operationGenerationRef.current;
  }, []);

  const refreshSavedItems = useCallback(async () => {
    if (!historyRepository) {
      return;
    }

    try {
      const items = await historyRepository.listHistoryItems();
      setSavedItems(items.filter(isTranslateItem));
    } catch {
      setErrorText('Could not load saved translations.');
    }
  }, [historyRepository]);

  useEffect(() => {
    let isActive = true;

    async function loadSettings() {
      if (!settingsRepository) {
        return;
      }

      try {
        const settings = await settingsRepository.getSettings();
        if (!isActive) {
          return;
        }

        setSourceLanguageId(settings.translateSourceLanguageId);
        setTargetLanguageId(settings.targetLanguageId);
        setModelPresetId(settings.modelPresetId);
        setCustomModelId(settings.customModelId);
        setTranscriptionModelId(settings.transcriptionModelId);
      } catch {
        if (isActive) {
          setErrorText('Could not load default settings.');
        }
      } finally {
        if (isActive) {
          setAreSettingsReady(true);
        }
      }
    }

    async function loadSavedItems() {
      if (!historyRepository) {
        return;
      }

      try {
        const items = await historyRepository.listHistoryItems();
        if (isActive) {
          setSavedItems(items.filter(isTranslateItem));
        }
      } catch {
        if (isActive) {
          setErrorText('Could not load saved translations.');
        }
      }
    }

    void loadSettings();
    void loadSavedItems();

    return () => {
      isActive = false;
    };
  }, [historyRepository, settingsRepository]);

  useEffect(() => {
    return () => {
      operationGenerationRef.current += 1;
      void recordingController.cancel();
      void activeSpeechPlayer.stop();
    };
  }, [activeSpeechPlayer, recordingController]);

  function saveLanguagePair(nextSource: LanguageId, nextTarget: ConcreteLanguageId) {
    void settingsRepository
      ?.saveSettings({ translateSourceLanguageId: nextSource, targetLanguageId: nextTarget })
      .catch(() => setErrorText('Could not save language choice.'));
  }

  function clearResult() {
    setTranslation(null);
    setSavedItem(null);
    setSavedTags([]);
    setNoticeText('');
  }

  function handleSourceLanguageChange(languageId: LanguageId) {
    setSourceLanguageId(languageId);
    saveLanguagePair(languageId, targetLanguageId);
  }

  function handleTargetLanguageChange(languageId: LanguageId) {
    if (languageId === 'auto') {
      return;
    }

    setTargetLanguageId(languageId);
    saveLanguagePair(sourceLanguageId, languageId);
  }

  function handleSwap() {
    if (sourceLanguageId === 'auto') {
      return;
    }

    const nextSource: LanguageId = targetLanguageId;
    const nextTarget: ConcreteLanguageId = sourceLanguageId;
    setSourceLanguageId(nextSource);
    setTargetLanguageId(nextTarget);
    saveLanguagePair(nextSource, nextTarget);

    if (translation) {
      setInputText(translation.translatedText);
      setInputSourceType('manual');
      setInputSttModelId(undefined);
      clearResult();
    }
  }

  async function handleTranslate() {
    if (isBusy || !areSettingsReady) {
      return;
    }

    setErrorText('');
    setNoticeText('');

    if (!trimmedInput) {
      setErrorText('Type or speak something to translate.');
      return;
    }

    if (sourceLanguageId === targetLanguageId) {
      setErrorText('Choose two different languages.');
      return;
    }

    if (!translateProcessors) {
      setErrorText('OpenRouter processing is not configured.');
      return;
    }

    const operation = startOperation();
    const isCurrent = () => operationGenerationRef.current === operation;
    setIsTranslating(true);
    clearResult();

    try {
      const result = await translateProcessors.translate(
        {
          text: trimmedInput,
          sourceLanguageId,
          targetLanguageId,
          modelPresetId,
          customModelId,
        },
        { isCurrent },
      );

      setTranslation({
        sourceText: trimmedInput,
        translatedText: result.text.trim(),
        sourceLanguageId,
        targetLanguageId,
        sourceType: inputSourceType,
        sttModelId: inputSttModelId,
        textModelId: result.modelId,
      });
    } catch (error) {
      if (!isStaleOpenRouterOperationError(error) && isCurrent()) {
        setErrorText(getErrorMessage(error, 'Translation failed. Try again.'));
      }
    } finally {
      if (isCurrent()) {
        setIsTranslating(false);
      }
    }
  }

  async function transcribeStoppedRecording() {
    if (!translateProcessors) {
      setErrorText('OpenRouter processing is not configured.');
      return;
    }

    const operation = startOperation();
    const isCurrent = () => operationGenerationRef.current === operation;
    setIsTranscribing(true);

    try {
      await recordingController.processStoppedAudio(async (audio) => {
        const result = await translateProcessors.transcribe(
          { audio, sourceLanguageId, transcriptionModelId },
          { isCurrent },
        );
        const spokenText = result.text.trim();

        setInputText((currentText) =>
          currentText.trim() ? `${currentText.trim()} ${spokenText}` : spokenText,
        );
        setInputSourceType('voice');
        setInputSttModelId(result.modelId);
        clearResult();
      });
    } catch (error) {
      if (!isStaleOpenRouterOperationError(error) && isCurrent()) {
        setErrorText(getErrorMessage(error, 'Could not transcribe the recording.'));
      }
    } finally {
      if (isCurrent()) {
        setIsTranscribing(false);
      }
    }
  }

  // A recording that hits the time limit stops on its own; transcribe it like a manual stop.
  const autoProcessedUriRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      recordingState.status !== 'stopped' ||
      recordingState.stopReason !== 'max_duration' ||
      !recordingState.audio
    ) {
      return;
    }

    const uri = recordingState.audio.uri ?? null;
    if (autoProcessedUriRef.current === uri) {
      return;
    }

    autoProcessedUriRef.current = uri;
    void transcribeStoppedRecording();
    // transcribeStoppedRecording reads the latest state on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingState]);

  async function handleMicPress() {
    if (!areSettingsReady || isTranslating || isTranscribing || isRecorderBusy) {
      return;
    }

    setErrorText('');

    try {
      if (!isRecording) {
        await activeSpeechPlayer.stop();
        await recordingController.start();
        return;
      }

      await recordingController.stop();
      await transcribeStoppedRecording();
    } catch (error) {
      setErrorText(getErrorMessage(error, 'Recording failed. Try again.'));
    }
  }

  async function handleCancelRecording() {
    operationGenerationRef.current += 1;
    await recordingController.cancel();
  }

  async function handleListen(text: string, languageId: ConcreteLanguageId) {
    setNoticeText('');

    try {
      const outcome = await activeSpeechPlayer.speak(text, languageId);
      if (outcome === 'no_voice') {
        setNoticeText(
          `No ${getLanguageLabel(languageId)} voice is installed on this device. Add one in your phone's accessibility or speech settings.`,
        );
      }
    } catch {
      setNoticeText('Could not play the translation aloud.');
    }
  }

  async function handleCopy() {
    if (!translation) {
      return;
    }

    try {
      await activeResultActions.copyText(translation.translatedText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1800);
    } catch {
      setErrorText('Could not copy the translation.');
    }
  }

  async function handleSave() {
    if (!translation || savedItem || isSaving) {
      return;
    }

    if (!historyRepository) {
      setErrorText('Saving is unavailable.');
      return;
    }

    setIsSaving(true);
    setErrorText('');

    try {
      const item = (await historyRepository.createHistoryItem({
        mode: 'translate',
        sourceType: translation.sourceType,
        sourceLanguageId: translation.sourceLanguageId,
        targetLanguageId: translation.targetLanguageId,
        primaryText: translation.translatedText,
        sourceText: translation.sourceText,
        translatedText: translation.translatedText,
        modelPresetId,
        ...(translation.sttModelId ? { sttModelId: translation.sttModelId } : {}),
        ...(translation.textModelId ? { textModelId: translation.textModelId } : {}),
      })) as TranslateHistoryItem;

      setSavedItem(item);
      setSavedTags([...(item.tags ?? [])]);
      await refreshSavedItems();
    } catch {
      setErrorText('Could not save the translation.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddTag(tagName: string): Promise<Tag | null> {
    if (!historyRepository || !savedItem) {
      return null;
    }

    const tag = await historyRepository.assignTag(savedItem.id, tagName);
    const normalizedLabel = tag.label.trim().toLowerCase();
    setSavedTags((currentTags) =>
      currentTags.some((currentTag) => currentTag.label.trim().toLowerCase() === normalizedLabel)
        ? currentTags
        : [...currentTags, tag],
    );
    await refreshSavedItems();

    return tag;
  }

  async function handleRemoveTag(tagName: string) {
    if (!historyRepository || !savedItem) {
      return;
    }

    await historyRepository.removeTag(savedItem.id, tagName);
    const normalizedLabel = tagName.trim().toLowerCase();
    setSavedTags((currentTags) =>
      currentTags.filter((tag) => tag.label.trim().toLowerCase() !== normalizedLabel),
    );
    await refreshSavedItems();
  }

  function handleOpenSavedItem(item: TranslateHistoryItem) {
    operationGenerationRef.current += 1;
    setIsTranslating(false);
    setSourceLanguageId(item.sourceLanguageId);
    setTargetLanguageId(item.targetLanguageId);
    setInputText(item.transcript);
    setInputSourceType(item.sourceType);
    setInputSttModelId(undefined);
    setTranslation({
      sourceText: item.transcript,
      translatedText: item.translatedText,
      sourceLanguageId: item.sourceLanguageId,
      targetLanguageId: item.targetLanguageId,
      sourceType: item.sourceType,
    });
    setSavedItem(item);
    setSavedTags([...(item.tags ?? [])]);
    setErrorText('');
    setNoticeText('');
  }

  const micLabel = isRecording
    ? 'Stop recording'
    : recordingState.status === 'requesting_permission'
      ? 'Preparing microphone'
      : isTranscribing || recordingState.status === 'processing'
        ? 'Transcribing'
        : 'Speak';
  const statusText = isTranscribing
    ? `Transcribing your ${getLanguageLabel(sourceLanguageId)} speech`
    : isTranslating
      ? `Translating into ${getLanguageLabel(targetLanguageId)}`
      : '';

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.content}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
    >
      <Text style={styles.screenTitle}>Translate</Text>

      <View style={styles.languageBar}>
        <LanguagePickerButton
          includeAuto
          label="From"
          onChange={handleSourceLanguageChange}
          value={sourceLanguageId}
        />
        <Pressable
          accessibilityHint={
            canSwap ? undefined : 'Choose a From language instead of Auto-detect to swap'
          }
          accessibilityLabel="Swap languages"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSwap }}
          disabled={!canSwap}
          onPress={handleSwap}
          style={[styles.swapButton, !canSwap && styles.disabled]}
        >
          <Text style={styles.swapButtonText}>⇄</Text>
        </Pressable>
        <LanguagePickerButton
          label="To"
          onChange={handleTargetLanguageChange}
          value={targetLanguageId}
        />
      </View>

      <View style={styles.card}>
        <TextInput
          accessibilityLabel="Text to translate"
          blurOnSubmit
          editable={!isRecording}
          multiline
          onChangeText={(text) => {
            setInputText(text);
            if (!text.trim()) {
              setInputSourceType('manual');
              setInputSttModelId(undefined);
            }
          }}
          onSubmitEditing={() => void handleTranslate()}
          placeholder={
            sourceLanguageId === 'auto'
              ? 'Type or speak in any language'
              : `Type or speak in ${getLanguageLabel(sourceLanguageId)}`
          }
          placeholderTextColor="#94A3B8"
          returnKeyType="done"
          style={styles.input}
          textAlignVertical="top"
          value={inputText}
        />
        {isRecording ? (
          <Text accessibilityLiveRegion="polite" style={styles.recordingText}>
            Listening… {MAX_RECORDING_DURATION_LABEL}
          </Text>
        ) : null}
        <View style={styles.inputActions}>
          <Pressable
            accessibilityLabel={micLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled: isTranslating || isTranscribing || !areSettingsReady }}
            disabled={isTranslating || isTranscribing || !areSettingsReady}
            onPress={() => void handleMicPress()}
            style={[styles.secondaryButton, isRecording && styles.recordingButton]}
          >
            <Text style={[styles.secondaryButtonText, isRecording && styles.recordingButtonText]}>
              {isRecording ? '■ Stop' : '🎙 Speak'}
            </Text>
          </Pressable>
          {isRecording ? (
            <Pressable
              accessibilityLabel="Cancel recording"
              accessibilityRole="button"
              onPress={() => void handleCancelRecording()}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          ) : inputText ? (
            <Pressable
              accessibilityLabel="Clear text"
              accessibilityRole="button"
              onPress={() => {
                operationGenerationRef.current += 1;
                setIsTranslating(false);
                setInputText('');
                setInputSourceType('manual');
                setInputSttModelId(undefined);
                clearResult();
                setErrorText('');
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Clear</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="Translate"
            accessibilityRole="button"
            accessibilityState={{ disabled: isBusy || isRecording || !areSettingsReady }}
            disabled={isBusy || isRecording || !areSettingsReady}
            onPress={() => void handleTranslate()}
            style={[
              styles.primaryButton,
              (isBusy || isRecording || !areSettingsReady) && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>Translate</Text>
          </Pressable>
        </View>
      </View>

      {statusText ? (
        <View
          accessibilityLabel={statusText}
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          style={styles.statusRow}
        >
          <ActivityIndicator color="#2563EB" size="small" />
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      ) : null}

      {errorText ? (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.errorText}>
          {errorText}
        </Text>
      ) : null}

      {translation ? (
        <View style={styles.card} testID="translation-result">
          <Text style={styles.resultLabel}>{getLanguageLabel(translation.targetLanguageId)}</Text>
          <Text selectable style={styles.resultText}>
            {translation.translatedText}
          </Text>
          <View style={styles.inputActions}>
            <Pressable
              accessibilityLabel="Copy translation"
              accessibilityRole="button"
              onPress={() => void handleCopy()}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>{isCopied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Listen to translation"
              accessibilityRole="button"
              onPress={() =>
                void handleListen(translation.translatedText, translation.targetLanguageId)
              }
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>🔊 Listen</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={savedItem ? 'Saved' : 'Save translation'}
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(savedItem) || isSaving }}
              disabled={Boolean(savedItem) || isSaving}
              onPress={() => void handleSave()}
              style={[styles.primaryButton, (savedItem || isSaving) && styles.savedButton]}
            >
              <Text style={styles.primaryButtonText}>{savedItem ? 'Saved' : 'Save'}</Text>
            </Pressable>
          </View>
          {noticeText ? (
            <Text accessibilityLiveRegion="polite" style={styles.noticeText}>
              {noticeText}
            </Text>
          ) : null}
          {savedItem ? (
            <TagEditor
              canAddTag
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              tags={savedTags}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.savedSection}>
        <Text style={styles.sectionTitle}>Saved translations</Text>
        {allTags.length > 0 ? (
          <ScrollView contentContainerStyle={styles.tagRow} horizontal showsHorizontalScrollIndicator={false}>
            <Pressable
              accessibilityLabel="Show all saved translations"
              accessibilityRole="button"
              accessibilityState={{ selected: !selectedTag }}
              onPress={() => setSelectedTag(undefined)}
              style={[styles.tagChip, !selectedTag && styles.tagChipSelected]}
            >
              <Text style={[styles.tagChipText, !selectedTag && styles.tagChipTextSelected]}>
                All
              </Text>
            </Pressable>
            {allTags.map((tag) => {
              const selected = selectedTag === tag.label;

              return (
                <Pressable
                  key={tag.id}
                  accessibilityLabel={`Filter saved translations by ${tag.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedTag(selected ? undefined : tag.label)}
                  style={[styles.tagChip, selected && styles.tagChipSelected]}
                >
                  <Text style={[styles.tagChipText, selected && styles.tagChipTextSelected]}>
                    {tag.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {visibleSavedItems.length === 0 ? (
          <Text style={styles.emptyText}>
            {savedItems.length === 0
              ? 'Tap Save on a translation to keep it here. Add tags to find it later.'
              : 'No saved translations with this tag.'}
          </Text>
        ) : (
          visibleSavedItems.map((item) => (
            <View key={item.id} style={styles.savedItem}>
              <Pressable
                accessibilityLabel={`Open saved translation ${item.transcript}`}
                accessibilityRole="button"
                onPress={() => handleOpenSavedItem(item)}
                style={styles.savedItemText}
              >
                <Text style={styles.savedItemMeta}>
                  {getLanguageLabel(item.sourceLanguageId)} → {getLanguageLabel(item.targetLanguageId)}
                </Text>
                <Text numberOfLines={2} style={styles.savedItemSource}>
                  {item.transcript}
                </Text>
                <Text numberOfLines={2} style={styles.savedItemTranslation}>
                  {item.translatedText}
                </Text>
                {(item.tags ?? []).length > 0 ? (
                  <Text style={styles.savedItemTags}>
                    {(item.tags ?? []).map((tag) => `#${tag.label}`).join('  ')}
                  </Text>
                ) : null}
              </Pressable>
              <Pressable
                accessibilityLabel={`Listen to ${item.translatedText}`}
                accessibilityRole="button"
                onPress={() => void handleListen(item.translatedText, item.targetLanguageId)}
                style={styles.listenIconButton}
              >
                <Text style={styles.listenIcon}>🔊</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 32,
  },
  screenTitle: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '800',
  },
  languageBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  swapButton: {
    alignItems: 'center',
    backgroundColor: '#E0E7FF',
    borderRadius: 999,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  swapButtonText: {
    color: '#1E3A8A',
    fontSize: 20,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  input: {
    color: '#0F172A',
    fontSize: 18,
    minHeight: 110,
  },
  recordingText: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '700',
  },
  inputActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  savedButton: {
    backgroundColor: '#16A34A',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  recordingButton: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  recordingButtonText: {
    color: '#B91C1C',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  statusText: {
    color: '#1E40AF',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '600',
  },
  noticeText: {
    color: '#92400E',
    fontSize: 14,
  },
  resultLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  resultText: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '600',
  },
  savedSection: {
    gap: 10,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  tagRow: {
    gap: 8,
  },
  tagChip: {
    borderColor: '#CBD5E1',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  tagChipSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  tagChipText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  tagChipTextSelected: {
    color: '#FFFFFF',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
  },
  savedItem: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  savedItemText: {
    flex: 1,
    gap: 2,
  },
  savedItemMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  savedItemSource: {
    color: '#475569',
    fontSize: 14,
  },
  savedItemTranslation: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  savedItemTags: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '600',
  },
  listenIconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  listenIcon: {
    fontSize: 20,
  },
});
