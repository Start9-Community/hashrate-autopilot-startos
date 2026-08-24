import { sdk } from '../sdk';

// No StartOS actions: setup, configuration, run-mode selection and diagnostics
// all live in Hashrate Autopilot's own dashboard.
export const actions = sdk.Actions.of();
