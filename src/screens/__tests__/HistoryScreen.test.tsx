import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { getHistoryPrimaryText, type HistoryItem, type Tag } from '../../domain/history';
import type {
  CreateHistoryItemInput,
  HistoryListOptions,
  HistoryRepository,
  HistorySearchOptions,
  UpdateHistoryTextInput,
} from '../../storage/sqlite/historyRepository';
import HistoryScreen from '../HistoryScreen';

function createHistoryItem(input: {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly tags?: readonly Tag[];
}): HistoryItem {
  return {
    id: input.id,
    mode: 'transcribe',
    sourceType: 'manual',
    sourceLanguageId: 'auto',
    transcript: input.text,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    tags: input.tags ?? [],
  };
}

class MemoryHistoryRepository implements HistoryRepository {
  private items: HistoryItem[];

  constructor(items: readonly HistoryItem[]) {
    this.items = [...items];
  }

  createHistoryItem = jest.fn(async (_input: CreateHistoryItemInput): Promise<HistoryItem> => {
    throw new Error('Not needed in screen tests');
  });

  getHistoryItem = jest.fn(async (id: string): Promise<HistoryItem | null> => {
    return this.items.find((item) => item.id === id) ?? null;
  });

  listHistoryItems = jest.fn(async (options?: HistoryListOptions): Promise<HistoryItem[]> => {
    return this.filterItems({ tag: options?.tag });
  });

  updateHistoryText = jest.fn(
    async (id: string, input: UpdateHistoryTextInput): Promise<HistoryItem | null> => {
      const currentItem = this.items.find((item) => item.id === id);
      if (!currentItem) {
        return null;
      }

      const updatedItem: HistoryItem =
        currentItem.mode === 'translate'
          ? {
              ...currentItem,
              transcript: input.sourceText ?? currentItem.transcript,
              translatedText:
                input.translatedText ?? input.primaryText ?? currentItem.translatedText,
              updatedAt: '2026-07-05T12:10:00.000Z',
            }
          : {
              ...currentItem,
              transcript: input.primaryText ?? currentItem.transcript,
              updatedAt: '2026-07-05T12:10:00.000Z',
            };

      this.items = this.items.map((item) => (item.id === id ? updatedItem : item));

      return updatedItem;
    },
  );

  deleteHistoryItem = jest.fn(async (id: string): Promise<void> => {
    this.items = this.items.filter((item) => item.id !== id);
  });

  deleteAllHistoryItems = jest.fn(async (): Promise<void> => {
    this.items = [];
  });

  createTag = jest.fn(async (name: string): Promise<Tag> => {
    return { id: name.toLowerCase(), label: name };
  });

  findTag = jest.fn(async (name: string): Promise<Tag | null> => {
    const normalizedName = name.toLowerCase();
    return (
      this.items
        .flatMap((item) => item.tags ?? [])
        .find((tag) => tag.label.toLowerCase() === normalizedName) ?? null
    );
  });

  assignTag = jest.fn(async (_historyItemId: string, tagName: string): Promise<Tag> => {
    return { id: tagName.toLowerCase(), label: tagName };
  });

  removeTag = jest.fn(async (): Promise<void> => undefined);

  searchHistory = jest.fn(async (options: HistorySearchOptions): Promise<HistoryItem[]> => {
    return this.filterItems(options);
  });

  private filterItems(options: HistorySearchOptions): HistoryItem[] {
    const query = options.query?.trim().toLowerCase() ?? '';
    const tag = options.tag?.trim().toLowerCase();

    return this.items.filter((item) => {
      const tagLabels = (item.tags ?? []).map((itemTag) => itemTag.label.toLowerCase());
      const matchesTag = tag ? tagLabels.includes(tag) : true;
      const searchableText = [
        getHistoryPrimaryText(item),
        item.mode === 'translate' ? item.transcript : '',
        ...tagLabels,
      ]
        .join(' ')
        .toLowerCase();
      const matchesQuery = query ? searchableText.includes(query) : true;

      return matchesTag && matchesQuery;
    });
  }
}

const workTag = { id: 'tag-work', label: 'Work' } satisfies Tag;
const travelTag = { id: 'tag-travel', label: 'Travel' } satisfies Tag;

