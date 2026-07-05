import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  createAudioRecordingController,
  type AudioRecordingController,
  type AudioRecordingState,
} from '../audio/audioRecorder';
import LanguageSelect from '../components/LanguageSelect';
import ModeSegmentedControl, { type RecordMode } from '../components/ModeSegmentedControl';
import ModelPresetSelect from '../components/ModelPresetSelect';
import RecordingPanel from '../components/RecordingPanel';
import ResultCard from '../components/ResultCard';
import { LANGUAGE_OPTIONS, type ConcreteLanguageId, type LanguageId } from '../domain/languages';
import { DEFAULT_MODEL_PRESET_ID, type ModelPresetId } from '../domain/modelPresets';

const DEFAULT_TARGET_LANGUAGE_ID = 'spanish' satisfies ConcreteLanguageId;

type RecordScreenProps = {
  readonly recordingController?: AudioRecordingController;
};

function getLanguageLabel(languageId: LanguageId) {
  return LANGUAGE_OPTIONS.find((language) => language.id === languageId)?.label ?? 'Selected language';
}

function buildTranscriptResult() {
  return [
    'Cleaned transcript:',
    'The client asked for a concise follow-up after the demo, including pricing, setup timing, and next steps.',
  ].join(' ');
}

function buildTranslationResult(sourceText: string, targetLanguageId: ConcreteLanguageId) {
  return `${getLanguageLabel(targetLanguageId)} translation: ${sourceText}`;
}

function getRecorderFailureMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Recording failed. Try again.';
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

