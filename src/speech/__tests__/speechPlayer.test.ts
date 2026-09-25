import { createSpeechPlayer } from '../speechPlayer';

function createSpeechModule(voiceLanguages: readonly string[]) {
  return {
    getAvailableVoicesAsync: jest.fn(async () =>
      voiceLanguages.map((language) => ({
        identifier: language,
        name: language,
        quality: 'Default',
        language,
      })),
    ),
    speak: jest.fn(),
    stop: jest.fn(async () => undefined),
  };
}

describe('speech player', () => {
  it('stops earlier playback and speaks with the language locale', async () => {
    const speech = createSpeechModule(['en-US', 'es-MX']);
    const player = createSpeechPlayer(speech as never);

    await expect(player.speak('Buenos días', 'spanish')).resolves.toBe('started');

    expect(speech.stop).toHaveBeenCalledTimes(1);
    expect(speech.speak).toHaveBeenCalledWith('Buenos días', { language: 'es-ES' });
    expect(speech.stop.mock.invocationCallOrder[0]).toBeLessThan(
      speech.speak.mock.invocationCallOrder[0],
    );
  });

  it('matches Android-style voice locales', async () => {
    const speech = createSpeechModule(['ja_JP']);

    await expect(createSpeechPlayer(speech as never).speak('こんにちは', 'japanese')).resolves.toBe(
      'started',
    );
  });

  it('reports a missing voice instead of speaking in the wrong language', async () => {
    const speech = createSpeechModule(['en-US', 'es-ES']);

    await expect(createSpeechPlayer(speech as never).speak('नमस्ते', 'hindi')).resolves.toBe(
      'no_voice',
    );
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it('still speaks when the platform does not list voices', async () => {
    const speech = createSpeechModule([]);
    speech.getAvailableVoicesAsync.mockRejectedValueOnce(new Error('unavailable'));

    await expect(createSpeechPlayer(speech as never).speak('Bonjour', 'french')).resolves.toBe(
      'started',
    );
    expect(speech.speak).toHaveBeenCalledWith('Bonjour', { language: 'fr-FR' });
  });
});
