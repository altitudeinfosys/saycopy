import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getHistoryPrimaryText, type HistoryItem, type Tag } from '../domain/history';
import type { HistoryRepository } from '../storage/sqlite/historyRepository';
import HistoryDetailScreen from './HistoryDetailScreen';

type HistoryScreenProps = {
  readonly repository: HistoryRepository;
  readonly onOpenItem?: (historyItemId: string) => void;
};

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function getUniqueTags(items: readonly HistoryItem[]): Tag[] {
  const tagsByLabel = new Map<string, Tag>();

  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const normalizedLabel = tag.label.trim().toLowerCase();
      if (normalizedLabel && !tagsByLabel.has(normalizedLabel)) {
        tagsByLabel.set(normalizedLabel, tag);
      }
    }
  }

  return [...tagsByLabel.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function formatModeLabel(item: HistoryItem): string {
  return item.mode === 'translate' ? 'Translate' : 'Transcribe';
}

async function readHistoryItems(
  repository: HistoryRepository,
  query: string,
  selectedTag: string | undefined,
): Promise<{
  readonly allItems: HistoryItem[];
  readonly visibleItems: HistoryItem[];
}> {
  const trimmedQuery = query.trim();
  const allItems = await repository.listHistoryItems();
  const visibleItems =
    trimmedQuery || selectedTag
      ? await repository.searchHistory({
          query: trimmedQuery,
          tag: selectedTag,
        })
      : allItems;

  return { allItems, visibleItems };
}

export default function HistoryScreen({ repository, onOpenItem }: HistoryScreenProps) {
  const [allItems, setAllItems] = useState<HistoryItem[]>([]);
  const [visibleItems, setVisibleItems] = useState<HistoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | undefined>(undefined);
  const [selectedHistoryItemId, setSelectedHistoryItemId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  const tags = useMemo(() => getUniqueTags(allItems), [allItems]);

  const loadHistoryItems = useCallback(async () => {
    setErrorText('');
    setIsLoading(true);

    try {
      const loadedItems = await readHistoryItems(repository, query, selectedTag);
      setAllItems(loadedItems.allItems);
      setVisibleItems(loadedItems.visibleItems);
    } catch {
      setErrorText('Could not load history.');
    } finally {
      setIsLoading(false);
    }
  }, [query, repository, selectedTag]);

  useEffect(() => {
    let isActive = true;

    async function loadInitialHistoryItems() {
      try {
        const loadedItems = await readHistoryItems(repository, query, selectedTag);
        if (!isActive) {
          return;
        }

        setAllItems(loadedItems.allItems);
        setVisibleItems(loadedItems.visibleItems);
        setErrorText('');
      } catch {
        if (isActive) {
          setErrorText('Could not load history.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialHistoryItems();

    return () => {
      isActive = false;
    };
  }, [query, repository, selectedTag]);

  function handleOpenItem(item: HistoryItem) {
    if (onOpenItem) {
      onOpenItem(item.id);
      return;
    }

    setSelectedHistoryItemId(item.id);
  }

  async function handleDeleteItem(item: HistoryItem) {
    setErrorText('');

    try {
      await repository.deleteHistoryItem(item.id);
      await loadHistoryItems();
    } catch {
      setErrorText('Could not delete this history item.');
    }
  }

  if (selectedHistoryItemId && !onOpenItem) {
    return (
      <HistoryDetailScreen
        historyItemId={selectedHistoryItemId}
        onBack={() => {
          setSelectedHistoryItemId(null);
          void loadHistoryItems();
        }}
        repository={repository}
      />
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>History</Text>
          <Text style={styles.screenStatus}>
            {allItems.length === 1 ? '1 saved item' : `${allItems.length} saved items`}
          </Text>
        </View>
      </View>

      <TextInput
        accessibilityLabel="Search history"
        autoCapitalize="none"
        onChangeText={(nextQuery) => {
          setIsLoading(true);
          setQuery(nextQuery);
        }}
        placeholder="Search history"
        placeholderTextColor="#94A3B8"
        style={styles.searchInput}
        value={query}
      />

      {tags.length > 0 ? (
        <View style={styles.filterRow}>
          {selectedTag ? (
            <Pressable
              accessibilityLabel="Clear tag filter"
              accessibilityRole="button"
              onPress={() => {
                setIsLoading(true);
                setSelectedTag(undefined);
              }}
              style={styles.clearFilterButton}
            >
              <Text style={styles.clearFilterText}>All</Text>
            </Pressable>
          ) : null}
          {tags.map((tag) => {
            const selected = selectedTag === tag.label;

            return (
              <Pressable
                key={tag.id}
                accessibilityLabel={`Filter by ${tag.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setIsLoading(true);
                  setSelectedTag(selected ? undefined : tag.label);
                }}
                style={[styles.filterButton, selected && styles.filterButtonSelected]}
              >
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                  {tag.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      {isLoading ? <Text style={styles.loadingText}>Loading history</Text> : null}

      {!isLoading && visibleItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No saved history yet</Text>
          <Text style={styles.emptyCopy}>Record or translate something to see it here.</Text>
        </View>
      ) : null}

      {!isLoading && visibleItems.length > 0 ? (
        <View style={styles.list}>
          {visibleItems.map((item) => {
            const primaryText = getHistoryPrimaryText(item);

            return (
              <View key={item.id} style={styles.historyItem}>
                <Pressable
                  accessibilityLabel={`Open ${primaryText}`}
                  accessibilityRole="button"
                  onPress={() => handleOpenItem(item)}
                  style={styles.itemBody}
                >
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemMode}>{formatModeLabel(item)}</Text>
                    <Text style={styles.itemDate}>{formatDateLabel(item.updatedAt ?? item.createdAt)}</Text>
                  </View>
                  <Text numberOfLines={3} style={styles.itemText}>
                    {primaryText}
                  </Text>
                  {item.tags && item.tags.length > 0 ? (
                    <View style={styles.tagRow}>
                      {item.tags.map((tag) => (
                        <View key={tag.id} style={styles.itemTag}>
                          <Text style={styles.itemTagText}>{tag.label}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityLabel={`Delete ${primaryText}`}
                  accessibilityRole="button"
                  onPress={() => void handleDeleteItem(item)}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  screenTitle: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '800',
  },
  screenStatus: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 12,
    borderWidth: 1,
    color: '#0F172A',
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  clearFilterButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  clearFilterText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#FED7AA',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  filterButtonSelected: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FB923C',
  },
  filterText: {
    color: '#9A3412',
    fontSize: 13,
    fontWeight: '800',
  },
  filterTextSelected: {
    color: '#7C2D12',
  },
  list: {
    gap: 12,
  },
  historyItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  itemBody: {
    gap: 10,
  },
  itemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemMode: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  itemDate: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  itemText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemTag: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  itemTagText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
  },
  deleteButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#FECACA',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  deleteButtonText: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '800',
  },
  loadingText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 24,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyCopy: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '800',
  },
});
