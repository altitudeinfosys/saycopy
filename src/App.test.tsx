import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppShell } from './App';
import { createRecordFlowProcessors, type AppDependencies } from './runtime/appDependencies';
import { createDemoAppDependencies } from './storage/demoAppRepositories';

function createTestAppDependencies(): AppDependencies {
  const demoDependencies = createDemoAppDependencies();

  return {
    ...demoDependencies,
    recordFlowProcessors: createRecordFlowProcessors({
      historyRepository: demoDependencies.historyRepository,
      provider: {
        cleanupTranscript: jest.fn(),
        transcribeAudio: jest.fn(),
        translateText: jest.fn(),
      },
    }),
  };
}

describe('App shell', () => {
  it('shows the primary tab labels', async () => {
    render(<AppShell dependencies={createTestAppDependencies()} />);

    expect(screen.getByRole('tab', { name: 'Record' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'History' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeTruthy();
    expect(await screen.findByText('Tap to record')).toBeTruthy();
  });

  it('renders the record screen as the primary tab content', async () => {
    render(<AppShell dependencies={createTestAppDependencies()} />);

    expect(await screen.findByText('Tap to record')).toBeTruthy();
    expect(screen.getByText('Light cleanup on')).toBeTruthy();
  });

  it('passes shared saved settings into the Record tab', async () => {
    const dependencies = createTestAppDependencies();
    await dependencies.settingsRepository.saveSettings({
      defaultMode: 'translate',
      sourceLanguageId: 'english',
      targetLanguageId: 'arabic',
      modelPresetId: 'fast',
      cleanupEnabled: false,
    });

    render(<AppShell dependencies={dependencies} />);

    expect(await screen.findByPlaceholderText('Type or paste text to translate')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Source language English' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      screen.getByRole('button', { name: 'Target language Arabic' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByText('Light cleanup off')).toBeTruthy();
  });

  it('renders the history screen from the History tab', async () => {
    render(<AppShell dependencies={createTestAppDependencies()} />);

    fireEvent.press(screen.getByRole('tab', { name: 'History' }));

    expect(await screen.findByText('No saved history yet')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search history')).toBeTruthy();
  });

  it('renders the settings screen from the Settings tab', async () => {
    render(<AppShell dependencies={createTestAppDependencies()} />);

    fireEvent.press(screen.getByRole('tab', { name: 'Settings' }));

    expect(await screen.findByText('OpenRouter token missing')).toBeTruthy();
    expect(screen.getByText('Defaults')).toBeTruthy();
  });
});
