import { createContext, useContext, type ReactNode } from 'react';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, type Capabilities } from '../lib/api';

/** Default-deny: until capabilities load (or if they fail), gate everything off
 *  so a user never briefly sees a screen they're not entitled to. */
const DENY: Capabilities = {
	create_mr: false,
	receive: false,
	read_po: false,
	read_pr: false,
	read_stock: false,
	approve: false,
};

const Ctx = createContext<Capabilities>(DENY);

export function CapsProvider({ children }: { children: ReactNode }) {
	const { data } = useFrappeGetCall<{ message: Capabilities }>(API.capabilities, {});
	return <Ctx.Provider value={data?.message ?? DENY}>{children}</Ctx.Provider>;
}

/** Current user's capability flags (gating which mobile screens/actions show). */
export function useCaps(): Capabilities {
	return useContext(Ctx);
}
