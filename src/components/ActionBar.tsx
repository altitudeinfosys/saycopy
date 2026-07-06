import * as Clipboard from 'expo-clipboard';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

export type ResultActions = {
  readonly copyText: (text: string) => Promise<void>;
  readonly shareText: (text: string) => Promise<void>;
};

type ActionBarProps = {
  readonly actions: ResultActions;
  readonly isTagEditorOpen: boolean;
  readonly onActionError?: (message: string) => void;
  readonly onToggleTags: () => void;
  readonly resultText: string;
};

export function createResultActions(): ResultActions {
  return {
    copyText: async (text: string) => {
      await Clipboard.setStringAsync(text);
    },
    shareText: async (text: string) => {
      await Share.share({ message: text });
    },
  };
}

export default function ActionBar({
  actions,
  isTagEditorOpen,
  onActionError,
  onToggleTags,
  resultText,
}: ActionBarProps) {
  async function runAction(action: (text: string) => Promise<void>, errorMessage: string) {
    onActionError?.('');

    try {
      await action(resultText);
    } catch {
      onActionError?.(errorMessage);
    }
  }

  return (
    <View style={styles.actionRow}>
      <Pressable
        accessibilityLabel="Copy"
        accessibilityRole="button"
        onPress={() => void runAction(actions.copyText, 'Could not copy text.')}
        style={styles.actionButton}
      >
        <Text style={styles.actionText}>Copy</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Share"
        accessibilityRole="button"
        onPress={() => void runAction(actions.shareText, 'Could not share text.')}
        style={styles.actionButton}
      >
        <Text style={styles.actionText}>Share</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Tags"
        accessibilityRole="button"
        accessibilityState={{ selected: isTagEditorOpen }}
        onPress={onToggleTags}
        style={[styles.actionButton, isTagEditorOpen && styles.actionButtonSelected]}
      >
        <Text style={[styles.actionText, isTagEditorOpen && styles.actionTextSelected]}>Tags</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  actionButtonSelected: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FB923C',
  },
  actionText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  actionTextSelected: {
    color: '#9A3412',
  },
});
