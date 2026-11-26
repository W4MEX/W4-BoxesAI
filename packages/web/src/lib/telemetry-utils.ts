import { acquisitionUtils } from './acquisition-utils';

export const telemetryUtils = {
  resetIdentity: () => acquisitionUtils.clearAcquisitionParams(),
  getSessionId: (): string | null => null,
};
