import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Tag } from '../domain/history';

type TagEditorProps = {
  readonly canAddTag: boolean;
  readonly onAddTag?: (tagName: string) => Promise<Tag | null>;
  readonly tags: readonly Tag[];
};

export default function TagEditor({ canAddTag, onAddTag, tags }: TagEditorProps) {
  const [tagName, setTagName] = useState('');
  const [errorText, setErrorText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const trimmedTagName = tagName.trim();
  const canSubmit = canAddTag && trimmedTagName.length > 0 && !isSaving;

  async function handleAddTag() {
    if (!trimmedTagName || isSaving) {
      return;
    }

    if (!canAddTag || !onAddTag) {
      setErrorText('Save this result before adding tags.');
      return;
    }

    setIsSaving(true);
    setErrorText('');

    try {
      const tag = await onAddTag(trimmedTagName);
      if (tag) {
        setTagName('');
      }
    } catch {
      setErrorText('Could not add tag.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      {tags.length > 0 ? (
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <View key={tag.id} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel="Tag name"
          autoCapitalize="words"
          onChangeText={(nextValue) => {
            setTagName(nextValue);
            setErrorText('');
          }}
          placeholder="Add a tag"
          placeholderTextColor="#94A3B8"
          style={styles.input}
          value={tagName}
        />
        <Pressable
          accessibilityLabel="Add tag"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => void handleAddTag()}
          style={[styles.addButton, !canSubmit && styles.addButtonDisabled]}
        >
          <Text style={styles.addButtonText}>{isSaving ? 'Adding' : 'Add tag'}</Text>
        </Pressable>
      </View>

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
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
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    color: '#0F172A',
    flex: 1,
    fontSize: 15,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  addButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '700',
  },
});
