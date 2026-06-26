import { type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { FrappeProvider, useFrappeAuth } from 'frappe-react-sdk';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './components/Toast';
import { AppShell } from './components/AppShell';
import { RequireReports } from './components/RequireReports';
import { Dashboard } from './pages/Dashboard';
import { Reports } from './pages/Reports';
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
import { MobileShell } from './mobile/MobileShell';
import { MHome } from './mobile/MHome';
import { MRequests } from './mobile/MRequests';
import { MNewRequest } from './mobile/MNewRequest';
import { MApprovals } from './mobile/MApprovals';
import { MReceipts } from './mobile/MReceipts';
import { MReceive } from './mobile/MReceive';
import { MPurchaseOrders } from './mobile/MPurchaseOrders';
import { MPurchaseReceipts } from './mobile/MPurchaseReceipts';
import { MProfile } from './mobile/MProfile';
import { MNotifications } from './mobile/MNotifications';
import { MStock } from './mobile/MStock';

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
				<ToastProvider>
					<AuthGate>
						<BrowserRouter basename="/procureflow">
							<Routes>
								{/* Dedicated lean mobile app (Phase B): its own shell + bottom tabs,
								    scoped to material requests, approvals and receipts. Later wrapped
								    by Capacitor into the Android app. */}
								<Route path="m" element={<MobileShell />}>
									<Route index element={<MHome />} />
									<Route path="requests" element={<MRequests />} />
									<Route path="requests/new" element={<MNewRequest />} />
									<Route path="approvals" element={<MApprovals />} />
									<Route path="receipts" element={<MReceipts />} />
									<Route path="receipts/:po" element={<MReceive />} />
									<Route path="orders" element={<MPurchaseOrders />} />
									<Route path="receipt-history" element={<MPurchaseReceipts />} />
									<Route path="profile" element={<MProfile />} />
									<Route path="notifications" element={<MNotifications />} />
									<Route path="stock" element={<MStock />} />
								</Route>
								<Route element={<AppShell />}>
									<Route index element={<MaterialRequests />} />
									<Route path="dashboard" element={<Dashboard />} />
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
									<Route path="reports" element={<RequireReports><Reports /></RequireReports>} />
									<Route path="reports/:slug" element={<RequireReports><Reports /></RequireReports>} />
									<Route path="settings" element={<Settings />} />
									<Route path="*" element={<Placeholder title="Not found" eyebrow="404" />} />
								</Route>
							</Routes>
						</BrowserRouter>
					</AuthGate>
				</ToastProvider>
			</ThemeProvider>
		</FrappeProvider>
	);
}
