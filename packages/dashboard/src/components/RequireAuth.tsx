import { type ReactNode } from 'react';
import { Navigate } from 'react-router';

import { getPassword } from '../lib/auth';

export function RequireAuth({ children }: { children: ReactNode }) {
  if (!getPassword()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
