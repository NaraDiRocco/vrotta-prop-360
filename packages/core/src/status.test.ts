import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_STATUS,
  INFO_TOKEN,
  isInformationalHotspot,
  isUnitStatus,
  STATUS_TOKENS,
  UNIT_STATUSES,
} from './status.ts';

test('UNIT_STATUSES incluye "proximamente" como estado de primera clase', () => {
  assert.ok(UNIT_STATUSES.includes('proximamente'));
  assert.ok(isUnitStatus('proximamente'));
});

test('STATUS_TOKENS trae un token completo para cada estado, incluido proximamente', () => {
  for (const status of UNIT_STATUSES) {
    const token = STATUS_TOKENS[status];
    assert.ok(token, `falta STATUS_TOKENS.${status}`);
    assert.equal(typeof token.base, 'string');
    assert.equal(typeof token.fill, 'number');
    assert.equal(typeof token.label, 'string');
    assert.equal(typeof token.order, 'number');
  }
});

test('proximamente es "chip de contorno": sin relleno, para no confundirse con disponible/vendido', () => {
  const token = STATUS_TOKENS.proximamente;
  assert.equal(token.fill, 0);
  assert.equal(token.pattern, 'outline');
  // Ningún otro estado comercial (no informativo) comparte esta combinación:
  // así "próximamente" nunca se ve como un estado más "lleno" por error.
  for (const status of UNIT_STATUSES) {
    if (status === 'proximamente') continue;
    assert.ok(
      !(STATUS_TOKENS[status].fill === 0 && STATUS_TOKENS[status].pattern === 'outline'),
      `"${status}" no debería compartir el estilo de contorno de "proximamente"`,
    );
  }
});

test('proximamente no es un fallback ni un hotspot informativo', () => {
  assert.notEqual(FALLBACK_STATUS, 'proximamente');
  assert.notEqual(STATUS_TOKENS.proximamente.base, INFO_TOKEN.base);
  // Un hotspot de bloque "próximamente" SÍ tiene unitCode (B1, B3): no es
  // informativo como un amenity.
  assert.equal(isInformationalHotspot({ unitCode: 'B1' }), false);
});

test('isUnitStatus rechaza el viejo valor hack "proximamente" sólo si algún día cambia de nombre (regresión de contrato)', () => {
  // Sigue siendo válido HOY porque ahora es un token real, no el fallback:
  assert.equal(isUnitStatus('proximamente'), true);
  assert.equal(isUnitStatus('inventado_no_existe'), false);
});
