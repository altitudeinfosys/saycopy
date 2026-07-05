import { Pressable, StyleSheet, Text, View } from 'react-native';

type RecordingPanelProps = {
  readonly busyLabel?: string;
  readonly isDisabled?: boolean;
  readonly isRecording: boolean;
  readonly onRecordPress: () => void;
};

const WAVEFORM_BARS = [20, 34, 26, 44, 30, 52, 24, 40, 28, 46, 22] as const;

export default function RecordingPanel({
  busyLabel,
  isDisabled = false,
  isRecording,
  onRecordPress,
}: RecordingPanelProps) {
  const buttonLabel = busyLabel ?? (isRecording ? 'Stop recording' : 'Tap to record');

  return (
    <View
      testID="recording-panel"
      style={[styles.panel, isRecording ? styles.panelActive : styles.panelIdle]}
    >
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, isRecording && styles.statusDotActive]} />
        <Text style={[styles.statusText, isRecording && styles.statusTextActive]}>
          {isRecording ? 'Recording in progress' : 'Ready to record'}
        </Text>
        <Text style={styles.maxCue}>{isRecording ? '00:00 / 60s max' : '60 second max'}</Text>
      </View>

      <View accessible accessibilityLabel="Mock audio waveform" style={styles.waveform}>
        {WAVEFORM_BARS.map((height, index) => (
          <View
            key={`${height}-${index}`}
            style={[
              styles.waveformBar,
              { height },
              isRecording ? styles.waveformBarActive : styles.waveformBarIdle,
            ]}
          />
        ))}
      </View>

      <Pressable
        accessibilityLabel={buttonLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        disabled={isDisabled}
        onPress={onRecordPress}
        style={[
          styles.recordButton,
          isRecording && styles.recordButtonActive,
          isDisabled && styles.recordButtonDisabled,
        ]}
      >
        <Text
          style={[
            styles.recordButtonIcon,
            isRecording && styles.recordButtonIconActive,
            isDisabled && styles.recordButtonTextDisabled,
          ]}
        >
          {busyLabel ? 'Wait' : isRecording ? 'Stop' : 'Rec'}
        </Text>
        <Text
          style={[
            styles.recordButtonText,
            isRecording && styles.recordButtonTextActive,
            isDisabled && styles.recordButtonTextDisabled,
          ]}
        >
          {buttonLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 22,
    padding: 18,
  },
  panelIdle: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  panelActive: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  statusDot: {
    backgroundColor: '#94A3B8',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  statusDotActive: {
    backgroundColor: '#F97316',
  },
  statusText: {
    color: '#475569',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#9A3412',
  },
  maxCue: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  waveform: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 58,
    justifyContent: 'center',
    gap: 5,
  },
  waveformBar: {
    borderRadius: 4,
    width: 5,
  },
  waveformBarIdle: {
    backgroundColor: '#CBD5E1',
  },
  waveformBarActive: {
    backgroundColor: '#FB923C',
  },
  recordButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#111827',
    borderRadius: 86,
    height: 172,
    justifyContent: 'center',
    width: 172,
  },
  recordButtonActive: {
    backgroundColor: '#EA580C',
  },
  recordButtonDisabled: {
    backgroundColor: '#64748B',
  },
  recordButtonIcon: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  recordButtonIconActive: {
    color: '#FFF7ED',
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  recordButtonTextActive: {
    color: '#FFF7ED',
  },
  recordButtonTextDisabled: {
    color: '#E2E8F0',
  },
});
