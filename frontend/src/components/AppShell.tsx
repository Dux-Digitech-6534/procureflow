import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useFrappeAuth, useFrappeGetCall } from 'frappe-react-sdk';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../lib/theme';
import { API, type Capabilities } from '../lib/api';

// `cap` gates the nav entry to a capability flag (from capabilities()); items
// without a cap show for everyone. Admin roles unlock every capability server-side.
const NAV: { to: string; label: string; icon: IconName; cap?: keyof Capabilities }[] = [
	{ to: '/dashboard', label: 'Dashboard', icon: 'layers', cap: 'reports' },
	{ to: '/material-requests', label: 'Material requests', icon: 'file-text', cap: 'create_mr' },
	{ to: '/purchase-orders', label: 'Purchase orders', icon: 'cube', cap: 'read_po' },
	{ to: '/receipts', label: 'Receipts', icon: 'package', cap: 'receive' },
	{ to: '/approvals', label: 'Approvals', icon: 'shield-check', cap: 'approve' },
	{ to: '/payments', label: 'Payments', icon: 'banknote', cap: 'pay' },
	{ to: '/reports', label: 'Reports', icon: 'file-text-alt', cap: 'reports' },
];

// Phone bottom-tab bar: the four core documents get a thumb-reachable tab; the
// rest (Dashboard, Payments, Reports, Settings, theme) live behind "More".
const MOBILE_PRIMARY: { to: string; short: string; icon: IconName; cap?: keyof Capabilities }[] = [
	{ to: '/material-requests', short: 'Requests', icon: 'file-text', cap: 'create_mr' },
	{ to: '/purchase-orders', short: 'Orders', icon: 'cube', cap: 'read_po' },
	{ to: '/receipts', short: 'Receipts', icon: 'package', cap: 'receive' },
	{ to: '/approvals', short: 'Approvals', icon: 'shield-check', cap: 'approve' },
];
const PRIMARY_SET = new Set(MOBILE_PRIMARY.map((i) => i.to));
const MOBILE_MORE = NAV.filter((i) => !PRIMARY_SET.has(i.to));

const BRAND = import.meta.env.BASE_URL + 'brand/';
const COMPANY_LOGO = '/assets/procureflow/img/sanskruti-group-asia-logo.png';
const COLLAPSE_KEY = 'procureflow:nav-collapsed';

function initialsOf(user: string | null | undefined): string {
	if (!user) return '·';
	const local = user.split('@')[0];
	const parts = local.split(/[._\-\s]+/).filter(Boolean);
	const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
	return letters.toUpperCase();
}

function getInitialCollapsed(): boolean {
	try {
		return localStorage.getItem(COLLAPSE_KEY) === '1';
	} catch {
		return false;
	}
}

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : '');
const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'mtab on' : 'mtab');

/** True when the viewport is phone-width — reactive to rotation / fold-unfold.
 *  Used to bounce a phone visitor off the desktop site onto the /m mobile app. */
function usePhoneWidth(): boolean {
	const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 700px)').matches);
	useEffect(() => {
		const mq = window.matchMedia('(max-width: 700px)');
		const on = () => setPhone(mq.matches);
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	}, []);
	return phone;
}

/** Map a desktop route to its closest /m equivalent (else the mobile home). */
function mapToMobile(path: string): string {
	if (path.startsWith('/material-requests/new')) return '/m/requests/new';
	if (path.startsWith('/material-requests')) return '/m/requests';
	if (path.startsWith('/approvals')) return '/m/approvals';
	if (path.startsWith('/receipts')) return '/m/receipts';
	return '/m';
}

