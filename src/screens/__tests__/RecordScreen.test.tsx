import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import RecordScreen from '../RecordScreen';

describe('RecordScreen', () => {
  it('starts in transcribe mode with cleanup wording and a large tap-to-record control', () => {
    render(<RecordScreen />);

    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Translate' })).toBeTruthy();
    expect(screen.getByText('Light cleanup on')).toBeTruthy();
    expect(screen.getByText('Tap to record')).toBeTruthy();
    expect(screen.getByText('60 second max')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Type or paste text to translate')).toBeNull();
  });

  it('shows manual input and a target language selector in translate mode', () => {
    render(<RecordScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));

    expect(screen.getByPlaceholderText('Type or paste text to translate')).toBeTruthy();
    expect(screen.getByText('Target language')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Spanish' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Translate text' })).toBeTruthy();
  });

  it('shows warm active recording treatment before producing an editable saved result', () => {
    render(<RecordScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));

    expect(screen.getByText('Recording in progress')).toBeTruthy();
    expect(screen.getByText('00:00 / 60s max')).toBeTruthy();
    expect(screen.getByLabelText('Mock audio waveform')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('recording-panel').props.style)).toMatchObject({
      backgroundColor: '#FFF7ED',
      borderColor: '#FDBA74',
    });

    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));

    expect(screen.getByText('Saved to history')).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Share')).toBeTruthy();
    expect(screen.getByText('Tags')).toBeTruthy();

    const resultEditor = screen.getByTestId('result-editor');
    expect(resultEditor.props.value).toContain('Cleaned transcript');

    fireEvent.changeText(resultEditor, 'Edited transcript text');

    expect(screen.getByTestId('result-editor').props.value).toBe('Edited transcript text');
  });

  it('creates a mocked translation result with emphasized translated output and original text', () => {
    render(<RecordScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));
    fireEvent.changeText(
      screen.getByPlaceholderText('Type or paste text to translate'),
      'Meet me at the office at noon.',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Translate text' }));

    expect(screen.getByText('Translated output')).toBeTruthy();
    expect(screen.getByTestId('result-editor').props.value).toContain('Spanish translation');
    expect(screen.getByText('Original text')).toBeTruthy();
    expect(screen.getByText('Meet me at the office at noon.')).toBeTruthy();
    expect(screen.getByText('Saved to history')).toBeTruthy();
  });
});
