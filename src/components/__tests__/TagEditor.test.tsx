import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import TagEditor from '../TagEditor';

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

describe('TagEditor', () => {
  it('labels tag controls and keeps the add control usable under large text', () => {
    render(<TagEditor canAddTag onAddTag={jest.fn()} tags={[]} />);

    const input = screen.getByLabelText('Tag name');
    expect(input.props.placeholder).toBe('Add a tag');
    expectMinimumTouchTarget(input);
    expectMinimumTouchTarget(screen.getByRole('button', { name: 'Add tag' }));
  });
});
