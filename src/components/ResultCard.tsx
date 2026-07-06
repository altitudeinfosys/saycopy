import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { Tag } from '../domain/history';
import ActionBar, { type ResultActions } from './ActionBar';
import type { RecordMode } from './ModeSegmentedControl';
import TagEditor from './TagEditor';

type ResultCardProps = {
  readonly actions: ResultActions;
  readonly canAddTag?: boolean;
  readonly mode: RecordMode;
  readonly onAddTag?: (tagName: string) => Promise<Tag>;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly originalText?: string;
  readonly tags?: readonly Tag[];
};

export default function ResultCard({
  actions,
  canAddTag = false,
  mode,
  onAddTag,
  onChangeText,
  originalText,
  tags = [],
  value,
}: ResultCardProps) {
  const [actionErrorText, setActionErrorText] = useState('');
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
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

      <ActionBar
        actions={actions}
        isTagEditorOpen={isTagEditorOpen}
        onActionError={setActionErrorText}
        onToggleTags={() => setIsTagEditorOpen((currentValue) => !currentValue)}
        resultText={value}
      />

      {actionErrorText ? <Text style={styles.errorText}>{actionErrorText}</Text> : null}

      {isTagEditorOpen ? (
        <TagEditor canAddTag={canAddTag} onAddTag={onAddTag} tags={tags} />
      ) : null}
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
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '700',
  },
});
