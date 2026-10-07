// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerFilters } from './LayerFilters';
beforeEach(() => vi.stubGlobal('matchMedia', () => ({matches:false,addEventListener:()=>{},removeEventListener:()=>{}})));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('multiple layer-filter surfaces', () => {
  it('associates each label with its own checkbox when feed and layer sections coexist', () => {
    const first = vi.fn();
    const second = vi.fn();
    const filters = {showAir:true,showSea:false,showSatellites:false};
    render(<><div data-testid="feed"><LayerFilters filters={filters} onFilterChange={first} /></div><div data-testid="layers"><LayerFilters filters={filters} onFilterChange={second} /></div></>);
    for(const surface of ['feed','layers'])fireEvent.click(within(screen.getByTestId(surface)).getByRole('button',{name:'Toggle Aircraft Filter Group'}));
    const inputs = screen.getAllByRole('checkbox').filter(input => input.id);
    expect(inputs.length).toBeGreaterThan(0);
    expect(new Set(inputs.map(input => input.id)).size).toBe(inputs.length);
    const label = screen.getByTestId('layers').querySelector('label');
    fireEvent.click(label!);
    expect(second).toHaveBeenCalledWith('showHelicopter', false);
    expect(first).not.toHaveBeenCalled();
  });
});

it('keeps mobile domain and subtype choices independent', () => {
  vi.stubGlobal('matchMedia', () => ({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
  const onChange=vi.fn();
  render(<LayerFilters filters={{showAir:false,showSea:true,showSatellites:false}} onFilterChange={onChange} />);
  fireEvent.click(screen.getByRole('button', {name:/Aircraft.*types selected/}));
  fireEvent.click(screen.getByRole('checkbox', {name:'Helicopters'}));
  expect(onChange).toHaveBeenCalledWith('showHelicopter', false);
  fireEvent.click(screen.getByRole('button', {name:'Toggle all Aircraft filters'}));
  expect(onChange).toHaveBeenCalledWith('showAir', true);
  fireEvent.click(screen.getByRole('button', {name:/Maritime.*types selected/}));
  expect(screen.queryByRole('checkbox', {name:'Helicopters'})).toBeNull();
  expect(screen.getByRole('checkbox', {name:'Search & rescue'})).toBeTruthy();
});
