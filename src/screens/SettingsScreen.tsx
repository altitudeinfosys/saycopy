import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { HISTORY_MODES, type HistoryMode } from '../domain/history';
import {
  LANGUAGE_OPTIONS,
  type ConcreteLanguageId,
  type LanguageId,
  type LanguageOption,
} from '../domain/languages';
import {
  MODEL_PRESETS,
  TRANSCRIPTION_MODEL_RECOMMENDATIONS,
  type ModelPresetId,
} from '../domain/modelPresets';
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
    Keyboard.dismiss();
    await saveSetting({ customModelId });
  }

  async function handleUseRecommendedPreset() {
    setCustomModelInput('');
    await saveSetting({ customModelId: '' });
  }

  async function handleSaveTranscriptionModel() {
    const transcriptionModelId = transcriptionModelInput.trim();
    setTranscriptionModelInput(transcriptionModelId);
    Keyboard.dismiss();

    if (!transcriptionModelId) {
      setErrorText('Enter an OpenRouter transcription model ID.');
      return;
    }

    await saveSetting({ transcriptionModelId });
  }

  async function handleSelectTranscriptionModel(transcriptionModelId: string) {
    setTranscriptionModelInput(transcriptionModelId);
    await saveSetting({ transcriptionModelId });
  }

  async function handleSelectRecommendedModel(modelPresetId: ModelPresetId) {
    setCustomModelInput('');
    await saveSetting({ customModelId: '', modelPresetId });
  }

  async function handleToggleTranslationModelPicker() {
    const shouldOpen = !isTranslationModelPickerOpen;
    setIsTranslationModelPickerOpen(shouldOpen);

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

  async function saveSetting(nextSettings: Partial<AppSettings>) {
    const currentSettings = settingsRef.current;
    if (!currentSettings) {
      return;
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
    }
  }

  const visibleTranslationCatalogModels = useMemo(() => {
    const normalizedQuery = translationModelQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return translationCatalogModels.slice(0, 80);
    }

    return translationCatalogModels
      .filter(
        (model) =>
          model.id.toLowerCase().includes(normalizedQuery) ||
          model.name.toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 80);
  }, [translationCatalogModels, translationModelQuery]);

  if (isLoading || !settings || !tokenStatus) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateTitle}>Loading settings</Text>
      </View>
    );
  }

  const selectedPreset = MODEL_PRESETS.find((preset) => preset.id === settings.modelPresetId);

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
          <Text style={styles.resourceLinkText}>Get an OpenRouter key</Text>
        </Pressable>
      </View>

      <View style={styles.surface}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionTitle}>Transcription model</Text>
            <Text style={styles.sectionSubtitle}>Using: {settings.transcriptionModelId}</Text>
          </View>
        </View>

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
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Custom transcription model</Text>
          <TextInput
            accessibilityLabel="Custom OpenRouter transcription model ID"
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit
            onChangeText={setTranscriptionModelInput}
            onSubmitEditing={() => void handleSaveTranscriptionModel()}
            placeholder="provider/model-id"
            placeholderTextColor="#94A3B8"
            returnKeyType="done"
            style={styles.tokenInput}
            value={transcriptionModelInput}
          />
          <View style={styles.modelButtonColumn}>
            <Pressable
              accessibilityLabel="Save custom transcription model"
              accessibilityRole="button"
              onPress={() => void handleSaveTranscriptionModel()}
              style={[styles.primaryButton, styles.fullWidthButton]}
            >
              <Text style={styles.primaryButtonText}>Save transcription model</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.surface}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionTitle}>Translation and cleanup model</Text>
            <Text style={styles.sectionSubtitle}>
              {settings.customModelId
                ? `Using custom: ${settings.customModelId}`
                : `Using recommended: ${selectedPreset?.label ?? 'Balanced'}`}
            </Text>
          </View>
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Recommended translation and cleanup models</Text>
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
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Custom translation and cleanup model</Text>
          <TextInput
            accessibilityLabel="Custom OpenRouter translation model ID"
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit
            onChangeText={setCustomModelInput}
            onSubmitEditing={() => void handleSaveCustomModel()}
            placeholder="provider/model-id"
            placeholderTextColor="#94A3B8"
            returnKeyType="done"
            style={styles.tokenInput}
            value={customModelInput}
          />
          <Text style={styles.modelHelp}>
            Leave blank to use the recommended preset.
          </Text>
          <Pressable
            accessibilityLabel="Browse OpenRouter translation models"
            accessibilityRole="button"
            accessibilityState={{ expanded: isTranslationModelPickerOpen }}
            onPress={() => void handleToggleTranslationModelPicker()}
            style={styles.catalogToggleButton}
          >
            <Text style={styles.catalogToggleButtonText}>
              {isTranslationModelPickerOpen ? 'Hide model picker' : 'Browse OpenRouter models'}
            </Text>
          </Pressable>
          {isTranslationModelPickerOpen ? (
            <View style={styles.catalogPicker}>
              <TextInput
                accessibilityLabel="Search OpenRouter translation models"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setTranslationModelQuery}
                placeholder="Search provider or model"
                placeholderTextColor="#94A3B8"
                style={styles.tokenInput}
                value={translationModelQuery}
              />
              {isTranslationCatalogLoading ? (
                <Text accessibilityLiveRegion="polite" style={styles.modelHelp}>
                  Loading OpenRouter models
                </Text>
              ) : (
                <ScrollView nestedScrollEnabled style={styles.catalogList}>
                  {visibleTranslationCatalogModels.map((model) => (
                    <Pressable
                      key={model.id}
                      accessibilityLabel={`Translation model ${model.id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: settings.customModelId === model.id }}
                      onPress={() => void handleSelectTranslationCatalogModel(model.id)}
                      style={[
                        styles.catalogModelRow,
                        settings.customModelId === model.id && styles.modelRowSelected,
                      ]}
                    >
                      <Text style={styles.modelLabel}>{model.name}</Text>
                      <Text style={styles.modelId}>{model.id}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}
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
                Save translation model
              </Text>
            </Pressable>
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
                Use recommended preset
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.surface}>
        <Text style={styles.sectionTitle}>Defaults</Text>

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
                onSelect={(sourceLanguageId: LanguageId) => void saveSetting({ sourceLanguageId })}
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

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Default preset</Text>
          <View style={styles.optionRow}>
            {MODEL_PRESETS.map((preset) => (
              <OptionButton
                key={preset.id}
                accessibilityLabel={`Default preset ${preset.label}`}
                label={preset.label}
                onSelect={(modelPresetId: ModelPresetId) => void saveSetting({ modelPresetId })}
                selected={settings.modelPresetId === preset.id}
                value={preset.id}
              />
            ))}
          </View>
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Light cleanup</Text>
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
  catalogPicker: {
    gap: 10,
  },
  catalogList: {
    maxHeight: 280,
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
  savedText: {
    color: '#047857',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
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
