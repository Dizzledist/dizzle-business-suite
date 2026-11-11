import { resolve } from 'node:path';
import { privatePublishingPath } from './private-path';

export function stagingPreflight(env: Record<string, string | undefined>, options: { nodeVersion: string; checkoutEnvExists: boolean; liveWorkerDisabled: boolean; liveReadsDisabled: boolean }) {
  const blockers: string[] = [];
  if (!/^24\./.test(options.nodeVersion)) blockers.push('Use the reviewed Node 24.x runtime.');
  if (env.DIZZLE_PILOT_PRIVATE_ONLY !== '1') blockers.push('Explicitly acknowledge private fixture-only staging with DIZZLE_PILOT_PRIVATE_ONLY=1.');
  if (env.SOCIAL_EXPECTED_HANDLE !== '@cheddrco_') blockers.push('Pin SOCIAL_EXPECTED_HANDLE=@cheddrco_ for the first Cheddr X connection.');
  if (env.NODE_ENV === 'production') blockers.push('The fixture API cannot run as production authentication.');
  if (options.checkoutEnvExists) blockers.push('Do not put a .env file in the staging checkout; use the private service EnvironmentFile.');
  if (!options.liveWorkerDisabled || !options.liveReadsDisabled) blockers.push('Both reviewed live provider gates must remain hard-disabled.');
  const marketing = env.DIZZLE_MARKETING_DIR, publishing = env.DIZZLE_PUBLISHING_DIR;
  if (!marketing || !publishing) blockers.push('Set both explicit persistent storage directories.');
  else {
    try { privatePublishingPath(marketing); privatePublishingPath(publishing); if (resolve(marketing) !== resolve(publishing)) blockers.push('Use one identical private directory for marketing, queue and token vault in this pilot.'); }
    catch { blockers.push('Persistent storage must be an absolute private path outside the checkout.'); }
  }
  return { readyForPrivateTestStaging: blockers.length === 0, publicExposureAllowed: false, livePublishingEnabled: false,
    account: '@cheddrco_', accountReadiness: 'Not verified by preflight; confirm OAuth identity and console endpoint access.', blockers,
    privateSettingsPresent: Object.fromEntries(['X_CLIENT_ID', 'X_CLIENT_SECRET', 'SOCIAL_TOKEN_KEY', 'SOCIAL_OAUTH_REDIRECT_URI'].map(name => [name, !!env[name]])) };
}
