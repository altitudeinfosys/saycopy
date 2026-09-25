import { useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLanguageLabel, LANGUAGE_OPTIONS, type LanguageId } from '../domain/languages';

type LanguagePickerButtonProps = {
  readonly label: string;
  readonly value: LanguageId;
  readonly onChange: (languageId: LanguageId) => void;
  readonly includeAuto?: boolean;
};

// A compact button that opens the full language list, so 11 languages fit on a phone row.
export default function LanguagePickerButton({
  label,
  value,
  onChange,
  includeAuto = false,
}: LanguagePickerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const options = includeAuto
    ? LANGUAGE_OPTIONS
    : LANGUAGE_OPTIONS.filter((language) => language.id !== 'auto');

  return (
    <>
      <Pressable
        accessibilityHint="Opens the language list"
        accessibilityLabel={`${label} language: ${getLanguageLabel(value)}`}
        accessibilityRole="button"
        onPress={() => setIsOpen(true)}
        style={styles.button}
      >
        <Text style={styles.buttonLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.buttonValue}>
          {getLanguageLabel(value)}
        </Text>
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}
        presentationStyle="pageSheet"
        visible={isOpen}
      >
        <SafeAreaView
          edges={Platform.OS === 'android' ? ['top', 'bottom'] : []}
          style={styles.modalScreen}
        >
          <View style={styles.modalHeader}>
            <Pressable
              accessibilityLabel={`Close ${label} language list`}
              accessibilityRole="button"
              onPress={() => setIsOpen(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{label} language</Text>
          </View>
          <FlatList
            contentContainerStyle={styles.list}
            data={options}
            keyExtractor={(language) => language.id}
            renderItem={({ item: language }) => {
              const selected = language.id === value;

              return (
                <Pressable
                  accessibilityLabel={`${label} ${language.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setIsOpen(false);
                    onChange(language.id);
                  }}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {language.label}
                  </Text>
                  {selected ? <Text style={styles.optionTextSelected}>Selected</Text> : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  buttonLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  buttonValue: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  modalScreen: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  closeButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  closeButtonText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '700',
  },
  modalTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  list: {
    gap: 8,
    padding: 16,
  },
  option: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  optionSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  optionText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
