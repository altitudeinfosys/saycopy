import { reportError } from '../observability/errorReporting';
import type { FlowAudioInput, TemporaryAudioCleanup } from './types';

export async function cleanupTemporaryAudio(
  temporaryAudio: TemporaryAudioCleanup | undefined,
  audio: FlowAudioInput,
): Promise<void> {
  try {
    await temporaryAudio?.cleanup({
      uri: audio.uri,
    });
  } catch (error) {
    reportError(error, 'temporaryAudioCleanup.cleanupTemporaryAudio');
    // Temporary-file cleanup is best-effort and must not replace the primary flow outcome.
  }
}
