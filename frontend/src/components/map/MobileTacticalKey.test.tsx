// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MobileTacticalKey } from './MobileTacticalKey';
afterEach(cleanup);
it('shows only keys for enabled tactical domains', () => {
  const {rerender} = render(<MobileTacticalKey showAir showSea={false} />);
  expect(screen.getByLabelText('Aircraft altitude color scale')).toBeTruthy();
  expect(screen.queryByLabelText('Maritime speed color scale')).toBeNull();
  rerender(<MobileTacticalKey showAir={false} showSea />);
  expect(screen.queryByLabelText('Aircraft altitude color scale')).toBeNull();
  expect(screen.getByLabelText('Maritime speed color scale')).toBeTruthy();
  rerender(<MobileTacticalKey showAir={false} showSea={false} />);
  expect(screen.queryByText('Map color key')).toBeNull();
});
