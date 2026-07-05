import { createTemporaryAudioFileCleanup } from '../fileCleanup';

describe('createTemporaryAudioFileCleanup', () => {
  it('deletes temporary audio by uri only', async () => {
    const deleter = {
      deleteAsync: jest.fn().mockResolvedValue(undefined),
    };
    const cleanup = createTemporaryAudioFileCleanup({ deleter });

    await cleanup.cleanup({ uri: 'file:///tmp/voice-note.m4a' });

    expect(deleter.deleteAsync).toHaveBeenCalledWith('file:///tmp/voice-note.m4a');
  });

  it('falls back to deleting by local path when no uri is present', async () => {
    const deleter = {
      deleteAsync: jest.fn().mockResolvedValue(undefined),
    };
    const cleanup = createTemporaryAudioFileCleanup({ deleter });

    await cleanup.cleanup({ path: '/tmp/voice-note.m4a' });

    expect(deleter.deleteAsync).toHaveBeenCalledWith('/tmp/voice-note.m4a');
  });

  it('does nothing when there is no temporary file reference', async () => {
    const deleter = {
      deleteAsync: jest.fn().mockResolvedValue(undefined),
    };
    const cleanup = createTemporaryAudioFileCleanup({ deleter });

    await cleanup.cleanup({});

    expect(deleter.deleteAsync).not.toHaveBeenCalled();
  });

  it('swallows deletion failures so cleanup never masks the primary outcome', async () => {
    const logger = {
      warn: jest.fn(),
    };
    const deleter = {
      deleteAsync: jest.fn().mockRejectedValue(new Error('delete failed')),
    };
    const cleanup = createTemporaryAudioFileCleanup({ deleter, logger });

    await expect(cleanup.cleanup({ uri: 'file:///tmp/failure.m4a' })).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      'Temporary audio cleanup failed',
      expect.objectContaining({ uri: 'file:///tmp/failure.m4a' }),
    );
  });
});
