import { t } from 'i18next';

import { SettingsPanel } from '@/app/components/admin';

export const TelemetrySection = () => (
  <SettingsPanel title={t('Telemetry')}>
    <p className="text-sm text-muted-foreground">
      {t('External telemetry is disabled in W4-BoxesAI.')}
    </p>
  </SettingsPanel>
);
