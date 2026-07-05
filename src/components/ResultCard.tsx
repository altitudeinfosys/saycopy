import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { RecordMode } from './ModeSegmentedControl';

type ResultCardProps = {
  readonly mode: RecordMode;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly originalText?: string;
};

const ACTIONS = ['Copy', 'Share', 'Tags'] as const;

export default function ResultCard({ mode, value, onChangeText, originalText }: ResultCardProps) {
  const isTranslateMode = mode === 'translate';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>{isTranslateMode ? 'Translated output' : 'Transcript'}</Text>
        <Text style={styles.editableLabel}>Editable</Text>
      </View>

      <TextInput
        accessibilityLabel="Result text"
        multiline
        onChangeText={onChangeText}
        style={[styles.editor, isTranslateMode && styles.translationEditor]}
        testID="result-editor"
        textAlignVertical="top"
        value={value}
      />

      {isTranslateMode && originalText ? (
        <View style={styles.originalBlock}>
          <Text style={styles.originalLabel}>Original text</Text>
          <Text style={styles.originalText}>{originalText}</Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        {ACTIONS.map((action) => (
          <Pressable
            key={action}
            accessibilityLabel={action}
            accessibilityRole="button"
            onPress={() => undefined}
            style={styles.actionButton}
          >
            <Text style={styles.actionText}>{action}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heading: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
  },
  editableLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  editor: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 10,
    borderWidth: 1,
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 23,
    minHeight: 140,
    padding: 12,
  },
  translationEditor: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    fontWeight: '700',
  },
  originalBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    gap: 6,
    padding: 12,
  },
  originalLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  originalText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  actionText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
});
