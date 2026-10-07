// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useEntitySelection } from './useEntitySelection';
import type { CoTEntity } from '../types';
it('counts explicit selections including repeated objects but excludes live telemetry updates', () => {
  const {result}=renderHook(()=>useEntitySelection(vi.fn()));
  const entity={uid:'plane',type:'a-f-A',callsign:'Flight'} as CoTEntity;
  act(()=>result.current.handleEntitySelect(entity));
  expect(result.current.selectionRevision).toBe(1);
  act(()=>result.current.handleEntityLiveUpdate({...entity,speed:120}));
  expect(result.current.selectionRevision).toBe(1);
  act(()=>result.current.handleEntitySelect(entity));
  expect(result.current.selectionRevision).toBe(2);
  act(()=>result.current.handleSetSelectedSatNorad(25544));
  expect(result.current.selectionRevision).toBe(3);
});
