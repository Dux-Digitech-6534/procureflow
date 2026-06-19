import { NavLink, Outlet } from 'react-router-dom';
import { useFrappeAuth } from 'frappe-react-sdk';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../lib/theme';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
	{ to: '/material-requests', label: 'Material requests', icon: 'file-text' },
	{ to: '/purchase-orders', label: 'Purchase orders', icon: 'cube' },
	{ to: '/payments', label: 'Payments', icon: 'banknote' },
];

const BRAND = import.meta.env.BASE_URL + 'brand/';
const COMPANY_LOGO = '/assets/procureflow/img/sanskruti-group-asia-logo.png';

function initialsOf(user: string | null | undefined): string {
	if (!user) return '·';
	const local = user.split('@')[0];
	const parts = local.split(/[._\-\s]+/).filter(Boolean);
	const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
	return letters.toUpperCase();
}

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : '');

export function AppShell() {
	const { theme, toggle } = useTheme();
	const { currentUser } = useFrappeAuth();

	return (
		<div className="layout">
			<aside className="sidebar">
				<div className="brand">
					<img className="cologo" src={COMPANY_LOGO} alt="Sanskruti" style={{ maxHeight: 34 }} />
					<div className="btext">
						<div className="nm">
							Procure<em>Flow</em>
						</div>
					</div>
				</div>

				<nav className="snav">
					{NAV.map((item) => (
						<NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
							<Icon name={item.icon} size={16} />
							<span className="lbl">{item.label}</span>
						</NavLink>
					))}
					<div className="push" />
					<NavLink to="/settings" className={linkClass}>
						<Icon name="sliders" size={16} />
						<span className="lbl">Settings</span>
					</NavLink>
				</nav>

				<a className="duxcredit" href="https://duxdigitech.com" target="_blank" rel="noreferrer" title="Built by DUX Digitech">
					<span className="dxby">Built by</span>
					<img className="dx-l" src={BRAND + 'dux-logo.png'} alt="DUX Digitech" />
					<img className="dx-w" src={BRAND + 'dux-logo-white.png'} alt="DUX Digitech" />
				</a>

				<div className="sfoot">
					<button className="icbtn" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
						<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
					</button>
					<div className="usr" title={currentUser ?? ''}>
						{initialsOf(currentUser)}
					</div>
				</div>
			</aside>

			<div className="content">
				<Outlet />
			</div>
		</div>
	);
}
