import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrappeAuth, useFrappeGetCall } from 'frappe-react-sdk';
import { API, mrDisplayStatus, type MrListRow } from '../lib/api';
import { Icon } from '../components/Icon';
import { fmtDate } from '../lib/format';
import { MHeader, MLoad, MEmpty, MSearch, MChips, PullToRefresh } from './MobileShell';
import { MrDetailSheet } from './MrDetailSheet';
import { useLang, tStatus } from './i18n';

/** Coarse lifecycle bucket for a request, used by the status filter chips. */
function mrGroup(r: MrListRow): string {
	switch (mrDisplayStatus(r).label) {
		case 'Draft':
			return 'draft';
		case 'Pending approval':
			return 'pending';
		case 'Approved':
			return 'approved';
		case 'Ordered':
		case 'Partially ordered':
			return 'ordered';
		case 'Received':
		case 'Partially received':
			return 'received';
		case 'Rejected':
			return 'rejected';
		default: // Cancelled / Stopped — only surface under "All"
			return 'other';
	}
}

const STATUS_FILTERS: { key: string; label: string }[] = [
	{ key: 'all', label: 'common.all' },
	{ key: 'draft', label: 'status.draft' },
	{ key: 'pending', label: 'status.pending' },
	{ key: 'approved', label: 'status.approved' },
	{ key: 'ordered', label: 'status.ordered' },
	{ key: 'received', label: 'status.received' },
	{ key: 'rejected', label: 'status.rejected' },
];

export function MRequests() {
	const nav = useNavigate();
	const { t } = useLang();
	const { currentUser } = useFrappeAuth();
	const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: MrListRow[] }>(API.mrList, {});
	const [open, setOpen] = useState<string | null>(null);
	const [q, setQ] = useState('');
	const [status, setStatus] = useState('all');
	const [showDates, setShowDates] = useState(false);
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');

	// My requests only.
	const base = useMemo(
		() => (data?.message ?? []).filter((r) => r.owner === currentUser),
		[data, currentUser],
	);

	// Text + required-by date filter run first so chip counts reflect them.
	const filtered = useMemo(() => {
		const ql = q.trim().toLowerCase();
		const inRange = (d: string | null) => {
			if (!from && !to) return true;
			if (!d) return false;
			if (from && d < from) return false;
			if (to && d > to) return false;
			return true;
		};
		return base.filter(
			(r) =>
				inRange(r.schedule_date) &&
				(!ql ||
					r.name.toLowerCase().includes(ql) ||
					(r.custom_select_project_ ?? '').toLowerCase().includes(ql) ||
					(r.custom_category ?? '').toLowerCase().includes(ql)),
		);
	}, [base, q, from, to]);

	const counts = useMemo(() => {
		const c: Record<string, number> = { all: filtered.length };
		for (const r of filtered) {
			const g = mrGroup(r);
			c[g] = (c[g] ?? 0) + 1;
		}
		return c;
	}, [filtered]);

	const rows = status === 'all' ? filtered : filtered.filter((r) => mrGroup(r) === status);
	const datesActive = !!(from || to);

	return (
		<>
			<MHeader title={t('req.title')} />
			<div className="body">
				{isLoading && <MLoad />}
				{error && (
					<div className="malert">
						<Icon name="warning" size={16} />
						<span>{t('req.couldNotLoad')}</span>
					</div>
				)}
				{!isLoading && !error && base.length === 0 && (
					<MEmpty icon="file-text" title={t('req.emptyTitle')} sub={t('req.emptySub')} />
				)}

				{base.length > 0 && (
					<PullToRefresh onRefresh={() => mutate()}>
						<div className="msearchrow">
							<MSearch value={q} onChange={setQ} placeholder={t('req.search')} />
							<button
								className={'mfilter-btn' + (showDates || datesActive ? ' on' : '')}
								onClick={() => setShowDates((v) => !v)}
								aria-label="Date filter"
							>
								<Icon name="sliders" size={18} />
							</button>
						</div>

						{showDates && (
							<div className="mdate">
								<label className="fld">
									<span className="lbl">{t('req.requiredFrom')}</span>
									<input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
								</label>
								<label className="fld">
									<span className="lbl">{t('req.requiredTo')}</span>
									<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
								</label>
								{datesActive && (
									<button
										className="mfilter-btn"
										onClick={() => {
											setFrom('');
											setTo('');
										}}
										aria-label="Clear dates"
									>
										<Icon name="close" size={16} />
									</button>
								)}
							</div>
						)}

						<MChips
							value={status}
							onChange={setStatus}
							options={STATUS_FILTERS.filter((f) => f.key === 'all' || (counts[f.key] ?? 0) > 0).map((f) => ({
								key: f.key,
								label: t(f.label),
								count: counts[f.key] ?? 0,
							}))}
						/>

						{rows.length === 0 ? (
							<MEmpty icon="search" title={t('common.noMatches')} sub={t('req.noMatchSub')} />
						) : (
							<div className="lcard">
								{rows.map((r) => {
									const st = mrDisplayStatus(r);
									const items = (r.items ?? 0) + ' ' + t(r.items === 1 ? 'common.item_one' : 'common.item_other');
									return (
										<button className="lrow" key={r.name} onClick={() => setOpen(r.name)}>
											<span className="glyph">
												<Icon name="file-text" size={18} />
											</span>
											<span className="tx">
												<span className="l1">
													<span className="id">{r.name}</span>
													<span className={'chip ' + st.tone}>{tStatus(t, st.label)}</span>
												</span>
												<span className="l2">{r.custom_select_project_ ?? '—'}</span>
												<span className="l3">
													<span className="meta">
														{items}
														{r.custom_category ? ' · ' + r.custom_category : ''}
														{r.custom_priority === 'High' ? <span className="hi"> · {t('req.highPriority')}</span> : null}
													</span>
													<span className="when">{fmtDate(r.transaction_date)}</span>
												</span>
											</span>
										</button>
									);
								})}
							</div>
						)}
					</PullToRefresh>
				)}
			</div>

			<button className="fab" onClick={() => nav('/m/requests/new')}>
				<Icon name="plus" size={20} /> {t('home.new')}
			</button>

			{open && <MrDetailSheet name={open} onClose={() => setOpen(null)} onActed={() => void mutate()} />}
		</>
	);
}