export function AppShell() {
	const { theme, toggle } = useTheme();
	const { currentUser, logout } = useFrappeAuth();
	const [collapsed, setCollapsed] = useState(getInitialCollapsed);
	const [moreOpen, setMoreOpen] = useState(false);
	const isPhone = usePhoneWidth();
	const location = useLocation();

	// Every nav entry is gated to its capability flag — a user only sees the
	// sections they're authorised for (Payments→Accounts, Reports→Report Viewer,
	// etc.). Admin roles unlock everything server-side. Until caps load we hide
	// gated items (fail-closed) so nothing unauthorised ever flashes.
	const capsRes = useFrappeGetCall<{ message: Capabilities }>(API.capabilities, undefined, 'pf:caps');
	const caps = capsRes.data?.message;
	const allow = (i: { cap?: keyof Capabilities }) => !i.cap || !!caps?.[i.cap];
	const navItems = NAV.filter(allow);
	const mobilePrimary = MOBILE_PRIMARY.filter(allow);
	const mobileMore = MOBILE_MORE.filter(allow);
	const showSettings = !!caps?.settings;

	async function doLogout() {
		try {
			await logout();
		} finally {
			// Carry redirect-to so the NEXT login comes straight back to ProcureFlow —
			// without it Frappe's login sends desk users to /app and web users to /me.
			window.location.href = '/login?redirect-to=' + encodeURIComponent('/procureflow');
		}
	}

	useEffect(() => {
		try {
			localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
		} catch {
			/* not persistable — toggle still works this session */
		}
	}, [collapsed]);

	// (a) A phone-width visitor on the desktop site is sent to the dedicated /m
	// mobile app (mapped to the matching screen). Tablets/foldables-unfolded keep
	// the full back-office. Browser "Desktop site" widens the viewport to escape.
	if (isPhone) return <Navigate to={mapToMobile(location.pathname)} replace />;

	return (
		<div className="layout">
			<aside className={collapsed ? 'sidebar collapsed' : 'sidebar'}>
				<div className="brand">
					<img className="cologo" src={COMPANY_LOGO} alt="Sanskruti" style={{ maxHeight: collapsed ? 30 : 52, width: 'auto' }} />
					<div className="btext">
						<div className="nm">
							Procure<em>Flow</em>
						</div>
					</div>
				</div>

				<nav className="snav">
					{navItems.map((item) => (
						<NavLink key={item.to} to={item.to} className={linkClass} title={collapsed ? item.label : undefined}>
							<Icon name={item.icon} size={16} />
							<span className="lbl">{item.label}</span>
						</NavLink>
					))}
					<div className="push" />
					{showSettings && (
						<NavLink to="/settings" className={linkClass} title={collapsed ? 'Settings' : undefined}>
							<Icon name="sliders" size={16} />
							<span className="lbl">Settings</span>
						</NavLink>
					)}
				</nav>

				<a className="duxcredit" href="https://duxdigitech.com" target="_blank" rel="noreferrer" title="Built by DUX Digitech">
					<span className="dxby">Built by</span>
					<img className="dx-l" src={BRAND + 'dux-logo.png'} alt="DUX Digitech" />
					<img className="dx-w" src={BRAND + 'dux-logo-white.png'} alt="DUX Digitech" />
				</a>

				<div className="sfoot">
					<button
						className="icbtn collapse-btn"
						onClick={() => setCollapsed((c) => !c)}
						title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
						aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
					>
						<Icon name="chevron" size={16} />
					</button>
					<button className="icbtn" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
						<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
					</button>
					<button className="icbtn" onClick={() => void doLogout()} title="Log out" aria-label="Log out">
						<Icon name="logout" size={16} />
					</button>
					<div className="usr" title={currentUser ?? ''}>
						{initialsOf(currentUser)}
					</div>
				</div>
			</aside>

			<div className="content">
				{/* Phone-only top bar (hidden ≥700px via CSS) */}
				<header className="mtopbar">
					<img className="mlogo" src={COMPANY_LOGO} alt="Sanskruti" />
					<div className="mtitle">
						Procure<em>Flow</em>
					</div>
					<div className="spacer" />
					<button className="icbtn" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
						<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
					</button>
					<div className="usr" title={currentUser ?? ''}>
						{initialsOf(currentUser)}
					</div>
				</header>

				<Outlet />

				{/* Phone-only bottom tab bar (hidden ≥700px via CSS) */}
				<nav className="mbottomnav">
					{mobilePrimary.map((item) => (
						<NavLink key={item.to} to={item.to} className={tabClass}>
							<Icon name={item.icon} size={19} />
							<span className="mtl">{item.short}</span>
						</NavLink>
					))}
					<button
						type="button"
						className={moreOpen ? 'mtab on' : 'mtab'}
						onClick={() => setMoreOpen(true)}
						aria-haspopup="dialog"
						aria-expanded={moreOpen}
					>
						<Icon name="sliders" size={19} />
						<span className="mtl">More</span>
					</button>
				</nav>

				{moreOpen && (
					<div
						className="msheet-overlay"
						onClick={(e) => {
							if (e.target === e.currentTarget) setMoreOpen(false);
						}}
					>
						<div className="msheet" role="dialog" aria-label="More navigation">
							<div className="msheet-grab" />
							<div className="msheet-list">
								{mobileMore.map((item) => (
									<NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setMoreOpen(false)}>
										<Icon name={item.icon} size={17} />
										<span>{item.label}</span>
									</NavLink>
								))}
								{showSettings && (
									<NavLink to="/settings" className={linkClass} onClick={() => setMoreOpen(false)}>
										<Icon name="sliders" size={17} />
										<span>Settings</span>
									</NavLink>
								)}
							</div>
							<div className="msheet-foot">
								<button className="msheet-logout" onClick={() => void doLogout()}>
									<Icon name="logout" size={17} /> Log out
								</button>
								<span className="msheet-user" title={currentUser ?? ''}>
									{currentUser}
								</span>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
