import { TelemetryEvent } from '@activepieces/shared';
import React from 'react';

const TelemetryContext = React.createContext({
  capture: (_event: TelemetryEvent): void => { /* External telemetry is disabled in W4. */ },
});

export const useTelemetry = () => React.useContext(TelemetryContext);

export const TelemetryProvider = ({ children }: React.PropsWithChildren) => (
  <TelemetryContext.Provider value={React.useContext(TelemetryContext)}>
    {children}
  </TelemetryContext.Provider>
);
export default TelemetryProvider;
