import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import LanguageSelect from '../components/LanguageSelect';
import ModeSegmentedControl, { type RecordMode } from '../components/ModeSegmentedControl';
import ModelPresetSelect from '../components/ModelPresetSelect';
import RecordingPanel from '../components/RecordingPanel';
import ResultCard from '../components/ResultCard';
import { LANGUAGE_OPTIONS, type ConcreteLanguageId, type LanguageId } from '../domain/languages';
import { DEFAULT_MODEL_PRESET_ID, type ModelPresetId } from '../domain/modelPresets';

const DEFAULT_TARGET_LANGUAGE_ID = 'spanish' satisfies ConcreteLanguageId;

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

export default function RecordScreen() {
  const [mode, setMode] = useState<RecordMode>('transcribe');
  const [isRecording, setIsRecording] = useState(false);
  const [targetLanguageId, setTargetLanguageId] = useState<ConcreteLanguageId>(
    DEFAULT_TARGET_LANGUAGE_ID,
  );
  const [modelPresetId, setModelPresetId] = useState<ModelPresetId>(DEFAULT_MODEL_PRESET_ID);
  const [manualText, setManualText] = useState('');
  const [resultMode, setResultMode] = useState<RecordMode>('transcribe');
  const [resultText, setResultText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [savedHistoryCount, setSavedHistoryCount] = useState(0);

  const hasResult = resultText.length > 0;
  const trimmedManualText = manualText.trim();
  const targetLanguageLabel = useMemo(
    () => getLanguageLabel(targetLanguageId),
    [targetLanguageId],
  );

  function saveMockedResult(nextMode: RecordMode, nextResultText: string, nextOriginalText = '') {
    setResultMode(nextMode);
    setResultText(nextResultText);
    setOriginalText(nextOriginalText);
    setSavedHistoryCount((currentCount) => currentCount + 1);
  }

  function handleModeChange(nextMode: RecordMode) {
    setMode(nextMode);
    setIsRecording(false);
    setResultText('');
    setOriginalText('');
    setSavedHistoryCount(0);
  }

  function handleRecordPress() {
    if (!isRecording) {
      setIsRecording(true);
      return;
    }

    setIsRecording(false);

    if (mode === 'translate') {
      const sourceText = trimmedManualText || 'Recorded source text for translation.';
      saveMockedResult('translate', buildTranslationResult(sourceText, targetLanguageId), sourceText);
      return;
    }

    saveMockedResult('transcribe', buildTranscriptResult());
  }

  function handleTargetLanguageChange(languageId: LanguageId) {
    if (languageId !== 'auto') {
      setTargetLanguageId(languageId);
    }
  }

  function handleTranslateText() {
    const sourceText = trimmedManualText || 'Meet me at the office at noon.';
    saveMockedResult('translate', buildTranslationResult(sourceText, targetLanguageId), sourceText);
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
  targetHint: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
