const appConfig = require('../../app.json') as {
  readonly expo: {
    readonly name?: string;
    readonly android?: {
      readonly allowBackup?: boolean;
      readonly adaptiveIcon?: {
        readonly backgroundColor?: string;
        readonly foregroundImage?: string;
      };
      readonly blockedPermissions?: readonly string[];
      readonly package?: string;
      readonly versionCode?: number;
    };
    readonly plugins?: readonly (
      | string
      | readonly [
          string,
          {
            readonly enableBackgroundPlayback?: boolean;
            readonly enableBackgroundRecording?: boolean;
            readonly faceIDPermission?: boolean;
            readonly microphonePermission?: string;
            readonly recordAudioAndroid?: boolean;
          },
        ]
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
  it('uses the SayCopy product name and confirmed Android application identity', () => {
    expect(appConfig.expo.name).toBe('SayCopy');
    expect(appConfig.expo.android?.package).toBe('com.altitudeinfosys.saycopy');
  });

  it('declares Android application identity and adaptive icon metadata', () => {
    expect(appConfig.expo.android).toEqual(
      expect.objectContaining({
        allowBackup: false,
        blockedPermissions: expect.arrayContaining([
          'android.permission.FOREGROUND_SERVICE',
          'android.permission.READ_EXTERNAL_STORAGE',
          'android.permission.SYSTEM_ALERT_WINDOW',
          'android.permission.WRITE_EXTERNAL_STORAGE',
        ]),
        package: 'com.altitudeinfosys.saycopy',
        adaptiveIcon: {
          foregroundImage: './assets/icon.png',
          backgroundColor: '#F8FAFC',
        },
      }),
    );
    expect(appConfig.expo.android?.versionCode).toBeUndefined();
  });

  it('keeps Android audio recording permission explicit in the audio plugin config', () => {
    expect(appConfig.expo.plugins).toContainEqual([
      'expo-audio',
      {
        microphonePermission: 'Allow SayCopy to use the microphone for transcription and translation recordings.',
        recordAudioAndroid: true,
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ]);
  });

  it('does not declare Face ID when token storage does not require biometric authentication', () => {
    expect(appConfig.expo.plugins).toContainEqual([
      'expo-secure-store',
      {
        faceIDPermission: false,
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
