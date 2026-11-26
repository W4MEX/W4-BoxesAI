import { TemplateTelemetryEvent } from '@activepieces/shared';

export const templatesTelemetryApi = {
  async sendEvent(_event: TemplateTelemetryEvent): Promise<void> {
    // W4 does not report template activity to third parties.
  },
};
