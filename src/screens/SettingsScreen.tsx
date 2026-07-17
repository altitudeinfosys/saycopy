import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HISTORY_MODES, type HistoryMode } from '../domain/history';
import {
  LANGUAGE_OPTIONS,
  type ConcreteLanguageId,
  type LanguageId,
  type LanguageOption,
} from '../domain/languages';
import {
  DEFAULT_MODEL_PRESET_ID,
  DEFAULT_TRANSCRIPTION_MODEL_ID,
  MODEL_PRESETS,
  TRANSCRIPTION_MODEL_RECOMMENDATIONS,
  type ModelPresetId,
} from '../domain/modelPresets';
import {
  getTranscriptionLanguageBadge,
  getTranscriptionLanguageSupport,
  isKnownCompatibleTranscriptionModel,
  resolveTranscriptionModelId,
} from '../domain/transcriptionModelLanguages';
import {
  createOpenRouterModelCatalog,
  type OpenRouterCatalogModel,
  type OpenRouterModelCatalog,
} from '../providers/openRouter/modelCatalog';
import type { SecureTokenStore, TokenStatus } from '../storage/secureTokenStore';
import type { AppSettings, SettingsRepository } from '../storage/settingsRepository';

type SettingsScreenProps = {
  readonly settingsRepository: SettingsRepository;
  readonly tokenStore: SecureTokenStore;
  readonly modelCatalog?: OpenRouterModelCatalog;
  readonly openExternalUrl?: (url: string) => Promise<unknown>;
};

const SAYCOPY_LINKS = {
  setup: 'https://saycopy.app/setup',
  privacy: 'https://saycopy.app/privacy',
  support: 'https://saycopy.app/support',
} as const;

type OptionButtonProps<TValue extends string> = {
  readonly accessibilityLabel: string;
  readonly label: string;
  readonly value: TValue;
  readonly selected: boolean;
  readonly onSelect: (value: TValue) => void;
};

