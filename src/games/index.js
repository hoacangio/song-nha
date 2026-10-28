import * as xidach from './xidach/engine.js';
import * as tienlen from './tienlen/engine.js';
import * as holdem from './holdem/engine.js';
import * as maubinh from './maubinh/engine.js';
import * as tichu from './tichu/engine.js';

/** Registered game engines (common interface: see README → Architecture). */
export const GAMES = Object.freeze({ xidach, tienlen, holdem, maubinh, tichu });

export const isGame = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(GAMES, id);
