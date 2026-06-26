import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, type Capabilities } from '../lib/api';

/** Gate the Reports route to admins / Report Viewer. Direct-URL visitors without
 *  the capability are bounced to the dashboard. Shares the 'pf:caps' SWR key with
 *  AppShell so capabilities are fetched once. */
export function RequireReports({ children }: { children: ReactNode }) {
	const { data, isLoading, error } = useFrappeGetCall<{ message: Capabilities }>(API.capabilities, undefined, 'pf:caps');
	if (isLoading || (!data && !error)) return null;
	return data?.message?.reports ? <>{children}</> : <Navigate to="/dashboard" replace />;
}
