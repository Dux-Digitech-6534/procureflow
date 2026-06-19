import { NavLink, Outlet } from 'react-router-dom';
import { useTheme } from '../lib/theme';

const ClipboardIcon = () => (
	<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
		<rect x="8" y="3" width="8" height="4" rx="1" />
		<path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" />
		<path d="M8 12h8M8 16h5" />
	</svg>
);
const CartIcon = () => (
	<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
		<circle cx="9" cy="20" r="1.4" />
		<circle cx="18" cy="20" r="1.4" />
		<path d="M2 3h2.2l2 12.2a1.6 1.6 0 0 0 1.6 1.3h9.4a1.6 1.6 0 0 0 1.6-1.3L21.5 7H6" />
	</svg>
);
const WalletIcon = () => (
	<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
		<rect x="3" y="6" width="18" height="13" rx="2.5" />
		<path d="M3 10h18" />
		<path d="M7 15h3" />
	</svg>
);

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : undefined);

export function AppShell() {
	const { theme, toggle } = useTheme();
	return (
		<div className="layout">
			<aside className="sidebar">
				<div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
					<div
						style={{
							width: 30,
							height: 30,
							borderRadius: 9,
							background: 'var(--brand-grad)',
							display: 'grid',
							placeItems: 'center',
							color: '#fff',
							fontWeight: 700,
							fontSize: 14,
							flex: 'none',
						}}
					>
						P
					</div>
					<div>
						<div className="nm" style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-.02em' }}>
							Procure
							<em
								style={{
									fontStyle: 'normal',
									background: 'var(--brand-grad)',
									WebkitBackgroundClip: 'text',
									backgroundClip: 'text',
									color: 'transparent',
								}}
							>
								Flow
							</em>
						</div>
						<div
							style={{
								fontSize: 10,
								color: 'var(--fg-3)',
								letterSpacing: '.08em',
								textTransform: 'uppercase',
							}}
						>
							Sanskruti
						</div>
					</div>
				</div>

				<nav className="snav">
					<NavLink to="/material-requests" className={navClass}>
						<ClipboardIcon />
						<span className="lbl">Material requests</span>
					</NavLink>
					<NavLink to="/purchase-orders" className={navClass}>
						<CartIcon />
						<span className="lbl">Purchase orders</span>
					</NavLink>
					<NavLink to="/payments" className={navClass}>
						<WalletIcon />
						<span className="lbl">Payments</span>
					</NavLink>

					<button
						className="snav-toggle push"
						onClick={toggle}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							fontSize: 13,
							fontWeight: 500,
							color: 'var(--fg-2)',
							background: 'none',
							border: 0,
							padding: '9px 11px',
							borderRadius: 10,
							cursor: 'pointer',
							fontFamily: 'var(--font-ui)',
						}}
					>
						{theme === 'dark' ? '☀' : '☾'}
						<span className="lbl">{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
					</button>
				</nav>

				<a className="duxcredit" href="https://duxdigitech.com" target="_blank" rel="noreferrer">
					<span className="dxby">Built by</span>
					<span style={{ fontWeight: 700, letterSpacing: '-.01em', color: 'var(--fg-1)' }}>
						DUX Digitech
					</span>
				</a>
			</aside>

			<div className="content">
				<Outlet />
			</div>
		</div>
	);
}
