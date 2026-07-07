import {
  HISTORY_MODES,
  HISTORY_SOURCE_TYPES,
  getHistoryPrimaryText,
  type HistoryItem,
  type HistoryMode,
  type HistorySourceType,
  type TranslateHistoryItem,
  type Tag,
} from '../history';

describe('history domain', () => {
  it('defines stable history mode and source type values', () => {
    const modes: HistoryMode[] = ['transcribe', 'translate'];
    const sourceTypes: HistorySourceType[] = ['voice', 'manual'];

    expect(HISTORY_MODES).toEqual(modes);
    expect(HISTORY_SOURCE_TYPES).toEqual(sourceTypes);
  });

  it('uses transcript as primary text for transcribe history items', () => {
    const item: HistoryItem = {
      id: 'history-1',
      mode: 'transcribe',
      sourceType: 'voice',
      createdAt: '2026-07-05T12:00:00.000Z',
      transcript: 'Meeting starts at noon.',
      sourceLanguageId: 'english',
      tags: [{ id: 'work', label: 'Work' }],
    };

    expect(getHistoryPrimaryText(item)).toBe('Meeting starts at noon.');
  });

  it('uses translated output as primary text for translate history items', () => {
    const item: HistoryItem = {
      id: 'history-2',
      mode: 'translate',
      sourceType: 'manual',
      createdAt: '2026-07-05T12:05:00.000Z',
      transcript: 'Hola',
      translatedText: 'Hello',
      sourceLanguageId: 'spanish',
      targetLanguageId: 'english',
      tags: [],
    };

    expect(getHistoryPrimaryText(item)).toBe('Hello');
  });

  it('prevents auto-detect as a translate target language', () => {
    const concreteTargetLanguageId: TranslateHistoryItem['targetLanguageId'] = 'arabic';
    // @ts-expect-error translate targets must be concrete languages
    const invalidTargetLanguageId: TranslateHistoryItem['targetLanguageId'] = 'auto';

    expect(concreteTargetLanguageId).toBe('arabic');
    expect(invalidTargetLanguageId).toBe('auto');
  });

  it('defines reusable tag shape', () => {
    const tag: Tag = {
      id: 'urgent',
      label: 'Urgent',
      color: '#ef4444',
    };

    expect(tag).toEqual({
      id: 'urgent',
      label: 'Urgent',
      color: '#ef4444',
    });
  });
});
