import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
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
  const [isCopied, setIsCopied] = useState(false);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  function showCopyConfirmation() {
    setIsCopied(true);

    if (copyFeedbackTimeoutRef.current) {
      clearTimeout(copyFeedbackTimeoutRef.current);
    }

    copyFeedbackTimeoutRef.current = setTimeout(() => {
      setIsCopied(false);
      copyFeedbackTimeoutRef.current = null;
    }, 1800);
  }

  async function runAction(
    action: (text: string) => Promise<void>,
    errorMessage: string,
    onSuccess?: () => void,
  ) {
    onActionError?.('');

    try {
      await action(resultText);
      onSuccess?.();
    } catch {
      onActionError?.(errorMessage);
    }
  }

  return (
    <View style={styles.actionRow}>
      <Pressable
        accessibilityLabel={isCopied ? 'Copied' : 'Copy'}
        accessibilityRole="button"
        accessibilityState={{ selected: isCopied }}
        onPress={() => void runAction(actions.copyText, 'Could not copy text.', showCopyConfirmation)}
        style={[styles.actionButton, isCopied && styles.actionButtonConfirmed]}
      >
        <Text style={[styles.actionText, isCopied && styles.actionTextConfirmed]}>
          {isCopied ? 'Copied \u2713' : 'Copy'}
        </Text>
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
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    minWidth: 76,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  actionButtonSelected: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FB923C',
  },
  actionButtonConfirmed: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  actionText: {
    color: '#334155',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionTextSelected: {
    color: '#9A3412',
  },
  actionTextConfirmed: {
    color: '#166534',
  },
});
