import { Permission } from '@activepieces/core-utils';

import { authenticationSession } from './authentication-session';

export const routesThatRequireProjectId = {
  runs: '/runs',
  singleRun: '/runs/:runId',
  flows: '/flows',
  singleFlow: '/flows/:flowId',
  automations: '/automations',
  connections: '/connections',
  singleConnection: '/connections/:connectionId',
  variables: '/variables',
  singleAgent: '/agents/:agentId',
  singleAgentRuns: '/agents/:agentId/runs',
  tables: '/tables',
  singleTable: '/tables/:tableId',
  settings: '/settings',
  releases: '/releases',
  singleRelease: '/releases/:releaseId',
  approvals: '/approvals',
};

export const CHAT_ROUTE = '/chat';

export const determineDefaultRoute = ({
  checkAccess,
  chatEnabled,
  projectId = authenticationSession.getProjectId(),
}: {
  checkAccess: (permission: Permission) => boolean;
  chatEnabled?: boolean;
  projectId?: string | null;
}) => {
  const projectPrefix = projectId ? `/projects/${projectId}` : '';
  if (chatEnabled) {
    return CHAT_ROUTE;
  }
  if (checkAccess(Permission.READ_FLOW) || checkAccess(Permission.READ_TABLE)) {
    return `${projectPrefix}/automations`;
  }
  if (checkAccess(Permission.READ_RUN)) {
    return `${projectPrefix}/runs`;
  }
  return `${projectPrefix}/settings`;
};

export const TRIAL_KEY_QUERY_PARAM = 'licenseKey';
export const NEW_FLOW_QUERY_PARAM = 'newFlow';
export const NEW_TABLE_QUERY_PARAM = 'newTable';
