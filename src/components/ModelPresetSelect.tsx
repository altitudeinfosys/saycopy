import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MODEL_PRESETS, type ModelPresetId } from '../domain/modelPresets';

type ModelPresetSelectProps = {
  readonly value: ModelPresetId;
  readonly onChange: (presetId: ModelPresetId) => void;
};

export default function ModelPresetSelect({ value, onChange }: ModelPresetSelectProps) {
  const selectedPreset = MODEL_PRESETS.find((preset) => preset.id === value);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Model preset</Text>
        {selectedPreset ? <Text style={styles.selectedLabel}>{selectedPreset.label}</Text> : null}
      </View>
      <View style={styles.optionRow}>
        {MODEL_PRESETS.map((preset) => {
          const selected = preset.id === value;

          return (
            <Pressable
              key={preset.id}
              accessibilityLabel={preset.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(preset.id)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {selectedPreset ? <Text style={styles.description}>{selectedPreset.description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  selectedLabel: {
    color: '#64748B',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
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
    flex: 1,
    minHeight: 44,
    minWidth: 88,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  optionSelected: {
    backgroundColor: '#E0F2FE',
    borderColor: '#38BDF8',
  },
  optionText: {
    color: '#475569',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  optionTextSelected: {
    color: '#075985',
  },
  description: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
});
