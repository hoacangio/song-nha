// Bot personalities. Each bot gets one at random when the host adds it; engines read the knobs.
//   can  — Cẩn thận: plays safe, rarely raises or calls Tichu
//   deu  — Điềm đạm: the balanced default
//   lieu — Liều lĩnh: hits more, raises more, bets bigger, bombs early
//   loc  — Lọc lõi: tricky — bluffs, slow-plays, saves its big cards
export const PERSONAS = Object.freeze({
  can: { xdStand: 15, xdBet: 1, hdRaise: 0.85, hdCall: 0.25, hdBluff: 0, tlKeepTwos: 6, tcTichu: 8.5, tcGrand: 99, tcBomb: 1 },
  deu: { xdStand: 17, xdBet: 1, hdRaise: 0.78, hdCall: 0.15, hdBluff: 0.03, tlKeepTwos: 0, tcTichu: 7, tcGrand: 5.5, tcBomb: 2 },
  lieu: { xdStand: 18, xdBet: 3, hdRaise: 0.66, hdCall: 0.05, hdBluff: 0.1, tlKeepTwos: 0, tcTichu: 5.5, tcGrand: 4.5, tcBomb: 5 },
  loc: { xdStand: 16, xdBet: 2, hdRaise: 0.82, hdCall: 0.12, hdBluff: 0.18, tlKeepTwos: 8, tcTichu: 6.5, tcGrand: 5, tcBomb: 3 },
});
/** Bot names (Vietnamese, the app's default language): the personality plus a number. */
export const PERSONA_NAMES = Object.freeze({ can: 'Cẩn thận', deu: 'Điềm đạm', lieu: 'Liều lĩnh', loc: 'Lọc lõi' });
export const PERSONA_IDS = Object.keys(PERSONAS);

export const randomPersona = (rand = Math.random) => PERSONA_IDS[Math.floor(rand() * PERSONA_IDS.length)];

/** Knobs for the bot in this seat (old tables without a persona behave like "deu"). */
export const personaOf = (t, seat) => PERSONAS[t.seats[seat]?.persona] ?? PERSONAS.deu;
