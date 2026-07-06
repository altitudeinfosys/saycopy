import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

import { createResultActions } from '../ActionBar';

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
