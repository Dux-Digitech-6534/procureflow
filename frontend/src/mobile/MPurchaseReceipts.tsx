import { useMemo, useState } from 'react';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, payTone, type PrListRow } from '../lib/api';
import { Icon } from '../components/Icon';
import { fmtDate, fmtMoney } from '../lib/format';
import { MHeader, MLoad, MEmpty, MSearch, MChips, PullToRefresh } from './MobileShell';
import { PrDetailSheet } from './PrDetailSheet';
import { useLang, tPay } from './i18n';

const PAY_FILTERS: { key: string; labelKey: string }[] = [
	{ key: 'all', labelKey: 'common.all' },
	{ key: 'Not Paid', labelKey: 'rh.unpaid' },
	{ key: 'Partially Paid', labelKey: 'rh.partial' },
	{ key: 'Fully Paid', labelKey: 'rh.paid' },
];

export function MPurchaseReceipts() {
	const { t } = useLang();
	const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: PrListRow[] }>(API.prList, {});
	const [open, setOpen] = useState<string | null>(null);
	const [q, setQ] = useState('');
	const [pay, setPay] = useState('all');

	const base = data?.message ?? [];

	const searched = useMemo(() => {
		const ql = q.trim().toLowerCase();
		if (!ql) return base;
		return base.filter(
			(r) =>
				r.name.toLowerCase().includes(ql) ||
				(r.supplier_name ?? '').toLowerCase().includes(ql) ||
				(r.supplier ?? '').toLowerCase().includes(ql) ||
				(r.custom_project_name ?? '').toLowerCase().includes(ql),
		);
	}, [base, q]);

	const counts = useMemo(() => {
		const c: Record<string, number> = { all: searched.length };
		for (const r of searched) {
			const s = r.custom_payment_status ?? '';
			if (s) c[s] = (c[s] ?? 0) + 1;
		}
		return c;
	}, [searched]);

	const rows = pay === 'all' ? searched : searched.filter((r) => (r.custom_payment_status ?? '') === pay);

	return (
		<>
			<MHeader title={t('rh.title')} backTo="/m" />
			<div className="body">
				{isLoading && <MLoad />}
				{error && (
					<div className="malert">
						<Icon name="warning" size={16} />
						<span>{t('rh.couldNotLoad')}</span>
					</div>
				)}
				{!isLoading && !error && base.length === 0 && (
					<MEmpty icon="package" title={t('rh.emptyTitle')} sub={t('rh.emptySub')} />
				)}

				{base.length > 0 && (
					<PullToRefresh onRefresh={() => mutate()}>
						<MSearch value={q} onChange={setQ} placeholder={t('rh.search')} />
						<MChips
							value={pay}
							onChange={setPay}
							options={PAY_FILTERS.filter((f) => f.key === 'all' || (counts[f.key] ?? 0) > 0).map((f) => ({
								key: f.key,
								label: t(f.labelKey),
								count: counts[f.key] ?? 0,
							}))}
						/>

						{rows.length === 0 ? (
							<MEmpty icon="search" title={t('common.noMatches')} sub={t('common.noMatchSub')} />
						) : (
							<div className="lcard">
								{rows.map((r) => (
									<button className="lrow" key={r.name} onClick={() => setOpen(r.name)}>
										<span className="glyph">
											<Icon name="package" size={18} />
										</span>
										<span className="tx">
											<span className="l1">
												<span className="id">{r.name}</span>
												{r.custom_payment_status && (
													<span className={'chip ' + payTone(r.custom_payment_status)}>{tPay(t, r.custom_payment_status)}</span>
												)}
											</span>
											<span className="l2">{r.supplier_name ?? r.supplier}</span>
											<span className="l3">
												<span className="meta">{(r.custom_project_name ?? '—') + ' · ' + fmtDate(r.posting_date)}</span>
												<span className="when">{fmtMoney(r.grand_total, 'INR')}</span>
											</span>
										</span>
									</button>
								))}
							</div>
						)}
					</PullToRefresh>
				)}
			</div>

			{open && <PrDetailSheet name={open} onClose={() => setOpen(null)} />}
		</>
	);
}