export default function RecordScreen({ recordingController }: RecordScreenProps = {}) {
  const [mode, setMode] = useState<RecordMode>('transcribe');
  const [targetLanguageId, setTargetLanguageId] = useState<ConcreteLanguageId>(
    DEFAULT_TARGET_LANGUAGE_ID,
  );
  const [modelPresetId, setModelPresetId] = useState<ModelPresetId>(DEFAULT_MODEL_PRESET_ID);
  const [manualText, setManualText] = useState('');
  const [resultMode, setResultMode] = useState<RecordMode>('transcribe');
  const [resultText, setResultText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [savedHistoryCount, setSavedHistoryCount] = useState(0);
  const autoProcessedAudioUriRef = useRef<string | null>(null);
  const [defaultRecordingController] = useState(createAudioRecordingController);
  const activeRecordingController = recordingController ?? defaultRecordingController;
  const recordingState = useSyncExternalStore(
    activeRecordingController.subscribe,
    activeRecordingController.getState,
    activeRecordingController.getState,
  );

  const hasResult = resultText.length > 0;
  const trimmedManualText = manualText.trim();
  const targetLanguageLabel = useMemo(
    () => getLanguageLabel(targetLanguageId),
    [targetLanguageId],
  );
  const isRecording = isRecordButtonActive(recordingState);
  const isRecorderBusy = isRecordButtonBusy(recordingState);
  const recorderCue =
    recordingState.status === 'requesting_permission'
      ? 'Requesting microphone permission'
      : recordingState.status === 'processing'
        ? 'Creating result'
        : recordingState.status === 'failed'
          ? getRecorderFailureMessage(recordingState.error)
          : '';

  useEffect(() => {
    return () => {
      void activeRecordingController.cancel();
    };
  }, [activeRecordingController]);

  const saveMockedResult = useCallback(
    (nextMode: RecordMode, nextResultText: string, nextOriginalText = '') => {
      setResultMode(nextMode);
      setResultText(nextResultText);
      setOriginalText(nextOriginalText);
      setSavedHistoryCount((currentCount) => currentCount + 1);
    },
    [],
  );

  const processStoppedRecording = useCallback(async () => {
    try {
      await activeRecordingController.processStoppedAudio(async () => {
        if (mode === 'translate') {
          const sourceText = trimmedManualText || 'Recorded source text for translation.';
          saveMockedResult(
            'translate',
            buildTranslationResult(sourceText, targetLanguageId),
            sourceText,
          );
          return;
        }

        saveMockedResult('transcribe', buildTranscriptResult());
      });
    } catch {
      // Failure details are surfaced through recorder state.
    }
  }, [
    activeRecordingController,
    mode,
    saveMockedResult,
    targetLanguageId,
    trimmedManualText,
  ]);

  useEffect(() => {
    if (recordingState.status === 'recording') {
      autoProcessedAudioUriRef.current = null;
    }
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

  function handleTranslateText() {
    const sourceText = trimmedManualText || 'Meet me at the office at noon.';
    saveMockedResult('translate', buildTranslationResult(sourceText, targetLanguageId), sourceText);
  }

  function handleModeChange(nextMode: RecordMode) {
    setMode(nextMode);
    void activeRecordingController.cancel();
    setResultText('');
    setOriginalText('');
    setSavedHistoryCount(0);
  }

  async function handleRecordPress() {
    if (isRecorderBusy) {
      return;
    }

    if (!isRecording) {
      try {
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

  function handleTargetLanguageChange(languageId: LanguageId) {
    if (languageId !== 'auto') {
      setTargetLanguageId(languageId);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Record</Text>
          <Text style={styles.screenStatus}>{mode === 'transcribe' ? 'Transcribe' : 'Translate'}</Text>
        </View>
        <View style={styles.cleanupPill}>
          <Text style={styles.cleanupText}>Light cleanup on</Text>
        </View>
      </View>

      <ModeSegmentedControl value={mode} onChange={handleModeChange} />

      {mode === 'translate' ? (
        <View style={styles.translatePanel}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Text to translate</Text>
            <TextInput
              multiline
              onChangeText={setManualText}
              placeholder="Type or paste text to translate"
              placeholderTextColor="#94A3B8"
              style={styles.manualInput}
              textAlignVertical="top"
              value={manualText}
            />
          </View>

          <LanguageSelect
            label="Target language"
            onChange={handleTargetLanguageChange}
            value={targetLanguageId}
          />

          <Pressable
            accessibilityLabel="Translate text"
            accessibilityRole="button"
            onPress={handleTranslateText}
            style={styles.translateButton}
          >
            <Text style={styles.translateButtonText}>Translate text</Text>
          </Pressable>
        </View>
      ) : null}

      <ModelPresetSelect value={modelPresetId} onChange={setModelPresetId} />

      <RecordingPanel isRecording={isRecording} onRecordPress={handleRecordPress} />

      {recorderCue ? (
        <Text
          style={[
            styles.recorderCue,
            recordingState.status === 'failed' ? styles.recorderCueError : null,
          ]}
        >
          {recorderCue}
        </Text>
      ) : null}

      {savedHistoryCount > 0 ? (
        <View style={styles.savedRow}>
          <Text style={styles.savedLabel}>Saved to history</Text>
          <Text style={styles.savedMeta}>
            {savedHistoryCount} {savedHistoryCount === 1 ? 'item' : 'items'} in this session
          </Text>
        </View>
      ) : null}

      {hasResult ? (
        <ResultCard
          mode={resultMode}
          onChangeText={setResultText}
          originalText={originalText}
          value={resultText}
        />
      ) : null}

      {mode === 'translate' && !hasResult ? (
        <Text style={styles.targetHint}>Target: {targetLanguageLabel}</Text>
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
    justifyContent: 'space-between',
  },
  screenTitle: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '800',
  },
  screenStatus: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  cleanupPill: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cleanupText: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '800',
  },
  translatePanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 16,
    padding: 16,
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
  },
  translateButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    minHeight: 46,
    justifyContent: 'center',
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
    justifyContent: 'space-between',
    padding: 12,
  },
  savedLabel: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '800',
  },
  savedMeta: {
    color: '#15803D',
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
  targetHint: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
