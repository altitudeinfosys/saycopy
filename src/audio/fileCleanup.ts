import { File } from 'expo-file-system';

export type TemporaryAudioFileReference = {
  readonly uri?: string | null;
  readonly path?: string | null;
};

export type TemporaryAudioFileDeleter = {
  readonly deleteAsync: (uriOrPath: string) => Promise<void> | void;
};

export type TemporaryAudioCleanupLogger = {
  readonly warn: (message: string, details?: Record<string, unknown>) => void;
};

export type TemporaryAudioFileCleanup = {
  readonly cleanup: (reference: TemporaryAudioFileReference) => Promise<void>;
};

const expoFileSystemDeleter: TemporaryAudioFileDeleter = {
  deleteAsync(uriOrPath) {
    const file = new File(uriOrPath);

    if (file.exists) {
      file.delete();
    }
  },
};

export function createTemporaryAudioFileCleanup({
  deleter = expoFileSystemDeleter,
  logger,
}: {
  readonly deleter?: TemporaryAudioFileDeleter;
  readonly logger?: TemporaryAudioCleanupLogger;
} = {}): TemporaryAudioFileCleanup {
  return {
    async cleanup(reference) {
      const uriOrPath = reference.uri ?? reference.path;

      if (!uriOrPath) {
        return;
      }

      try {
        await deleter.deleteAsync(uriOrPath);
      } catch (error) {
        logger?.warn('Temporary audio cleanup failed', {
          message: error instanceof Error ? error.message : 'Unknown cleanup error',
          uri: reference.uri,
        });
      }
    },
  };
}
