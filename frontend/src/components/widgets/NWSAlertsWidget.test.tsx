// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { NWSAlertsWidget } from './NWSAlertsWidget';
afterEach(cleanup);
const mission={lat:45.5152,lon:-122.6784,radius_nm:100};
const alerts:FeatureCollection={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-123,45],[-122,45],[-122,46],[-123,46],[-123,45]]]},properties:{id:'mission-weather',severity:'Severe',event:'Storm warning',areaDesc:'Mission area'}}]};
it('shows weather on compact maps without inventing an all-clear for pending data', () => {
  const {rerender}=render(<NWSAlertsWidget compact nwsAlerts={null} mission={mission} />);
  expect(screen.getByText('PENDING')).toBeTruthy();
  rerender(<NWSAlertsWidget compact nwsAlerts={{type:'FeatureCollection',features:[]}} mission={mission} />);
  expect(screen.getByText('0 IN AREA')).toBeTruthy();
  rerender(<NWSAlertsWidget compact nwsAlerts={{type:'FeatureCollection',features:[]}} />);
  expect(screen.getByText('SET MISSION')).toBeTruthy();
});
it('expands mission alerts and avoids duplicate notifications on ordinary rerenders', () => {
  const onEvent=vi.fn();
  const {rerender}=render(<NWSAlertsWidget compact nwsAlerts={alerts} mission={mission} onEvent={onEvent} />);
  fireEvent.click(screen.getByRole('button',{name:'Toggle NWS Alerts'}));
  expect(screen.getByText('Storm warning')).toBeTruthy();
  expect(onEvent).toHaveBeenCalledTimes(1);
  rerender(<NWSAlertsWidget compact nwsAlerts={alerts} mission={mission} onEvent={onEvent} />);
  expect(onEvent).toHaveBeenCalledTimes(1);
});
