import * as Clipboard from 'expo-clipboard';
import { Share, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import ActionBar, { createResultActions } from '../ActionBar';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

describe('createResultActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses Expo Clipboard and native Share APIs', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const actions = createResultActions();

    await actions.copyText('Edited clipboard text.');
    await actions.shareText('Edited share text.');

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Edited clipboard text.');
    expect(share).toHaveBeenCalledWith({ message: 'Edited share text.' });
  });
});

function expectMinimumTouchTarget(instance: ReactTestInstance): void {
  const style = StyleSheet.flatten(instance.props.style);
  const targetHeight =
    typeof style?.minHeight === 'number'
      ? style.minHeight
      : typeof style?.height === 'number'
        ? style.height
        : 0;

  expect(targetHeight).toBeGreaterThanOrEqual(44);
}

describe('ActionBar', () => {
  it('labels all actions and keeps action buttons usable under large text', () => {
    render(
      <ActionBar
        actions={{
          copyText: jest.fn(),
          shareText: jest.fn(),
        }}
        isTagEditorOpen={false}
        onToggleTags={jest.fn()}
        resultText="Editable result"
      />,
    );

    expectMinimumTouchTarget(screen.getByRole('button', { name: 'Copy' }));
    expectMinimumTouchTarget(screen.getByRole('button', { name: 'Share' }));
    expectMinimumTouchTarget(screen.getByRole('button', { name: 'Tags' }));
  });

  it('confirms a successful copy with a checkmark', async () => {
    const copyText = jest.fn().mockResolvedValue(undefined);

    render(
      <ActionBar
        actions={{ copyText, shareText: jest.fn() }}
        isTagEditorOpen={false}
        onToggleTags={jest.fn()}
        resultText="Editable result"
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => {
      expect(copyText).toHaveBeenCalledWith('Editable result');
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    });
    expect(screen.getByText('Copied ✓')).toBeTruthy();
  });
});
