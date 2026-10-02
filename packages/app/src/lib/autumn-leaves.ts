/** Persisted opt-out for the October falling-leaves decoration. */
export const AUTUMN_LEAVES_STORAGE_KEY = 'inferencex-autumn-leaves';
export const AUTUMN_LEAVES_OFF_VALUE = 'off';
/** Set on `<html>` while the leaves are hidden, before first paint when possible. */
export const AUTUMN_LEAVES_OFF_ATTRIBUTE = 'data-autumn-leaves-off';

export const autumnLeavesPrepaintScript = `try{if(localStorage.getItem(${JSON.stringify(
  AUTUMN_LEAVES_STORAGE_KEY,
)})===${JSON.stringify(AUTUMN_LEAVES_OFF_VALUE)}){document.documentElement.setAttribute(${JSON.stringify(
  AUTUMN_LEAVES_OFF_ATTRIBUTE,
)},'')}}catch{}`;
