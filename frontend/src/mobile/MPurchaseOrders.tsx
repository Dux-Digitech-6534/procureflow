import { useMemo, useState } from 'react';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, poDisplayStatus, type PoListRow } from '../lib/api';
import { Icon } from '../components/Icon';
import { fmtDate, fmtMoney } from '../lib/format';
import { MHeader, MLoad, MEmpty, MSearch, MChips, PullToRefresh } from './MobileShell';
import { PoDetailSheet } from './PoDetailSheet';
import { useLang, tStatus } from './i18n';

function poGroup(r: PoListRow): string {
	switch (poDisplayStatus(r).label) {
		case 'Draft':
			return 'draft';
		case 'Pending approval':
			return 'pending';
		case 'Ordered':
			return 'ordered';
		case 'Received':
		case 'Partially received':
			return 'received';
		case 'Closed':
			return 'closed';
		case 'Rejected':
			return 'rejected';
		default: // Cancelled / On Hold — only under "All"
			return 'other';
	}
}

const STATUS_FILTERS: { key: string; labelKey: string }[] = [
	{ key: 'all', labelKey: 'common.all' },
	{ key: 'draft', labelKey: 'status.draft' },
	{ key: 'pending', labelKey: 'status.pending' },
	{ key: 'ordered', labelKey: 'status.ordered' },
	{ key: 'received', labelKey: 'status.received' },
	{ key: 'closed', labelKey: 'status.closed' },
	{ key: 'rejected', labelKey: 'status.rejected' },
];

export function MPurchaseOrders() {
	const { t } = useLang();
	const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: PoListRow[] }>(API.poList, {});
	const [open, setOpen] = useState<string | null>(null);
	const [q, setQ] = useState('');
	const [status, setStatus] = useState('all');

	const base = data?.message ?? [];

	const searched = useMemo(() => {
		const ql = q.trim().toLowerCase();
		if (!ql) return base;
		return base.filter(
			(r) =>
				r.name.toLowerCase().includes(ql) ||
				(r.supplier_name ?? '').toLowerCase().includes(ql) ||
				(r.supplier ?? '').toLowerCase().includes(ql) ||
				(r.custom_project_name ?? '').toLowerCase().includes(ql) ||
				(r.custom_category ?? '').toLowerCase().includes(ql),
		);
	}, [base, q]);

	const counts = useMemo(() => {
		const c: Record<string, number> = { all: searched.length };
		for (const r of searched) {
			const g = poGroup(r);
			c[g] = (c[g] ?? 0) + 1;
		}
		return c;
	}, [searched]);

	const rows = status === 'all' ? searched : searched.filter((r) => poGroup(r) === status);

	return (
		<>
			<MHeader title={t('po.title')} backTo="/m" />
			<div className="body">
				{isLoading && <MLoad />}
				{error && (
					<div className="malert">
						<Icon name="warning" size={16} />
						<span>{t('po.couldNotLoad')}</span>
					</div>
				)}
				{!isLoading && !error && base.length === 0 && (
					<MEmpty icon="box" title={t('po.emptyTitle')} sub={t('po.emptySub')} />
				)}

				{base.length > 0 && (
					<PullToRefresh onRefresh={() => mutate()}>
						<MSearch value={q} onChange={setQ} placeholder={t('po.search')} />
						<MChips
							value={status}
							onChange={setStatus}
							options={STATUS_FILTERS.filter((f) => f.key === 'all' || (counts[f.key] ?? 0) > 0).map((f) => ({
								key: f.key,
								label: t(f.labelKey),
								count: counts[f.key] ?? 0,
							}))}
						/>

						{rows.length === 0 ? (
							<MEmpty icon="search" title={t('common.noMatches')} sub={t('common.noMatchSub')} />
						) : (
							<div className="lcard">
								{rows.map((r) => {
									const st = poDisplayStatus(r);
									return (
										<button className="lrow" key={r.name} onClick={() => setOpen(r.name)}>
											<span className="glyph">
												<Icon name="box" size={18} />
											</span>
											<span className="tx">
												<span className="l1">
													<span className="id">{r.name}</span>
													<span className={'chip ' + st.tone}>{tStatus(t, st.label)}</span>
												</span>
												<span className="l2">{r.supplier_name ?? r.supplier}</span>
												<span className="l3">
													<span className="meta">
														{(r.custom_project_name ?? '—') + (r.custom_category ? ' · ' + r.custom_category : '')}
													</span>
													<span className="when">{fmtMoney(r.grand_total, 'INR')}</span>
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

			{open && <PoDetailSheet name={open} onClose={() => setOpen(null)} />}
		</>
	);
}
