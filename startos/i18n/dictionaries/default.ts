export const DEFAULT_LANG = 'en_US';

const dict = {
  // main.ts
  'Starting Hashrate Autopilot': 0,
  Dashboard: 1,
  'The dashboard is ready': 2,
  'The dashboard is not responding': 3,
  'Bitcoin is not reachable on the internal network. Make sure Bitcoin is installed and running.': 4,
  'Electrs is not reachable on the internal network. Make sure Electrs is installed and running.': 5,
  'Datum Gateway is not reachable on the internal network. Make sure Datum Gateway is installed and running.': 6,
  "Bitcoin's RPC cookie could not be read. Start Bitcoin and wait for it to come up, then start Hashrate Autopilot again.": 7,

  // interfaces.ts
  'The Hashrate Autopilot dashboard, setup wizard and API': 8,

  // main.ts — setup state
  'Setup': 9,
  'Checking setup state…': 10,
  'Setup is not finished. Until you complete the wizard, anyone who can reach this address can claim this instance and set its password. Open the dashboard and finish setup now.': 11,
  'Setup is complete': 12,
} as const;

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict;
export type LangDict = Record<(typeof dict)[I18nKey], string>;
export default dict;
