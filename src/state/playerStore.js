// Back-compat shim. The real store moved to profileStore — it now also
// holds Steel + display name + future profile fields. Existing imports
// keep working through these re-exports.

export {
  useHustle,
  getHustle,
  setHustle,
  addHustle,
  spendHustle,
} from './profileStore'
