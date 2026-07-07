import { cleanup } from '@testing-library/react-native';
import type { ReactNode } from 'react';

type SafeAreaMockProps = {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
};

const mockExpoAudioRecorder = {
  getStatus: jest.fn(() => ({
    canRecord: false,
    durationMillis: 0,
    isRecording: false,
    mediaServicesDidReset: false,
    url: 'file:///tmp/mock-expo-audio-recording.m4a',
  })),
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
  record: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  uri: 'file:///tmp/mock-expo-audio-recording.m4a',
};

jest.mock('expo-audio', () => ({
  RecordingPresets: {
    HIGH_QUALITY: {
      extension: '.m4a',
      sampleRate: 44100,
    },
  },
  requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  useAudioRecorder: jest.fn(() => mockExpoAudioRecorder),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    SafeAreaProvider: ({ children }: SafeAreaMockProps) =>
      React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children, ...props }: SafeAreaMockProps) =>
      React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  };
});

afterEach(cleanup);
