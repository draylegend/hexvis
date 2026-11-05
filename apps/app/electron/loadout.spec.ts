import { orderSpells, readLoadout } from './loadout';

// First entry of /lol-perks/v1/recommended-pages/champion/86/position/TOP/map/11 as the
// Client answered it, trimmed to the fields the applier reads.
const PRECISION = 8000;
const SORCERY = 8200;
const CONQUEROR = 8010;
const TRIUMPH = 9111;
const FLASH = 4;
const IGNITE = 14;
const HEAL = 7;

const recommendation = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  keystone: { id: CONQUEROR, name: 'Conqueror' },
  perks: [{ id: CONQUEROR }, { id: TRIUMPH }],
  primaryPerkStyleId: PRECISION,
  secondaryPerkStyleId: SORCERY,
  summonerSpellIds: [FLASH, IGNITE],
  ...overrides,
});

describe('loadout', () => {
  it('reads runes and spells of the first recommended page', () => {
    expect(
      readLoadout([recommendation({}), recommendation({ primaryPerkStyleId: SORCERY })]),
    ).toStrictEqual({
      keystone: 'Conqueror',
      perkIds: [CONQUEROR, TRIUMPH],
      primaryStyleId: PRECISION,
      spellIds: [FLASH, IGNITE],
      subStyleId: SORCERY,
    });
  });

  it('rejects empty and malformed recommendations', () => {
    const payloads = [
      undefined,
      [],
      { errorCode: 'RPC_ERROR' },
      [recommendation({ perks: [] })],
      [recommendation({ perks: [{ id: '8010' }] })],
      [recommendation({ summonerSpellIds: [FLASH] })],
      [recommendation({ primaryPerkStyleId: undefined })],
    ];
    for (const payload of payloads) {
      expect(readLoadout(payload)).toBeUndefined();
    }
  });
});

describe('spell slots', () => {
  it('keeps a spell the player already has in its slot', () => {
    expect(orderSpells([FLASH, HEAL], [IGNITE, FLASH])).toStrictEqual([HEAL, FLASH]);
    expect(orderSpells([FLASH, HEAL], [HEAL, IGNITE])).toStrictEqual([HEAL, FLASH]);
    expect(orderSpells([FLASH, HEAL], [FLASH, IGNITE])).toStrictEqual([FLASH, HEAL]);
    expect(orderSpells([FLASH, HEAL], [undefined, undefined])).toStrictEqual([FLASH, HEAL]);
  });
});
