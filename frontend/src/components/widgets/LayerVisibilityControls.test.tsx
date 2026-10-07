// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LayerVisibilityControls } from './LayerVisibilityControls';
import type { MapFilters } from '../../types';
afterEach(()=>{cleanup();localStorage.clear();});
it('routes a layer checkbox to its own menu when several layer menus coexist', () => {
  localStorage.clear();
  const first=vi.fn(),second=vi.fn();
  const filters={showAir:true,showSea:true,showSatellites:false,showCables:true} as MapFilters;
  render(<><div data-testid="feeds"><LayerVisibilityControls filters={filters} onFilterChange={first} /></div><div data-testid="tools"><LayerVisibilityControls filters={filters} onFilterChange={second} /></div></>);
  for(const menu of ['feeds','tools']){
    const scope=within(screen.getByTestId(menu));
    fireEvent.click(scope.getByRole('button',{name:'Toggle Map Layers'}));
    fireEvent.click(scope.getByRole('button',{name:'Toggle Global Network Panels'}));
  }
  const boxes=screen.getAllByRole('checkbox').filter(box=>box.id);
  expect(boxes.length).toBeGreaterThan(0);
  expect(new Set(boxes.map(box=>box.id)).size).toBe(boxes.length);
  fireEvent.click(screen.getByTestId('tools').querySelector('label')!);
  expect(second).toHaveBeenCalledWith('showCables',false);
  expect(first).not.toHaveBeenCalled();
});
