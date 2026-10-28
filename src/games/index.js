import * as xidach from './xidach/engine.js';
import * as tienlen from './tienlen/engine.js';
import * as holdem from './holdem/engine.js';

/** Registered game engines (common interface: see README → Architecture). */
export const GAMES = Object.freeze({ xidach, tienlen, holdem });

export const isGame = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(GAMES, id);
