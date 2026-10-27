import * as xidach from './xidach/engine.js';

/** Registered game engines. Tiến lên and Hold'em plug in here with the same interface. */
export const GAMES = Object.freeze({ xidach });

export const isGame = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(GAMES, id);
