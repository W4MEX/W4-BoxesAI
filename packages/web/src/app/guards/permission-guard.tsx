import { Permission } from '@activepieces/core-utils';
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { LoadingSpinner } from '@/components/custom/spinner';
import { useAuthorization } from '@/hooks/authorization-hooks';

export const RoutePermissionGuard = ({
  requiredPermissions: permission,
  children,
}: {
  children: ReactNode;
  requiredPermissions: Permission | Permission[];
}) => {
  const { checkAccess, isFetchingProjectRole } = useAuthorization();
  const permissions = Array.isArray(permission) ? permission : [permission];
  if (isFetchingProjectRole) {
    return <LoadingSpinner isLarge={true} />;
  }
  const hasAccess = permissions.some((p) => checkAccess(p));
  if (!hasAccess) {
    return <Navigate replace={true} to="/404"></Navigate>;
  }
  return children;
};
