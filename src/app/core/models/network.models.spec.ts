import { ROUTEROS_ID_PATTERN } from './network.models';

describe('ROUTEROS_ID_PATTERN', () => {
  it('acepta ids internos y nombres de RouterOS', () => {
    for (const ok of ['*1A', 'cliente.123', '1098765432', 'juan_perez@fibra']) {
      expect(ROUTEROS_ID_PATTERN.test(ok)).toBe(true);
    }
  });

  it('rechaza lo que agregaria parametros al comando', () => {
    for (const bad of ['', 'cliente 1', 'x password=1', '"x"', '-x', '*XYZ']) {
      expect(ROUTEROS_ID_PATTERN.test(bad)).toBe(false);
    }
  });
});
