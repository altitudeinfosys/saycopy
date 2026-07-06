import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getHistoryPrimaryText, type HistoryItem } from '../domain/history';
import type { HistoryRepository } from '../storage/sqlite/historyRepository';

type HistoryDetailScreenProps = {
  readonly repository: HistoryRepository;
  readonly historyItemId: string;
  readonly onBack?: () => void;
};

function formatModeLabel(item: HistoryItem): string {
  return item.mode === 'translate' ? 'Translation' : 'Transcription';
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function HistoryDetailScreen({
  repository,
  historyItemId,
  onBack,
}: HistoryDetailScreenProps) {
  const [historyItem, setHistoryItem] = useState<HistoryItem | null>(null);
  const [editedText, setEditedText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadHistoryItem() {
      try {
        const loadedItem = await repository.getHistoryItem(historyItemId);
        if (!isActive) {
          return;
        }

        setHistoryItem(loadedItem);
        setEditedText(loadedItem ? getHistoryPrimaryText(loadedItem) : '');
        setErrorText('');
      } catch {
        if (isActive) {
          setErrorText('Could not load this history item.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadHistoryItem();

    return () => {
      isActive = false;
    };
  }, [historyItemId, repository]);

  async function handleSavePress() {
    if (!historyItem) {
      return;
    }

    setIsSaving(true);
    setErrorText('');
    setStatusText('');

    try {
      const updatedItem = await repository.updateHistoryText(historyItem.id, {
        primaryText: editedText,
      });

      if (!updatedItem) {
        setHistoryItem(null);
        setEditedText('');
        setErrorText('This history item no longer exists.');
        return;
      }

      setHistoryItem(updatedItem);
      setEditedText(getHistoryPrimaryText(updatedItem));
      setStatusText('Saved changes');
    } catch {
      setErrorText('Could not save changes.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateTitle}>Loading history</Text>
      </View>
    );
  }

  if (!historyItem) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateTitle}>History item not found</Text>
        {errorText ? <Text style={styles.stateCopy}>{errorText}</Text> : null}
        {onBack ? (
          <Pressable
            accessibilityLabel="Back to history"
            accessibilityRole="button"
            onPress={onBack}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            accessibilityLabel="Back to history"
            accessibilityRole="button"
            onPress={onBack}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : null}
        <View style={styles.titleGroup}>
          <Text style={styles.screenTitle}>History Detail</Text>
          <Text style={styles.metaText}>
            {formatModeLabel(historyItem)} · {formatDateLabel(historyItem.updatedAt ?? historyItem.createdAt)}
          </Text>
        </View>
      </View>

      <View style={styles.detailSurface}>
        <Text style={styles.label}>Saved text</Text>
        <TextInput
          accessibilityLabel="History text"
          multiline
          onChangeText={(nextText) => {
            setEditedText(nextText);
            setStatusText('');
          }}
          style={styles.editor}
          textAlignVertical="top"
          value={editedText}
        />

        {historyItem.mode === 'translate' ? (
          <View style={styles.sourcePanel}>
            <Text style={styles.label}>Original text</Text>
            <Text style={styles.sourceText}>{historyItem.transcript}</Text>
          </View>
        ) : null}

        {historyItem.tags && historyItem.tags.length > 0 ? (
          <View style={styles.tagRow}>
            {historyItem.tags.map((tag) => (
              <View key={tag.id} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {errorText ? (
          <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.errorText}>
            {errorText}
          </Text>
        ) : null}
        {statusText ? (
          <Text accessibilityLiveRegion="polite" style={styles.savedText}>
            {statusText}
          </Text>
        ) : null}

        <Pressable
          accessibilityLabel="Save changes"
          accessibilityRole="button"
          disabled={isSaving}
          onPress={handleSavePress}
          style={[styles.primaryButton, isSaving && styles.buttonDisabled]}
        >
          <Text style={styles.primaryButtonText}>{isSaving ? 'Saving' : 'Save changes'}</Text>
        </Pressable>
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
    gap: 18,
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  titleGroup: {
    flex: 1,
    gap: 4,
  },
  screenTitle: {
    color: '#111827',
    flexShrink: 1,
    fontSize: 30,
    fontWeight: '800',
  },
  metaText: {
    color: '#64748B',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  backButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  backButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '800',
  },
  detailSurface: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
  },
  editor: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 22,
    minHeight: 180,
    padding: 12,
    writingDirection: 'auto',
  },
  sourcePanel: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  sourceText: {
    color: '#475569',
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 21,
    writingDirection: 'auto',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: '#9A3412',
    fontSize: 12,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  savedText: {
    color: '#047857',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  errorText: {
    color: '#B91C1C',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  centerState: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 24,
  },
  stateTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateCopy: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
});
