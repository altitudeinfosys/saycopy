import { getHistoryPrimaryText } from '../../../domain/history';
import { InMemoryLocalSqliteDatabase } from '../../test/InMemoryLocalSqliteDatabase';
import { createHistoryRepository } from '../historyRepository';
import { migrateSqliteSchema } from '../schema';

async function createRepository() {
  const database = new InMemoryLocalSqliteDatabase();
  await migrateSqliteSchema(database);

  let historyIdCount = 0;
  let tagIdCount = 0;
  const timestamps = [
    '2026-07-05T12:00:00.000Z',
    '2026-07-05T12:01:00.000Z',
    '2026-07-05T12:02:00.000Z',
    '2026-07-05T12:03:00.000Z',
    '2026-07-05T12:04:00.000Z',
    '2026-07-05T12:05:00.000Z',
    '2026-07-05T12:06:00.000Z',
    '2026-07-05T12:07:00.000Z',
    '2026-07-05T12:08:00.000Z',
    '2026-07-05T12:09:00.000Z',
  ];

  return createHistoryRepository(database, {
    createId: (entity) => {
      if (entity === 'tag') {
        tagIdCount += 1;
        return `tag-${tagIdCount}`;
      }

      historyIdCount += 1;
      return `history-${historyIdCount}`;
    },
    now: () => {
      const timestamp = timestamps.shift();
      if (!timestamp) {
        throw new Error('Test timestamp queue exhausted');
      }

      return timestamp;
    },
  });
}

describe('history repository', () => {
  it('creates, gets, and lists history items newest first', async () => {
    const repository = await createRepository();

    const first = await repository.createHistoryItem({
      primaryText: 'Meeting transcript',
      sourceLanguageId: 'auto',
    });
    const second = await repository.createHistoryItem({
      mode: 'translate',
      primaryText: 'Hello',
      sourceText: 'Hola',
      sourceLanguageId: 'spanish',
      targetLanguageId: 'english',
    });

    await expect(repository.getHistoryItem(first.id)).resolves.toMatchObject({
      id: 'history-1',
      mode: 'transcribe',
      transcript: 'Meeting transcript',
      sourceLanguageId: 'auto',
    });
    expect(second.mode).toBe('translate');
    expect(getHistoryPrimaryText(second)).toBe('Hello');
    await expect(repository.listHistoryItems()).resolves.toEqual([second, first]);
  });

  it('updates visible text fields without changing hidden provider data', async () => {
    const repository = await createRepository();
    const item = await repository.createHistoryItem({
      mode: 'translate',
      primaryText: 'Hello',
      sourceText: 'Hola',
      sourceLanguageId: 'spanish',
      targetLanguageId: 'english',
      textModelId: 'openai/gpt-4.1-mini',
    });

    const updated = await repository.updateHistoryText(item.id, {
      primaryText: 'Good morning',
      sourceText: 'Buenos dias',
    });

    expect(updated).toMatchObject({
      id: item.id,
      mode: 'translate',
      transcript: 'Buenos dias',
      translatedText: 'Good morning',
      updatedAt: '2026-07-05T12:01:00.000Z',
    });
    await expect(repository.getHistoryItem(item.id)).resolves.toEqual(updated);
  });

  it('deletes one item and can delete all history items', async () => {
    const repository = await createRepository();
    const first = await repository.createHistoryItem({ primaryText: 'Keep for now' });
    const second = await repository.createHistoryItem({ primaryText: 'Delete later' });

    await repository.deleteHistoryItem(first.id);

    await expect(repository.getHistoryItem(first.id)).resolves.toBeNull();
    await expect(repository.listHistoryItems()).resolves.toEqual([second]);

    await repository.deleteAllHistoryItems();

    await expect(repository.listHistoryItems()).resolves.toEqual([]);
  });

  it('creates, finds, assigns, and removes normalized tags', async () => {
    const repository = await createRepository();
    const item = await repository.createHistoryItem({ primaryText: 'Tagged note' });

    const tag = await repository.createTag(' Work ');
    const duplicate = await repository.createTag('work');
    await repository.assignTag(item.id, 'work');

    expect(tag).toEqual({ id: 'tag-1', label: 'Work' });
    expect(duplicate).toEqual(tag);
    await expect(repository.findTag('WORK')).resolves.toEqual(tag);
    await expect(repository.getHistoryItem(item.id)).resolves.toMatchObject({
      tags: [tag],
    });

    await repository.removeTag(item.id, 'WORK');

    await expect(repository.getHistoryItem(item.id)).resolves.toMatchObject({
      tags: [],
    });
  });

  it('filters history by manually applied tag', async () => {
    const repository = await createRepository();
    const work = await repository.createHistoryItem({ primaryText: 'Work note', tags: ['work'] });
    await repository.createHistoryItem({ primaryText: 'Travel note', tags: ['travel'] });

    await expect(repository.listHistoryItems({ tag: 'work' })).resolves.toEqual([work]);
  });

  it('searches normalized text, language ids, and tag names', async () => {
    const repository = await createRepository();
    await repository.createHistoryItem({ primaryText: 'Meeting with Tarek', tags: ['work'] });
    await repository.createHistoryItem({
      primaryText: 'Spanish translation',
      sourceLanguageId: 'spanish',
      tags: ['travel'],
    });

    await expect(repository.searchHistory({ query: 'tarek' })).resolves.toHaveLength(1);
    await expect(repository.searchHistory({ query: 'TRAVEL' })).resolves.toHaveLength(1);
    await expect(repository.searchHistory({ query: 'spanish' })).resolves.toHaveLength(1);
    await expect(repository.searchHistory({ tag: 'travel' })).resolves.toHaveLength(1);
  });
});
