import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LANGUAGE_OPTIONS, type LanguageId } from '../domain/languages';

type LanguageSelectProps = {
  readonly label: string;
  readonly value: LanguageId;
  readonly onChange: (languageId: LanguageId) => void;
  readonly includeAuto?: boolean;
};

export default function LanguageSelect({
  label,
  value,
  onChange,
  includeAuto = false,
}: LanguageSelectProps) {
  const options = includeAuto
    ? LANGUAGE_OPTIONS
    : LANGUAGE_OPTIONS.filter((language) => language.id !== 'auto');

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.optionRow}>
        {options.map((language) => {
          const selected = language.id === value;

          return (
            <Pressable
              key={language.id}
              accessibilityLabel={`${label} ${language.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(language.id)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {language.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  optionSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  optionText: {
    color: '#475569',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
});
