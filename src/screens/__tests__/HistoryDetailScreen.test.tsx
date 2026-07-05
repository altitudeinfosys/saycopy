import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { HistoryItem, Tag } from '../../domain/history';
import type {
  CreateHistoryItemInput,
  HistoryListOptions,
  HistoryRepository,
  HistorySearchOptions,
  UpdateHistoryTextInput,
} from '../../storage/sqlite/historyRepository';
import HistoryDetailScreen from '../HistoryDetailScreen';

class MemoryHistoryRepository implements HistoryRepository {
  private items: HistoryItem[];

  constructor(items: readonly HistoryItem[]) {
    this.items = [...items];
  }

  removeItem(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
  }

  createHistoryItem = jest.fn(async (_input: CreateHistoryItemInput): Promise<HistoryItem> => {
    throw new Error('Not needed in detail tests');
  });

  getHistoryItem = jest.fn(async (id: string): Promise<HistoryItem | null> => {
    return this.items.find((item) => item.id === id) ?? null;
  });

  listHistoryItems = jest.fn(async (_options?: HistoryListOptions): Promise<HistoryItem[]> => {
    return this.items;
  });

  updateHistoryText = jest.fn(
    async (id: string, input: UpdateHistoryTextInput): Promise<HistoryItem | null> => {
      const currentItem = this.items.find((item) => item.id === id);
      if (!currentItem) {
        return null;
      }

      const updatedAt = '2026-07-05T12:10:00.000Z';
      const updatedItem: HistoryItem =
        currentItem.mode === 'translate'
          ? {
              ...currentItem,
              transcript: input.sourceText ?? currentItem.transcript,
              translatedText:
                input.translatedText ?? input.primaryText ?? currentItem.translatedText,
              updatedAt,
            }
          : {
              ...currentItem,
              transcript: input.primaryText ?? currentItem.transcript,
              updatedAt,
            };

      this.items = this.items.map((item) => (item.id === id ? updatedItem : item));

      return updatedItem;
    },
  );

  deleteHistoryItem = jest.fn(async (): Promise<void> => undefined);
  deleteAllHistoryItems = jest.fn(async (): Promise<void> => undefined);
  createTag = jest.fn(async (name: string): Promise<Tag> => ({ id: name, label: name }));
  findTag = jest.fn(async (): Promise<Tag | null> => null);
  assignTag = jest.fn(async (_historyItemId: string, tagName: string): Promise<Tag> => ({
    id: tagName,
    label: tagName,
  }));
  removeTag = jest.fn(async (): Promise<void> => undefined);
  searchHistory = jest.fn(async (_options: HistorySearchOptions): Promise<HistoryItem[]> => {
    return this.items;
  });
}

describe('HistoryDetailScreen', () => {
  it('edits history text and uses the saved text as the source of truth', async () => {
    const repository = new MemoryHistoryRepository([
      {
        id: 'history-1',
        mode: 'translate',
        sourceType: 'manual',
        sourceLanguageId: 'spanish',
        targetLanguageId: 'english',
        transcript: 'Hola Tarek',
        translatedText: 'Hello Tarek',
        createdAt: '2026-07-05T12:00:00.000Z',
        updatedAt: '2026-07-05T12:00:00.000Z',
        tags: [{ id: 'tag-work', label: 'Work' }],
      },
    ]);

    render(<HistoryDetailScreen repository={repository} historyItemId="history-1" />);

    const editor = await screen.findByLabelText('History text');
    expect(editor.props.value).toBe('Hello Tarek');

    fireEvent.changeText(editor, 'Hello Tarek, edited');
    fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(async () => {
      expect(repository.updateHistoryText).toHaveBeenCalledWith('history-1', {
        primaryText: 'Hello Tarek, edited',
      });
      await expect(repository.getHistoryItem('history-1')).resolves.toMatchObject({
        translatedText: 'Hello Tarek, edited',
      });
      expect(screen.getByLabelText('History text').props.value).toBe('Hello Tarek, edited');
      expect(screen.getByText('Saved changes')).toBeTruthy();
    });
  });

  it('renders the not-found state when saving an item that was deleted', async () => {
    const repository = new MemoryHistoryRepository([
      {
        id: 'history-1',
        mode: 'transcribe',
        sourceType: 'manual',
        sourceLanguageId: 'auto',
        transcript: 'Soon to be deleted',
        createdAt: '2026-07-05T12:00:00.000Z',
        updatedAt: '2026-07-05T12:00:00.000Z',
        tags: [],
      },
    ]);

    render(<HistoryDetailScreen repository={repository} historyItemId="history-1" />);

    const editor = await screen.findByLabelText('History text');
    expect(editor.props.value).toBe('Soon to be deleted');

    repository.removeItem('history-1');
    fireEvent.changeText(editor, 'Edited after delete');
    fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(screen.getByText('History item not found')).toBeTruthy();
      expect(screen.getByText('This history item no longer exists.')).toBeTruthy();
      expect(screen.queryByLabelText('History text')).toBeNull();
    });
  });
});