function OptionButton<TValue extends string>({
  accessibilityLabel,
  label,
  value,
  selected,
  onSelect,
}: OptionButtonProps<TValue>) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSelect(value)}
      style={[styles.optionButton, selected && styles.optionButtonSelected]}
    >
      <Text style={[styles.optionButtonText, selected && styles.optionButtonTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function getModeLabel(mode: HistoryMode): string {
  return mode === 'translate' ? 'Translate' : 'Transcribe';
}

function isConcreteLanguageOption(
  language: LanguageOption,
): language is LanguageOption & { readonly id: ConcreteLanguageId } {
  return language.id !== 'auto';
}

function pickSettings(
  settings: AppSettings,
  settingKeys: readonly (keyof AppSettings)[],
): Partial<AppSettings> {
  const pickedSettings: Partial<AppSettings> = {};

  for (const settingKey of settingKeys) {
    Object.assign(pickedSettings, { [settingKey]: settings[settingKey] });
  }

  return pickedSettings;
}

function filterCatalogModels(
  models: readonly OpenRouterCatalogModel[],
  query: string,
): readonly OpenRouterCatalogModel[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return models.slice(0, 80);
  }

  return models
    .filter(
      (model) =>
        model.id.toLowerCase().includes(normalizedQuery) ||
        model.name.toLowerCase().includes(normalizedQuery),
    )
    .slice(0, 80);
}

function getLanguageLabel(languageId: LanguageId): string {
  return LANGUAGE_OPTIONS.find((language) => language.id === languageId)?.label ?? 'Auto-detect';
}

type CatalogPickerModalProps = {
  readonly emptyText: string;
  readonly isLoading: boolean;
  readonly loadingText: string;
  readonly models: readonly OpenRouterCatalogModel[];
  readonly onChangeQuery: (query: string) => void;
  readonly onClose: () => void;
  readonly onSelectModel: (modelId: string) => void;
  readonly query: string;
  readonly renderBadge?: (modelId: string) => string;
  readonly searchAccessibilityLabel: string;
  readonly selectedModelId: string;
  readonly title: string;
  readonly visible: boolean;
};

function CatalogPickerModal({
  emptyText,
  isLoading,
  loadingText,
  models,
  onChangeQuery,
  onClose,
  onSelectModel,
  query,
  renderBadge,
  searchAccessibilityLabel,
  selectedModelId,
  title,
  visible,
}: CatalogPickerModalProps) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView
        edges={['top', 'bottom']}
        style={styles.pickerModalScreen}
        testID="model-picker-safe-area"
      >
        <View style={styles.pickerModalHeader}>
          <Pressable
            accessibilityLabel={`Close ${title}`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={styles.pickerCloseButton}
          >
            <Text style={styles.catalogToggleButtonText}>Close</Text>
          </Pressable>
          <Text style={[styles.sectionTitle, styles.pickerModalTitle]}>{title}</Text>
        </View>
        <TextInput
          accessibilityLabel={searchAccessibilityLabel}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onChangeQuery}
          placeholder="Search provider or model"
          placeholderTextColor="#94A3B8"
          style={styles.tokenInput}
          value={query}
        />
        {isLoading ? (
          <Text accessibilityLiveRegion="polite" style={styles.modelHelp}>
            {loadingText}
          </Text>
        ) : (
          <FlatList
            contentContainerStyle={styles.pickerModalList}
            data={models}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(model) => model.id}
            ListEmptyComponent={
              <Text accessibilityLiveRegion="polite" style={styles.modelHelp}>
                {emptyText}
              </Text>
            }
            renderItem={({ item: model }) => {
              const isSelected = selectedModelId === model.id;
              const badge = renderBadge?.(model.id);

              return (
                <Pressable
                  accessibilityLabel={`${title} ${model.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => onSelectModel(model.id)}
                  style={[styles.catalogModelRow, isSelected && styles.modelRowSelected]}
                >
                  <Text style={styles.modelLabel}>{model.name}</Text>
                  <Text style={styles.modelId}>{model.id}</Text>
                  {badge ? <Text style={styles.languageBadge}>{badge}</Text> : null}
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

export default function SettingsScreen({
  modelCatalog = createOpenRouterModelCatalog(),
  openExternalUrl = Linking.openURL,
  settingsRepository,
  tokenStore,
}: SettingsScreenProps) {
  const settingsRef = useRef<AppSettings | null>(null);
  const settingsSaveRequestIdRef = useRef(0);
  const latestSettingRequestIdsRef = useRef<Partial<Record<keyof AppSettings, number>>>({});
  const tokenUpdateInFlightRef = useRef(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [transcriptionModelInput, setTranscriptionModelInput] = useState('');
  const [transcriptionCatalogModels, setTranscriptionCatalogModels] = useState<
    readonly OpenRouterCatalogModel[]
  >([]);
  const [transcriptionModelQuery, setTranscriptionModelQuery] = useState('');
  const [isTranscriptionModelPickerOpen, setIsTranscriptionModelPickerOpen] = useState(false);
  const [isTranscriptionCatalogLoading, setIsTranscriptionCatalogLoading] = useState(false);
  const [translationCatalogModels, setTranslationCatalogModels] = useState<
    readonly OpenRouterCatalogModel[]
  >([]);
  const [translationModelQuery, setTranslationModelQuery] = useState('');
  const [isTranslationModelPickerOpen, setIsTranslationModelPickerOpen] = useState(false);
  const [isTranslationCatalogLoading, setIsTranslationCatalogLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTokenUpdatePending, setIsTokenUpdatePending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [transcriptionModelSaveMessage, setTranscriptionModelSaveMessage] = useState('');
  const [textModelSaveMessage, setTextModelSaveMessage] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadSettings() {
      try {
        const [loadedSettings, loadedTokenStatus] = await Promise.all([
          settingsRepository.getSettings(),
          tokenStore.getTokenStatus(),
        ]);
        if (!isActive) {
          return;
        }

        setSettings(loadedSettings);
        settingsRef.current = loadedSettings;
        setCustomModelInput(loadedSettings.customModelId);
        setTranscriptionModelInput(loadedSettings.transcriptionModelId);
        setTokenStatus(loadedTokenStatus);
        setErrorText('');
      } catch {
        if (isActive) {
          setErrorText('Could not load settings.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      isActive = false;
    };
  }, [settingsRepository, tokenStore]);

  async function refreshTokenStatus() {
    setTokenStatus(await tokenStore.getTokenStatus());
  }

  async function runTokenOperation(operation: () => Promise<void>, successMessage: string) {
    if (tokenUpdateInFlightRef.current) {
      return;
    }

    tokenUpdateInFlightRef.current = true;
    setIsTokenUpdatePending(true);
    setMessageText('');
    setErrorText('');

    try {
      await operation();
      setMessageText(successMessage);
    } catch {
      setErrorText('Could not update token.');
    } finally {
      tokenUpdateInFlightRef.current = false;
      setIsTokenUpdatePending(false);
    }
  }

  async function handleSaveToken() {
    await runTokenOperation(async () => {
      await tokenStore.setToken(tokenInput);
      setTokenInput('');
      await refreshTokenStatus();
    }, 'Token settings saved');
  }

  async function handleClearToken() {
    await runTokenOperation(async () => {
      await tokenStore.clearToken();
      setTokenInput('');
      await refreshTokenStatus();
    }, 'Token cleared');
  }

  async function handleSaveCustomModel() {
    const customModelId = customModelInput.trim();
    setCustomModelInput(customModelId);
    setTextModelSaveMessage('');
    Keyboard.dismiss();
    if (await saveSetting({ customModelId })) {
      setTextModelSaveMessage('Custom text model saved');
    }
  }

  async function handleUseRecommendedPreset() {
    setCustomModelInput('');
    await saveSetting({ customModelId: '' });
  }

  async function handleUseRecommendedModelDefaults() {
    setTranscriptionModelInput(DEFAULT_TRANSCRIPTION_MODEL_ID);
    setCustomModelInput('');
    setTranscriptionModelQuery('');
    setTranslationModelQuery('');
    setIsTranscriptionModelPickerOpen(false);
    setIsTranslationModelPickerOpen(false);
    await saveSetting({
      transcriptionModelId: DEFAULT_TRANSCRIPTION_MODEL_ID,
      customModelId: '',
      modelPresetId: DEFAULT_MODEL_PRESET_ID,
    });
  }

  async function handleSaveTranscriptionModel() {
    const transcriptionModelId = transcriptionModelInput.trim();
    setTranscriptionModelInput(transcriptionModelId);
    setTranscriptionModelSaveMessage('');
    Keyboard.dismiss();

    if (!transcriptionModelId) {
      setErrorText('Enter an OpenRouter transcription model ID.');
      return;
    }

    const sourceLanguageId = settingsRef.current?.sourceLanguageId ?? 'auto';
    if (!isKnownCompatibleTranscriptionModel(transcriptionModelId, sourceLanguageId)) {
      const message =
        sourceLanguageId === 'auto'
          ? `${transcriptionModelId} is not verified for automatic English, Spanish, and Arabic detection. Choose a language or an Auto-compatible model.`
          : `${transcriptionModelId} does not support ${getLanguageLabel(sourceLanguageId)}. Choose another transcription model.`;
      setErrorText(
        message,
      );
      return;
    }

    if (await saveSetting({ transcriptionModelId })) {
      setTranscriptionModelSaveMessage('Transcription model saved');
    }
  }

  async function handleSelectTranscriptionModel(transcriptionModelId: string) {
    setTranscriptionModelInput(transcriptionModelId);
    await saveSetting({ transcriptionModelId });
  }

  async function handleToggleTranscriptionModelPicker() {
    const shouldOpen = !isTranscriptionModelPickerOpen;
    setIsTranscriptionModelPickerOpen(shouldOpen);
    setIsTranslationModelPickerOpen(false);

    if (!shouldOpen || transcriptionCatalogModels.length > 0 || isTranscriptionCatalogLoading) {
      return;
    }

    setIsTranscriptionCatalogLoading(true);
    setErrorText('');
    try {
      setTranscriptionCatalogModels(await modelCatalog.listTranscriptionModels());
    } catch {
      setErrorText('Could not load OpenRouter transcription models.');
      setIsTranscriptionModelPickerOpen(false);
    } finally {
      setIsTranscriptionCatalogLoading(false);
    }
  }

  async function handleSelectTranscriptionCatalogModel(modelId: string) {
    setTranscriptionModelInput(modelId);
    setTranscriptionModelQuery('');
    setIsTranscriptionModelPickerOpen(false);
    await saveSetting({ transcriptionModelId: modelId });
  }

  async function handleSelectRecommendedModel(modelPresetId: ModelPresetId) {
    setCustomModelInput('');
    await saveSetting({ customModelId: '', modelPresetId });
  }

  async function handleSelectSourceLanguage(sourceLanguageId: LanguageId) {
    await saveSetting({ sourceLanguageId });
  }

  async function handleToggleTranslationModelPicker() {
    const shouldOpen = !isTranslationModelPickerOpen;
    setIsTranslationModelPickerOpen(shouldOpen);
    setIsTranscriptionModelPickerOpen(false);

    if (!shouldOpen || translationCatalogModels.length > 0 || isTranslationCatalogLoading) {
      return;
    }

    setIsTranslationCatalogLoading(true);
    setErrorText('');
    try {
      setTranslationCatalogModels(await modelCatalog.listTextModels());
    } catch {
      setErrorText('Could not load OpenRouter models.');
      setIsTranslationModelPickerOpen(false);
    } finally {
      setIsTranslationCatalogLoading(false);
    }
  }

  async function handleSelectTranslationCatalogModel(modelId: string) {
    setCustomModelInput(modelId);
    setTranslationModelQuery('');
    setIsTranslationModelPickerOpen(false);
    await saveSetting({ customModelId: modelId });
  }

  async function handleOpenExternalUrl(url: string) {
    setErrorText('');

    try {
      await openExternalUrl(url);
    } catch {
      setErrorText('Could not open the SayCopy website.');
    }
  }

  async function saveSetting(nextSettings: Partial<AppSettings>): Promise<boolean> {
    const currentSettings = settingsRef.current;
    if (!currentSettings) {
      return false;
    }

    setMessageText('');
    setErrorText('');
    const settingKeys = Object.keys(nextSettings) as (keyof AppSettings)[];
    const rollbackSettings = pickSettings(currentSettings, settingKeys);
    settingsSaveRequestIdRef.current += 1;
    const requestId = settingsSaveRequestIdRef.current;
    for (const settingKey of settingKeys) {
      latestSettingRequestIdsRef.current[settingKey] = requestId;
    }

    const optimisticSettings = { ...currentSettings, ...nextSettings };
    settingsRef.current = optimisticSettings;
    setSettings(optimisticSettings);

    try {
      await settingsRepository.saveSettings(nextSettings);
      setMessageText('Default settings saved');
      return true;
    } catch {
      const latestSettings = settingsRef.current;
      const rollbackKeys = settingKeys.filter(
        (settingKey) => latestSettingRequestIdsRef.current[settingKey] === requestId,
      );

      if (latestSettings && rollbackKeys.length > 0) {
        const rolledBackSettings = { ...latestSettings };
        for (const settingKey of rollbackKeys) {
          Object.assign(rolledBackSettings, { [settingKey]: rollbackSettings[settingKey] });
        }
        settingsRef.current = rolledBackSettings;
        setSettings(rolledBackSettings);
      }
      setErrorText('Could not save settings.');
      return false;
    }
  }

  const visibleTranslationCatalogModels = useMemo(() => {
    return filterCatalogModels(translationCatalogModels, translationModelQuery);
  }, [translationCatalogModels, translationModelQuery]);

  const selectedSourceLanguageId = settings?.sourceLanguageId ?? 'auto';
  const visibleTranscriptionCatalogModels = useMemo(() => {
    return filterCatalogModels(
      transcriptionCatalogModels.filter((model) =>
        isKnownCompatibleTranscriptionModel(model.id, selectedSourceLanguageId),
      ),
      transcriptionModelQuery,
    );
  }, [selectedSourceLanguageId, transcriptionCatalogModels, transcriptionModelQuery]);

  if (isLoading || !settings || !tokenStatus) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateTitle}>Loading settings</Text>
      </View>
    );
  }

  const selectedPreset = MODEL_PRESETS.find((preset) => preset.id === settings.modelPresetId);
  const effectiveTranscriptionModelId = resolveTranscriptionModelId(
    settings.transcriptionModelId,
    settings.sourceLanguageId,
  );
  const selectedTranscriptionSupport = getTranscriptionLanguageSupport(
    effectiveTranscriptionModelId,
    settings.sourceLanguageId,
  );
  const selectedTextModelId =
    settings.customModelId ||
    selectedPreset?.currentModelCandidate ||
    MODEL_PRESETS[1].currentModelCandidate;

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.content}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
    >
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Settings</Text>
        <Text style={styles.screenStatus}>Local defaults and token storage</Text>
      </View>

      <View style={styles.surface}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>OpenRouter token</Text>
          <View style={[styles.statusPill, tokenStatus.hasToken && styles.statusPillSaved]}>
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.statusText, tokenStatus.hasToken && styles.statusTextSaved]}
            >
              {tokenStatus.statusText}
            </Text>
          </View>
        </View>

        <TextInput
          accessibilityLabel="OpenRouter API token"
          accessibilityState={{ disabled: isTokenUpdatePending }}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isTokenUpdatePending}
          onChangeText={setTokenInput}
          placeholder="Paste token"
          placeholderTextColor="#94A3B8"
          secureTextEntry
          style={styles.tokenInput}
          value={tokenInput}
        />

        <View style={styles.buttonRow}>
          <Pressable
            accessibilityLabel="Save token"
            accessibilityRole="button"
            accessibilityState={{ disabled: isTokenUpdatePending }}
            disabled={isTokenUpdatePending}
            onPress={() => void handleSaveToken()}
            style={[styles.primaryButton, isTokenUpdatePending && styles.buttonDisabled]}
          >
            <Text style={styles.primaryButtonText}>Save token</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Clear token"
            accessibilityRole="button"
            accessibilityState={{ disabled: isTokenUpdatePending }}
            disabled={isTokenUpdatePending}
            onPress={() => void handleClearToken()}
            style={[styles.secondaryButton, isTokenUpdatePending && styles.buttonDisabled]}
          >
            <Text style={styles.secondaryButtonText}>Clear token</Text>
          </Pressable>
        </View>

        <Text style={styles.privacyNote}>
          Your API key is stored securely on this device. Recordings and text are sent to
          OpenRouter and eligible model providers only for processing, with zero-data-retention
          routing required.
        </Text>
        <Pressable
          accessibilityLabel="Open SayCopy setup guide"
          accessibilityRole="link"
          onPress={() => void handleOpenExternalUrl(SAYCOPY_LINKS.setup)}
          style={styles.resourceLink}
        >
          <Text style={styles.resourceLinkText}>OpenRouter setup guide</Text>
        </Pressable>
      </View>

      <View style={styles.surface}>
        <Text style={styles.sectionTitle}>AI model choices</Text>
        <Text style={styles.privacyNote}>
          Voice recordings use two separate steps: speech-to-text first, then optional text
          processing for cleanup or translation. Choose one model for each step.
        </Text>
        <Pressable
          accessibilityLabel="Use recommended model defaults"
          accessibilityRole="button"
          onPress={() => void handleUseRecommendedModelDefaults()}
          style={[styles.secondaryButton, styles.fullWidthButton]}
        >
          <Text style={styles.secondaryButtonText}>Use recommended defaults</Text>
        </Pressable>
      </View>

      <View style={styles.surface}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionTitle}>1. Speech-to-text model</Text>
            <Text style={styles.sectionSubtitle}>
              Preferred: {settings.transcriptionModelId}
            </Text>
            {settings.sourceLanguageId === 'auto' ? (
              <Text style={styles.sectionSubtitle}>
                Auto engine: {effectiveTranscriptionModelId}
              </Text>
            ) : null}
          </View>
        </View>
        <Text style={styles.modelHelp}>
          Converts voice recordings into raw text in both Transcribe and Translate modes. This
          choice is independent from the text-processing preset below.
        </Text>
        <Text style={styles.modelHelp}>
          Checking compatibility for: {getLanguageLabel(settings.sourceLanguageId)}
        </Text>
        {settings.sourceLanguageId === 'auto' ? (
          <Text style={styles.modelHelp}>
            Auto-detect uses GPT-4o Transcribe so the detected language is preserved instead of
            translated into English. Your preferred model stays saved and is used when you select
            a language.
          </Text>
        ) : null}
        {selectedTranscriptionSupport === 'unsupported' ? (
          <Text accessibilityRole="alert" style={styles.warningText}>
            The active model does not support {getLanguageLabel(settings.sourceLanguageId)}.
            Choose another transcription model before recording.
          </Text>
        ) : selectedTranscriptionSupport === 'unverified' && settings.sourceLanguageId !== 'auto' ? (
          <Text style={styles.warningText}>
            Language support for this model is unverified. Confirm it supports{' '}
            {getLanguageLabel(settings.sourceLanguageId)} before recording.
          </Text>
        ) : null}

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Recommended transcription models</Text>
          <View style={styles.modelList}>
            {TRANSCRIPTION_MODEL_RECOMMENDATIONS.map((recommendation) => {
              const isSelected = settings.transcriptionModelId === recommendation.modelId;

              return (
                <Pressable
                  key={recommendation.modelId}
                  accessibilityLabel={`Recommended transcription model ${recommendation.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => void handleSelectTranscriptionModel(recommendation.modelId)}
                  style={[styles.modelRow, isSelected && styles.modelRowSelected]}
                >
                  <View style={styles.modelRowHeader}>
                    <Text style={[styles.modelLabel, isSelected && styles.modelLabelSelected]}>
                      {recommendation.label}
                    </Text>
                    {isSelected ? <Text style={styles.modelSelectedText}>Selected</Text> : null}
                  </View>
                  <Text style={styles.modelId}>{recommendation.modelId}</Text>
                  <Text style={styles.languageBadge}>
                    {getTranscriptionLanguageBadge(
                      recommendation.modelId,
                      settings.sourceLanguageId,
                    )}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Choose from OpenRouter</Text>
          <Text style={styles.modelHelp}>
            {settings.sourceLanguageId === 'auto'
              ? 'Choose any preferred model here. Auto-detect uses its dedicated GPT-4o Transcribe engine, without changing this choice.'
              : `Models known not to support ${getLanguageLabel(settings.sourceLanguageId)} are hidden. New or unverified models remain available with a warning.`}
          </Text>
          <Pressable
            accessibilityLabel="Browse OpenRouter transcription models"
            accessibilityRole="button"
            accessibilityState={{ expanded: isTranscriptionModelPickerOpen }}
            onPress={() => void handleToggleTranscriptionModelPicker()}
            style={styles.catalogToggleButton}
          >
            <Text style={styles.catalogToggleButtonText}>Browse transcription models</Text>
          </Pressable>
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Custom transcription model</Text>
          <TextInput
            accessibilityLabel="Custom OpenRouter transcription model ID"
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit
            onChangeText={(value) => {
              setTranscriptionModelInput(value);
              setTranscriptionModelSaveMessage('');
            }}
            onSubmitEditing={() => void handleSaveTranscriptionModel()}
            placeholder="provider/model-id"
            placeholderTextColor="#94A3B8"
            returnKeyType="done"
            style={styles.tokenInput}
            value={transcriptionModelInput}
          />
          <Text style={styles.modelHelp}>
            {settings.sourceLanguageId === 'auto'
              ? 'Advanced: save any preferred transcription model here. It will be used when you select a language; Auto-detect continues to use GPT-4o Transcribe.'
              : 'Advanced: enter a transcription model ID that supports zero-data-retention routing and your source language. Known incompatible choices are blocked.'}
          </Text>
          <View style={styles.modelButtonColumn}>
            <Pressable
              accessibilityLabel="Save custom transcription model"
              accessibilityRole="button"
              onPress={() => void handleSaveTranscriptionModel()}
              style={[styles.primaryButton, styles.fullWidthButton]}
            >
              <Text style={styles.primaryButtonText}>Save transcription model</Text>
            </Pressable>
            {transcriptionModelSaveMessage ? (
              <Text accessibilityLiveRegion="polite" style={styles.inlineSavedText}>
                {transcriptionModelSaveMessage}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.surface}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionTitle}>2. Text-processing model</Text>
            <Text style={styles.sectionSubtitle}>
              {settings.customModelId
                ? `Active custom model: ${settings.customModelId}`
                : `Active preset: ${selectedPreset?.label ?? 'Balanced'} — ${selectedTextModelId}`}
            </Text>
          </View>
        </View>
        <Text style={styles.modelHelp}>
          Used for every translation. In Transcribe mode, it is used only when Light cleanup is On.
          It does not change the speech-to-text model above.
        </Text>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Preset choices</Text>
          {settings.customModelId ? (
            <Text style={styles.warningText}>
              Presets are inactive while a custom model is active. Tap a preset to switch back to
              it.
            </Text>
          ) : null}
          <View style={styles.modelList}>
            {MODEL_PRESETS.map((preset) => {
              const isSelectedRecommendedModel =
                !settings.customModelId && settings.modelPresetId === preset.id;

              return (
                <Pressable
                  key={preset.id}
                  accessibilityLabel={`Recommended model ${preset.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelectedRecommendedModel }}
                  onPress={() => void handleSelectRecommendedModel(preset.id)}
                  style={[
                    styles.modelRow,
                    isSelectedRecommendedModel && styles.modelRowSelected,
                  ]}
                >
                  <View style={styles.modelRowHeader}>
                    <Text
                      style={[
                        styles.modelLabel,
                        isSelectedRecommendedModel && styles.modelLabelSelected,
                      ]}
                    >
                      {preset.label}
                    </Text>
                    {isSelectedRecommendedModel ? (
                      <Text style={styles.modelSelectedText}>Selected</Text>
                    ) : null}
                  </View>
                  <Text style={styles.modelId}>{preset.currentModelCandidate}</Text>
                  <Text style={styles.modelHelp}>{preset.description}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Custom text model (overrides preset)</Text>
          <TextInput
            accessibilityLabel="Custom OpenRouter translation model ID"
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit
            onChangeText={(value) => {
              setCustomModelInput(value);
              setTextModelSaveMessage('');
            }}
            onSubmitEditing={() => void handleSaveCustomModel()}
            placeholder="provider/model-id"
            placeholderTextColor="#94A3B8"
            returnKeyType="done"
            style={styles.tokenInput}
            value={customModelInput}
          />
          <Text style={styles.modelHelp}>
            Saving or choosing a custom model makes it active for both translation and light
            cleanup. The picker only shows text models compatible with zero-data-retention routing.
          </Text>
          <Pressable
            accessibilityLabel="Browse OpenRouter translation models"
            accessibilityRole="button"
            accessibilityState={{ expanded: isTranslationModelPickerOpen }}
            onPress={() => void handleToggleTranslationModelPicker()}
            style={styles.catalogToggleButton}
          >
            <Text style={styles.catalogToggleButtonText}>Browse text models</Text>
          </Pressable>
          <View style={styles.modelButtonColumn}>
            <Pressable
              accessibilityLabel="Save custom translation model"
              accessibilityRole="button"
              onPress={() => void handleSaveCustomModel()}
              style={[styles.primaryButton, styles.fullWidthButton]}
            >
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                numberOfLines={1}
                style={styles.primaryButtonText}
              >
                Save custom model
              </Text>
            </Pressable>
            {textModelSaveMessage ? (
              <Text accessibilityLiveRegion="polite" style={styles.inlineSavedText}>
                {textModelSaveMessage}
              </Text>
            ) : null}
            <Pressable
              accessibilityLabel="Use recommended preset"
              accessibilityRole="button"
              onPress={() => void handleUseRecommendedPreset()}
              style={[styles.secondaryButton, styles.fullWidthButton]}
            >
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                numberOfLines={1}
                style={styles.secondaryButtonText}
              >
                {`Use ${selectedPreset?.label ?? 'Balanced'} preset`}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Light cleanup after transcription</Text>
          <View style={styles.optionRow}>
            <OptionButton
              accessibilityLabel="Default cleanup On"
              label="On"
              onSelect={() => void saveSetting({ cleanupEnabled: true })}
              selected={settings.cleanupEnabled}
              value="on"
            />
            <OptionButton
              accessibilityLabel="Default cleanup Off"
              label="Off"
              onSelect={() => void saveSetting({ cleanupEnabled: false })}
              selected={!settings.cleanupEnabled}
              value="off"
            />
          </View>
          <Text style={styles.modelHelp}>
            {settings.cleanupEnabled
              ? `On: after speech-to-text, ${selectedTextModelId} makes light punctuation, capitalization, and filler-word corrections.`
              : 'Off: Transcribe returns the raw speech-to-text result and skips the second model call. Translation still uses the active text model.'}
          </Text>
        </View>
      </View>

      <View style={styles.surface}>
        <Text style={styles.sectionTitle}>Recording defaults</Text>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Default mode</Text>
          <View style={styles.optionRow}>
            {HISTORY_MODES.map((mode) => (
              <OptionButton
                key={mode}
                accessibilityLabel={`Default mode ${getModeLabel(mode)}`}
                label={getModeLabel(mode)}
                onSelect={(nextMode) => void saveSetting({ defaultMode: nextMode })}
                selected={settings.defaultMode === mode}
                value={mode}
              />
            ))}
          </View>
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Default source language</Text>
          <View style={styles.optionRow}>
            {LANGUAGE_OPTIONS.map((language) => (
              <OptionButton
                key={language.id}
                accessibilityLabel={`Default source language ${language.label}`}
                label={language.label}
                onSelect={(sourceLanguageId: LanguageId) =>
                  void handleSelectSourceLanguage(sourceLanguageId)
                }
                selected={settings.sourceLanguageId === language.id}
                value={language.id}
              />
            ))}
          </View>
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Default target language</Text>
          <View style={styles.optionRow}>
            {LANGUAGE_OPTIONS.filter(isConcreteLanguageOption).map((language) => (
              <OptionButton
                key={language.id}
                accessibilityLabel={`Default target language ${language.label}`}
                label={language.label}
                onSelect={(targetLanguageId: ConcreteLanguageId) =>
                  void saveSetting({ targetLanguageId })
                }
                selected={settings.targetLanguageId === language.id}
                value={language.id}
              />
            ))}
          </View>
        </View>

      </View>

      <View style={styles.surface}>
        <Text style={styles.sectionTitle}>Help and privacy</Text>
        <Text style={styles.privacyNote}>
          Your SayCopy history stays on this device unless you choose to copy or share it.
        </Text>
        <View style={styles.resourceList}>
          <Pressable
            accessibilityLabel="Open SayCopy privacy policy"
            accessibilityRole="link"
            onPress={() => void handleOpenExternalUrl(SAYCOPY_LINKS.privacy)}
            style={styles.resourceLink}
          >
            <Text style={styles.resourceLinkText}>Privacy policy</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Open SayCopy support"
            accessibilityRole="link"
            onPress={() => void handleOpenExternalUrl(SAYCOPY_LINKS.support)}
            style={styles.resourceLink}
          >
            <Text style={styles.resourceLinkText}>Support</Text>
          </Pressable>
        </View>
      </View>

      {messageText ? (
        <Text accessibilityLiveRegion="polite" style={styles.savedText}>
          {messageText}
        </Text>
      ) : null}
      {errorText ? (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.errorText}>
          {errorText}
        </Text>
      ) : null}

      <CatalogPickerModal
        emptyText="No matching transcription models."
        isLoading={isTranscriptionCatalogLoading}
        loadingText="Loading OpenRouter transcription models"
        models={visibleTranscriptionCatalogModels}
        onChangeQuery={setTranscriptionModelQuery}
        onClose={() => setIsTranscriptionModelPickerOpen(false)}
        onSelectModel={(modelId) => void handleSelectTranscriptionCatalogModel(modelId)}
        query={transcriptionModelQuery}
        renderBadge={(modelId) =>
          getTranscriptionLanguageBadge(modelId, settings.sourceLanguageId)
        }
        searchAccessibilityLabel="Search OpenRouter transcription models"
        selectedModelId={settings.transcriptionModelId}
        title="Transcription model"
        visible={isTranscriptionModelPickerOpen}
      />
      <CatalogPickerModal
        emptyText="No matching text models."
        isLoading={isTranslationCatalogLoading}
        loadingText="Loading OpenRouter text models"
        models={visibleTranslationCatalogModels}
        onChangeQuery={setTranslationModelQuery}
        onClose={() => setIsTranslationModelPickerOpen(false)}
        onSelectModel={(modelId) => void handleSelectTranslationCatalogModel(modelId)}
        query={translationModelQuery}
        searchAccessibilityLabel="Search OpenRouter translation models"
        selectedModelId={settings.customModelId}
        title="Translation model"
        visible={isTranslationModelPickerOpen}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  content: {
    gap: 18,
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    gap: 2,
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
  },
  surface: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 16,
    padding: 16,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionTitleGroup: {
    flexShrink: 1,
    gap: 3,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#64748B',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 1,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillSaved: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusText: {
    color: '#B91C1C',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusTextSaved: {
    color: '#047857',
  },
  tokenInput: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    color: '#0F172A',
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    flex: 1,
    flexBasis: 130,
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexBasis: 130,
    justifyContent: 'center',
    minHeight: 46,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  privacyNote: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  resourceList: {
    gap: 8,
  },
  resourceLink: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
  },
  resourceLinkText: {
    color: '#0369A1',
    fontSize: 15,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  modelButtonColumn: {
    gap: 10,
  },
  fullWidthButton: {
    flex: 0,
    flexBasis: 'auto',
    width: '100%',
  },
  controlGroup: {
    gap: 10,
  },
  controlLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  optionButtonSelected: {
    backgroundColor: '#E0F2FE',
    borderColor: '#38BDF8',
  },
  optionButtonText: {
    color: '#475569',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  optionButtonTextSelected: {
    color: '#075985',
  },
  modelList: {
    gap: 8,
  },
  modelRow: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modelRowSelected: {
    backgroundColor: '#E0F2FE',
    borderColor: '#38BDF8',
  },
  modelRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  modelLabel: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  modelLabelSelected: {
    color: '#075985',
  },
  modelId: {
    color: '#475569',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  modelSelectedText: {
    color: '#075985',
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
  },
  modelHelp: {
    color: '#64748B',
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  warningText: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderRadius: 8,
    borderWidth: 1,
    color: '#92400E',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    padding: 10,
  },
  languageBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    color: '#3730A3',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  catalogToggleButton: {
    alignItems: 'center',
    borderColor: '#2563EB',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  catalogToggleButtonText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '800',
  },
  catalogModelRow: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pickerModalScreen: {
    backgroundColor: '#F8FAFC',
    flex: 1,
    gap: 14,
    padding: 20,
    paddingTop: 28,
  },
  pickerModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  pickerModalTitle: {
    flex: 1,
  },
  pickerCloseButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 12,
  },
  pickerModalList: {
    gap: 8,
    paddingBottom: 28,
  },
  savedText: {
    color: '#047857',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  inlineSavedText: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 2,
  },
  errorText: {
    color: '#B91C1C',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  centerState: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  stateTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
  },
});
