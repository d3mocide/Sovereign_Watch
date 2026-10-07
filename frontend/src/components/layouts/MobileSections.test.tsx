// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MobileSections } from './MobileSections';
afterEach(cleanup);
describe('mobile workspace sections', () => {
  it('preserves an unfinished search across section changes and supports arrow navigation', () => {
    render(<MobileSections label="Orbital sections" sections={[
      {id:'satellites',label:'Satellites',content:<input aria-label="Satellite search" />},
      {id:'passes',label:'Passes',content:<p>Predicted passes</p>},
    ]} />);
    fireEvent.change(screen.getByLabelText('Satellite search'), {target:{value:'ISS'}});
    fireEvent.click(screen.getByRole('tab',{name:'Passes'}));
    fireEvent.keyDown(screen.getByRole('tab',{name:'Passes'}),{key:'ArrowLeft'});
    expect(screen.getByRole('tab',{name:'Satellites'}).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByLabelText('Satellite search') as HTMLInputElement).value).toBe('ISS');
    expect(document.activeElement).toBe(screen.getByRole('tab',{name:'Satellites'}));
  });
});
