import { Pressable, StyleSheet, Text, View } from 'react-native';

export type RecordMode = 'transcribe' | 'translate';

type ModeOption = {
  readonly id: RecordMode;
  readonly label: string;
};

const MODE_OPTIONS: readonly ModeOption[] = [
  { id: 'transcribe', label: 'Transcribe' },
  { id: 'translate', label: 'Translate' },
];

type ModeSegmentedControlProps = {
  readonly value: RecordMode;
  readonly onChange: (mode: RecordMode) => void;
};

export default function ModeSegmentedControl({ value, onChange }: ModeSegmentedControlProps) {
  return (
    <View accessibilityLabel="Record mode" style={styles.container}>
      {MODE_OPTIONS.map((option) => {
        const selected = option.id === value;

        return (
          <Pressable
            key={option.id}
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.id)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    flexDirection: 'row',
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  segmentText: {
    color: '#64748B',
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  segmentTextSelected: {
    color: '#111827',
  },
});
