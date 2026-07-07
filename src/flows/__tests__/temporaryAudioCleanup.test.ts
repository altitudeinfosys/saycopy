import { cleanupTemporaryAudio } from '../temporaryAudioCleanup';

describe('cleanupTemporaryAudio', () => {
  it('passes only the temporary file reference to cleanup', async () => {
    const temporaryAudio = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    await cleanupTemporaryAudio(temporaryAudio, {
      uri: 'file:///tmp/secret-audio.m4a',
      base64Audio: 'sensitive-base64-audio',
      format: 'm4a',
      durationMs: 1500,
    });

    expect(temporaryAudio.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/secret-audio.m4a',
    });
  });
});
