import { type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { FrappeProvider, useFrappeAuth } from 'frappe-react-sdk';
import { ThemeProvider } from './lib/theme';
import { AppShell } from './components/AppShell';
import { MaterialRequests } from './pages/MaterialRequests';
import { NewMaterialRequest } from './pages/NewMaterialRequest';
import { PurchaseOrders } from './pages/PurchaseOrders';
import { NewPurchaseOrder } from './pages/NewPurchaseOrder';
import { Approvals } from './pages/Approvals';
import { Receipts } from './pages/Receipts';
import { NewReceipt } from './pages/NewReceipt';
import { ReceiptDetail } from './pages/ReceiptDetail';
import { Payments } from './pages/Payments';
import { PaymentDetail } from './pages/PaymentDetail';
import { Settings } from './pages/Settings';
import { Placeholder } from './pages/Placeholder';

function AuthGate({ children }: { children: ReactNode }) {
	const { currentUser, isLoading } = useFrappeAuth({ revalidateOnFocus: true });
	if (isLoading) return null;
	if (!currentUser || currentUser === 'Guest') {
		const deepLink = window.location.pathname + window.location.search;
		window.location.replace('/login?redirect-to=' + encodeURIComponent(deepLink));
		return null;
	}
	return <>{children}</>;
}

export default function App() {
	return (
		<FrappeProvider enableSocket={false}>
			<ThemeProvider>
				<AuthGate>
					<BrowserRouter basename="/procureflow">
						<Routes>
							<Route element={<AppShell />}>
								<Route index element={<MaterialRequests />} />
								<Route path="material-requests" element={<MaterialRequests />} />
								<Route path="material-requests/new" element={<NewMaterialRequest />} />
								<Route path="material-requests/:id" element={<NewMaterialRequest />} />
								<Route path="purchase-orders" element={<PurchaseOrders />} />
								<Route path="purchase-orders/new" element={<NewPurchaseOrder />} />
								<Route path="purchase-orders/:id" element={<NewPurchaseOrder />} />
								<Route path="approvals" element={<Approvals />} />
								<Route path="receipts" element={<Receipts />} />
								<Route path="receipts/new" element={<NewReceipt />} />
								<Route path="receipts/:id" element={<ReceiptDetail />} />
								<Route path="payments" element={<Payments />} />
								<Route path="payments/:id" element={<PaymentDetail />} />
								<Route path="settings" element={<Settings />} />
								<Route path="*" element={<Placeholder title="Not found" eyebrow="404" />} />
							</Route>
						</Routes>
					</BrowserRouter>
				</AuthGate>
			</ThemeProvider>
		</FrappeProvider>
	);
}
