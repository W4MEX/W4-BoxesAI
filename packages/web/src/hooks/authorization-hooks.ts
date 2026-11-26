import { isNil, Permission } from '@activepieces/core-utils';
import { PlatformRole } from '@activepieces/shared';
import { useQuery } from '@tanstack/react-query';

import { authenticationApi } from '@/api/authentication-api';
import { platformApi } from '@/api/platforms-api';
import { userHooks } from '@/hooks/user-hooks';
import { authenticationSession } from '@/lib/authentication-session';

export const useAuthorization = (projectId?: string) => {
  const platformId = authenticationSession.getPlatformId();
  const scopedProjectId = projectId ?? authenticationSession.getProjectId();
  const { data: projectRole, isLoading } = useQuery({
    queryKey: ['project-role', platformId, scopedProjectId],
    queryFn: async () => {
      const platform = await platformApi.getCurrentPlatform();
      if (platform.plan.projectRolesEnabled) {
        const projectRole = await authenticationApi.getCurrentProjectRole({
          projectId: scopedProjectId ?? '',
        });
        return projectRole;
      }
      return null;
    },
    retry: false,
    enabled: !isNil(platformId) && !isNil(scopedProjectId),
  });

  const checkAccess = (permission: Permission) => {
    if (isLoading) return false;

    return projectRole?.permissions?.includes(permission) ?? false;
  };

  return { checkAccess, isFetchingProjectRole: isLoading };
};

export const useIsPlatformAdmin = () => {
  const platformRole = userHooks.getCurrentUserPlatformRole();
  return platformRole === PlatformRole.ADMIN;
};

export const useIsPlatformPrivileged = () => {
  const platformRole = userHooks.getCurrentUserPlatformRole();
  return (
    platformRole === PlatformRole.ADMIN ||
    platformRole === PlatformRole.OPERATOR
  );
};
