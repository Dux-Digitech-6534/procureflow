import { useEffect, useRef, useState, type ReactNode, type TouchEvent as RTouchEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { LangProvider, useLang } from './i18n';

const TABS: { to: string; labelKey: string; icon: IconName }[] = [
	{ to: '/m', labelKey: 'nav.home', icon: 'layers' },
	{ to: '/m/requests', labelKey: 'nav.requests', icon: 'file-text' },
	{ to: '/m/approvals', labelKey: 'nav.approvals', icon: 'shield-check' },
	{ to: '/m/receipts', labelKey: 'nav.receipts', icon: 'package' },
];
const TAB_ROOTS = TABS.map((t) => t.to);

/** Sticky top app bar. Pages render their own so they can set the title and a
 *  right-side action; a back chevron is shown when `backTo` is given. */
export function MHeader({ title, backTo, right, onBack }: { title: ReactNode; backTo?: string; right?: ReactNode; onBack?: () => void }) {
	const nav = useNavigate();
	const goBack = () => {
		if (onBack) onBack();
		else if (backTo) nav(backTo);
		else nav(-1);
	};
	return (
		<header className="top">
			{(backTo !== undefined || onBack) && (
				<button className="back" onClick={goBack} aria-label="Back">
					<Icon name="chevron" size={22} />
				</button>
			)}
			<span className="ttl">{title}</span>
			<span className="sp" />
			{right}
		</header>
	);
}

export function MobileShell() {
	return (
		<LangProvider>
			<ShellInner />
		</LangProvider>
	);
}

function ShellInner() {
	const { pathname } = useLocation();
	const { t } = useLang();
	const showTabs = TAB_ROOTS.includes(pathname);

	return (
		<div className="mscope">
			<Outlet />
			{showTabs && (
				<nav className="tabs">
					{TABS.map((tab) => (
						<NavLink key={tab.to} to={tab.to} end={tab.to === '/m'} className={({ isActive }) => (isActive ? 'on' : '')}>
							<Icon name={tab.icon} size={20} />
							<span className="tl">{t(tab.labelKey)}</span>
						</NavLink>
					))}
				</nav>
			)}
		</div>
	);
}

/** Centered loading / empty / error helpers reused across mobile screens. */
export function MLoad({ children }: { children?: ReactNode }) {
	const { t } = useLang();
	return <div className="mload">{children ?? t('common.loading')}</div>;
}
export function MEmpty({ icon = 'sparkle', title, sub }: { icon?: IconName; title: string; sub?: string }) {
	return (
		<div className="mempty">
			<div className="ei">
				<Icon name={icon} size={26} />
			</div>
			<div className="et">{title}</div>
			{sub && <div className="es">{sub}</div>}
		</div>
	);
}

/** Rounded search field used at the top of the mobile list screens. */
export function MSearch({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
}) {
	return (
		<div className="msearch">
			<Icon name="search" size={17} />
			<input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				inputMode="search"
				autoComplete="off"
			/>
			{value && (
				<button className="msearch-x" onClick={() => onChange('')} aria-label="Clear search">
					<Icon name="close" size={14} />
				</button>
			)}
		</div>
	);
}

/** Horizontally-scrollable filter chips with live counts. Caller decides which
 *  chips to include (e.g. hide zero-count ones) and computes each count. */
export function MChips({
	options,
	value,
	onChange,
}: {
	options: { key: string; label: string; count: number }[];
	value: string;
	onChange: (k: string) => void;
}) {
	return (
		<div className="mchips">
			{options.map((o) => (
				<button key={o.key} className={'mchip' + (value === o.key ? ' on' : '')} onClick={() => onChange(o.key)}>
					{o.label}
					<span className="cnt">{o.count}</span>
				</button>
			))}
		</div>
	);
}

/**
 * Pull-to-refresh wrapper for the list screens. Tracks a downward drag while the
 * page is scrolled to the top and, past a threshold, runs `onRefresh` (typically
 * SWR mutate). Purely touch-driven so it no-ops on desktop pointers.
 */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown> | unknown; children: ReactNode }) {
	const [dist, setDist] = useState(0);
	const [busy, setBusy] = useState(false);
	const startY = useRef<number | null>(null);
	const active = useRef(false);
	const THRESHOLD = 70;
	const MAX = 100;

	function onTouchStart(e: RTouchEvent<HTMLDivElement>) {
		if (busy) return;
		const top = window.scrollY || document.documentElement.scrollTop || 0;
		if (top > 0) return;
		startY.current = e.touches[0].clientY;
		active.current = true;
	}
	function onTouchMove(e: RTouchEvent<HTMLDivElement>) {
		if (!active.current || busy || startY.current === null) return;
		const dy = e.touches[0].clientY - startY.current;
		if (dy <= 0) {
			setDist(0);
			return;
		}
		setDist(Math.min(MAX, dy * 0.5));
	}
	async function onTouchEnd() {
		if (!active.current) return;
		active.current = false;
		startY.current = null;
		if (dist >= THRESHOLD && !busy) {
			setBusy(true);
			try {
				await onRefresh();
			} finally {
				setBusy(false);
			}
		}
		setDist(0);
	}

	const offset = busy ? Math.round(THRESHOLD * 0.7) : dist;
	return (
		<div className="ptr" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
			<div className="ptr-ind" style={{ height: offset }}>
				<span
					className={'ptr-spin' + (busy ? ' on' : '')}
					style={{
						opacity: busy ? 1 : Math.min(1, dist / THRESHOLD),
						...(busy ? {} : { transform: `rotate(${Math.round(dist * 3)}deg)` }),
					}}
				>
					<Icon name="refresh" size={18} />
				</span>
			</div>
			<div
				className="ptr-body"
				style={{ transform: `translateY(${offset}px)`, transition: active.current ? 'none' : 'transform 0.25s var(--ease)' }}
			>
				{children}
			</div>
		</div>
	);
}

/**
 * Guards a phone task form against accidental exit. While `dirty`, it pushes a
 * sentinel history entry so the device/gesture Back button is intercepted and
 * surfaces a confirm (via `confirming`) instead of leaving and losing the work.
 */
export function useExitGuard(dirty: boolean) {
	const [confirming, setConfirming] = useState(false);
	useEffect(() => {
		if (!dirty) return;
		window.history.pushState(null, '');
		const onPop = () => {
			window.history.pushState(null, '');
			setConfirming(true);
		};
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	}, [dirty]);
	return { confirming, setConfirming };
}

/** Bottom-sheet confirmation (e.g. "Leave without saving?"). */
export function ConfirmSheet({
	title,
	message,
	cancelLabel,
	confirmLabel,
	onCancel,
	onConfirm,
}: {
	title: string;
	message: string;
	cancelLabel?: string;
	confirmLabel?: string;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const { t } = useLang();
	return (
		<div className="mscope-sheet-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
			<div className="mscope-sheet" role="dialog" aria-label={title}>
				<div className="grab" />
				<div className="confirm-body">
					<div className="confirm-t">{title}</div>
					<div className="confirm-m">{message}</div>
				</div>
				<div className="sfoot">
					<button className="mbtn sec" style={{ flex: 1 }} onClick={onCancel}>
						{cancelLabel ?? t('common.keepEditing')}
					</button>
					<button className="mbtn danger" style={{ flex: 1 }} onClick={onConfirm}>
						{confirmLabel ?? t('common.leave')}
					</button>
				</div>
			</div>
		</div>
	);
}
