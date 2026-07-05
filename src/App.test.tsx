import { render, screen } from '@testing-library/react-native';

import App from './App';

describe('App shell', () => {
  it('shows the primary tab labels', () => {
    render(<App />);

    expect(screen.getByRole('tab', { name: 'Record' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'History' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeTruthy();
  });

  it('renders the record screen as the primary tab content', () => {
    render(<App />);

    expect(screen.getByText('Tap to record')).toBeTruthy();
    expect(screen.getByText('Light cleanup on')).toBeTruthy();
  });
});
