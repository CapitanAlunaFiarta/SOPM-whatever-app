/// <reference types="jest" />
import { buildMapPage, parseMapEvent, safeJson, type MapState } from '../page';

describe('safeJson', () => {
  it('nu lasă un titlu să închidă <script>', () => {
    const json = safeJson({ title: '</script><script>alert(1)</script>' });
    expect(json).not.toContain('</script');
    expect(JSON.parse(json)).toEqual({ title: '</script><script>alert(1)</script>' });
  });

  it('scapă separatorii de linie Unicode', () => {
    const json = safeJson({ text: 'a\u2028b\u2029c' });
    expect(json).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(json)).toEqual({ text: 'a\u2028b\u2029c' });
  });
});

describe('parseMapEvent', () => {
  it('acceptă doar mesajele cunoscute, cu coordonate valide', () => {
    expect(parseMapEvent('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parseMapEvent('{"type":"pick","latitude":45.6,"longitude":25.5}')).toEqual({ type: 'pick', latitude: 45.6, longitude: 25.5 });
    expect(parseMapEvent('{"type":"pick","latitude":"45","longitude":25}')).toBeNull();
    expect(parseMapEvent('{"type":"pick","latitude":91,"longitude":25}')).toBeNull();
    expect(parseMapEvent('{"type":"altceva"}')).toBeNull();
    expect(parseMapEvent('nu e json')).toBeNull();
  });
});

describe('buildMapPage', () => {
  const state: MapState = {
    mode: 'tasks',
    center: { latitude: 45.65, longitude: 25.59 },
    tasks: [{ id: 1, title: '</script><b>x</b>', label: 'Activă · raza 100 m', latitude: 45.65, longitude: 25.59, radius: 100, color: '#6366f1' }],
  };

  it('include Leaflet și starea inițială, cu exact două scripturi închise', () => {
    const html = buildMapPage(state);
    expect(html).toContain('Leaflet 1.9.4');
    expect(html).toContain('window.__apply(');
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });
});