describe('HistoryScreen', () => {
  it('shows an empty state when no history exists', async () => {
    const repository = new MemoryHistoryRepository([]);

    render(<HistoryScreen repository={repository} />);

    expect(await screen.findByText('No saved history yet')).toBeTruthy();
    expect(screen.getByText('Record or translate something to see it here.')).toBeTruthy();
    expect(repository.listHistoryItems).toHaveBeenCalled();
  });

  it('shows populated history newest first and opens an item', async () => {
    const onOpenItem = jest.fn();
    const repository = new MemoryHistoryRepository([
      createHistoryItem({
        id: 'history-1',
        text: 'Older meeting transcript',
        createdAt: '2026-07-05T12:00:00.000Z',
        tags: [workTag],
      }),
      createHistoryItem({
        id: 'history-2',
        text: 'Newer travel notes',
        createdAt: '2026-07-05T12:01:00.000Z',
        tags: [travelTag],
      }),
    ]);

    render(<HistoryScreen repository={repository} onOpenItem={onOpenItem} />);

    expect(await screen.findByText('Newer travel notes')).toBeTruthy();
    expect(screen.getByText('Older meeting transcript')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Open Newer travel notes' }));

    expect(onOpenItem).toHaveBeenCalledWith('history-2');
  });

  it('filters history with basic text search', async () => {
    const repository = new MemoryHistoryRepository([
      createHistoryItem({
        id: 'history-1',
        text: 'Pricing discussion with the client',
        createdAt: '2026-07-05T12:00:00.000Z',
        tags: [workTag],
      }),
      createHistoryItem({
        id: 'history-2',
        text: 'Travel itinerary in Arabic',
        createdAt: '2026-07-05T12:01:00.000Z',
        tags: [travelTag],
      }),
    ]);

    render(<HistoryScreen repository={repository} />);
    expect(await screen.findByText('Travel itinerary in Arabic')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Search history'), 'pricing');

    await waitFor(() => {
      expect(screen.getByText('Pricing discussion with the client')).toBeTruthy();
      expect(screen.queryByText('Travel itinerary in Arabic')).toBeNull();
    });
    expect(repository.searchHistory).toHaveBeenLastCalledWith({ query: 'pricing', tag: undefined });
  });

  it('shows a filtered empty state when search has no matches but history exists', async () => {
    const repository = new MemoryHistoryRepository([
      createHistoryItem({
        id: 'history-1',
        text: 'Pricing discussion with the client',
        createdAt: '2026-07-05T12:00:00.000Z',
        tags: [workTag],
      }),
    ]);

    render(<HistoryScreen repository={repository} />);
    expect(await screen.findByText('Pricing discussion with the client')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Search history'), 'no matching result');

    await waitFor(() => {
      expect(screen.getByText('No matching history')).toBeTruthy();
      expect(screen.getByText('Try a different search or tag filter.')).toBeTruthy();
      expect(screen.queryByText('No saved history yet')).toBeNull();
    });
  });

  it('filters history by tag', async () => {
    const repository = new MemoryHistoryRepository([
      createHistoryItem({
        id: 'history-1',
        text: 'Work follow-up',
        createdAt: '2026-07-05T12:00:00.000Z',
        tags: [workTag],
      }),
      createHistoryItem({
        id: 'history-2',
        text: 'Vacation phrase',
        createdAt: '2026-07-05T12:01:00.000Z',
        tags: [travelTag],
      }),
    ]);

    render(<HistoryScreen repository={repository} />);
    expect(await screen.findByText('Vacation phrase')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Filter by Work' }));

    await waitFor(() => {
      expect(screen.getByText('Work follow-up')).toBeTruthy();
      expect(screen.queryByText('Vacation phrase')).toBeNull();
    });
    expect(repository.searchHistory).toHaveBeenLastCalledWith({ query: '', tag: 'Work' });
  });

  it('deletes a history item and refreshes the list', async () => {
    const repository = new MemoryHistoryRepository([
      createHistoryItem({
        id: 'history-1',
        text: 'Delete this note',
        createdAt: '2026-07-05T12:00:00.000Z',
      }),
      createHistoryItem({
        id: 'history-2',
        text: 'Keep this note',
        createdAt: '2026-07-05T12:01:00.000Z',
      }),
    ]);

    render(<HistoryScreen repository={repository} />);
    expect(await screen.findByText('Delete this note')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Delete Delete this note' }));

    await waitFor(() => {
      expect(repository.deleteHistoryItem).toHaveBeenCalledWith('history-1');
      expect(screen.queryByText('Delete this note')).toBeNull();
      expect(screen.getByText('Keep this note')).toBeTruthy();
    });
  });

  it('refreshes the list preview after saving edits in detail and returning', async () => {
    const repository = new MemoryHistoryRepository([
      createHistoryItem({
        id: 'history-1',
        text: 'Original preview text',
        createdAt: '2026-07-05T12:00:00.000Z',
      }),
    ]);

    render(<HistoryScreen repository={repository} />);
    expect(await screen.findByText('Original preview text')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Open Original preview text' }));

    const editor = await screen.findByLabelText('History text');
    fireEvent.changeText(editor, 'Edited preview text');
    fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Saved changes')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Back to history' }));

    await waitFor(() => {
      expect(screen.getByText('Edited preview text')).toBeTruthy();
      expect(screen.queryByText('Original preview text')).toBeNull();
    });
  });
});
