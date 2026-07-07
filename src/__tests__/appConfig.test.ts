const appConfig = require('../../app.json') as {
  readonly expo: {
    readonly android?: {
      readonly adaptiveIcon?: {
        readonly backgroundColor?: string;
        readonly foregroundImage?: string;
      };
      readonly package?: string;
      readonly versionCode?: number;
    };
    readonly plugins?: readonly (
      | string
      | readonly [string, { readonly microphonePermission?: string; readonly recordAudioAndroid?: boolean }]
    )[];
  };
};
const easConfig = require('../../eas.json') as {
  readonly build: {
    readonly preview?: {
      readonly android?: {
        readonly buildType?: string;
      };
      readonly distribution?: string;
    };
  };
};

describe('Expo app config', () => {
  it('declares Android application identity and adaptive icon metadata', () => {
    expect(appConfig.expo.android).toEqual(
      expect.objectContaining({
        package: 'com.tarekalaaddin.tarekwisper',
        versionCode: 1,
        adaptiveIcon: {
          foregroundImage: './assets/icon.png',
          backgroundColor: '#F8FAFC',
        },
      }),
    );
  });

  it('keeps Android audio recording permission explicit in the audio plugin config', () => {
    expect(appConfig.expo.plugins).toContainEqual([
      'expo-audio',
      {
        microphonePermission: 'Allow Tarek Wisper to use the microphone for transcription and translation recordings.',
        recordAudioAndroid: true,
      },
    ]);
  });

  it('defines an Android internal preview build profile without changing production behavior', () => {
    expect(easConfig.build.preview).toEqual(
      expect.objectContaining({
        distribution: 'internal',
        android: {
          buildType: 'apk',
        },
      }),
    );
  });
});
