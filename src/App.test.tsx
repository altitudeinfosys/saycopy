import { render, screen } from '@testing-library/react-native';

import App from './App';

describe('App shell', () => {
  it('shows the primary tab labels', () => {
    render(<App />);

    expect(screen.getByText('Record')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });
});
