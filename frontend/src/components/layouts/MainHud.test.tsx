// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainHud } from './MainHud';
beforeEach(() => vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener: () => {}, removeEventListener: () => {}})));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('touch panel navigation', () => {
  it('switches drawers and dismisses with Escape or the backdrop', () => {
    render(<MainHud leftSidebar={<div>Feeds</div>} rightSidebar={<div>Entity</div>} />);
    const left = screen.getByRole('button', { name: 'Layers & feeds' });
    const right = screen.getByRole('button', { name: 'Details' });
    fireEvent.click(left);
    expect(left.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(right);
    expect(left.getAttribute('aria-expanded')).toBe('false');
    expect(right.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(right.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(left);
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(left.getAttribute('aria-expanded')).toBe('false');
  });
  it('does not leave a backdrop over a view that has no panels', () => {
    const { rerender } = render(<MainHud leftSidebar={<div>Feeds</div>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers & feeds' }));
    rerender(<MainHud><div>Dashboard</div></MainHud>);
    expect(screen.queryByRole('button', { name: 'Close panel' })).toBeNull();
  });
});

import { useMobileNavigation } from './MobileNavigationContext';
const ToolLauncher = () => {
  const { toolsOpen, setToolsOpen } = useMobileNavigation();
  return <button onClick={() => setToolsOpen(!toolsOpen)} aria-expanded={toolsOpen}>Tools</button>;
};
describe('mobile menu coordination', () => {
  it('closes the sidebar when tools open and closes tools when the sidebar opens', () => {
    render(<MainHud topBar={<ToolLauncher />} leftSidebar={<div>Feeds</div>} />);
    const layers = screen.getByRole('button', { name: 'Layers & feeds' });
    const tools = screen.getByRole('button', { name: 'Tools' });
    fireEvent.click(layers);
    fireEvent.click(tools);
    expect(layers.getAttribute('aria-expanded')).toBe('false');
    expect(tools.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(layers);
    expect(tools.getAttribute('aria-expanded')).toBe('false');
    expect(layers.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('view-specific mobile workspaces', () => {
  it('shows orbital navigation and returns from passes to the map', () => {
    vi.stubGlobal('matchMedia', () => ({matches: true, addEventListener: () => {}, removeEventListener: () => {}}));
    render(<MainHud viewMode="ORBITAL" leftSidebar={<div>Predictions</div>} rightSidebar={<div>Selected satellite</div>} statusPanel={<div>Space weather</div>} selectionLabel="ISS" />);
    fireEvent.click(screen.getByRole('button', {name: 'Satellites'}));
    expect(screen.getByRole('button', {name: 'Satellites'}).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', {name: 'Map'}));
    expect(screen.getByRole('button', {name: 'Satellites'}).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', {name: 'Status'}));
    expect(screen.getByText('Space weather')).toBeTruthy();
  });
});


describe('mobile sheet gestures', () => {
  it('dismisses a panel after a downward swipe on its heading', () => {
    render(<MainHud leftSidebar={<div>Feeds</div>} />);
    const launcher = screen.getByRole('button', { name: 'Layers & feeds' });
    fireEvent.click(launcher);
    const heading = screen.getByRole('button', { name: 'Close layers panel' }).parentElement!;
    fireEvent.touchStart(heading, { touches: [{ clientY: 100 }] });
    fireEvent.touchEnd(heading, { changedTouches: [{ clientY: 125 }] });
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    fireEvent.touchStart(heading, { touches: [{ clientY: 100 }] });
    fireEvent.touchEnd(heading, { changedTouches: [{ clientY: 200 }] });
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
  });
});

it('keeps map summary widgets mounted when mobile drawers open', () => {
  vi.stubGlobal('matchMedia', () => ({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
  render(<MainHud viewMode="TACTICAL" leftSidebar={<div>Feeds</div>} mobileSummary={<input aria-label="Retained summary" defaultValue="Weather state" />} />);
  const summary=screen.getByRole('textbox',{name:'Retained summary'});
  fireEvent.change(summary,{target:{value:'Retained'}});
  fireEvent.click(screen.getByRole('button',{name:'Mission & feeds'}));
  expect(summary.isConnected).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Map'}));
  expect(screen.getByRole('textbox',{name:'Retained summary'})).toBe(summary);
  expect((summary as HTMLInputElement).value).toBe('Retained');
});

it('opens details on a mobile selection, stays dismissed during updates, and reopens for a new selection event', () => {
  vi.stubGlobal('matchMedia', () => ({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
  const props={viewMode:'TACTICAL' as const,rightSidebar:<div>Selected aircraft</div>};
  const {rerender}=render(<MainHud {...props} />);
  rerender(<MainHud {...props} selectionKey="plane:1" selectionLabel="Flight" />);
  expect(screen.getByRole('dialog',{name:'Details'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Close details panel'}));
  rerender(<MainHud {...props} selectionKey="plane:1" selectionLabel="Flight updated" />);
  expect(screen.queryByRole('dialog',{name:'Details'})).toBeNull();
  rerender(<MainHud {...props} selectionKey="plane:2" selectionLabel="Flight updated" />);
  expect(screen.getByRole('dialog',{name:'Details'})).toBeTruthy();
  rerender(<MainHud {...props} />);
  expect(screen.queryByRole('dialog',{name:'Details'})).toBeNull();
});

it('does not turn desktop selection into a modal drawer', () => {
  render(<MainHud viewMode="TACTICAL" selectionKey="plane:1" rightSidebar={<div>Selected aircraft</div>} />);
  expect(screen.queryByRole('dialog')).toBeNull();
});
