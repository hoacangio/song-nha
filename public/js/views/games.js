// Per-game view modules: seat extras, felt centre, bottom dock, options form, history labels.
import { xidachSeat, xidachCenter, xidachDock, xidachOptionsForm, readXidachOptions, kindLabel } from './xidach.js';
import { tienlenSeat, tienlenCenter, tienlenDock, tienlenOptionsForm, readTienlenOptions, tienlenKindLabel } from './tienlen.js';

export const GAME_VIEWS = {
  xidach: {
    seat: xidachSeat,
    center: xidachCenter,
    dock: xidachDock,
    options: xidachOptionsForm,
    readOptions: readXidachOptions,
    kindLabel,
  },
  tienlen: {
    seat: tienlenSeat,
    center: tienlenCenter,
    dock: tienlenDock,
    options: tienlenOptionsForm,
    readOptions: readTienlenOptions,
    kindLabel: tienlenKindLabel,
  },
};
