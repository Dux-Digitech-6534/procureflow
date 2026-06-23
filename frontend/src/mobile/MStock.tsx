import { useMemo, useState } from 'react';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, type StockRow } from '../lib/api';
import { Icon } from '../components/Icon';
import { MHeader, MLoad, MEmpty, MSearch, PullToRefresh } from './MobileShell';
import { useLang } from './i18n';

const QTY = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function MStock() {
	const { t } = useLang();
	const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: StockRow[] }>(API.stockBalances, {});
	const [q, setQ] = useState('');

	const base = data?.message ?? [];
	const rows = useMemo(() => {
		const ql = q.trim().toLowerCase();
		if (!ql) return base;
		return base.filter(
			(r) =>
				r.item_code.toLowerCase().includes(ql) ||
				(r.item_name ?? '').toLowerCase().includes(ql) ||
				(r.warehouse ?? '').toLowerCase().includes(ql),
		);
	}, [base, q]);

	return (
		<>
			<MHeader title={t('stock.title')} backTo="/m" />
			<div className="body">
				{isLoading && <MLoad />}
				{error && (
					<div className="malert">
						<Icon name="warning" size={16} />
						<span>{t('stock.couldNotLoad')}</span>
					</div>
				)}
				{!isLoading && !error && base.length === 0 && (
					<MEmpty icon="cube" title={t('stock.emptyTitle')} sub={t('stock.emptySub')} />
				)}

				{base.length > 0 && (
					<PullToRefresh onRefresh={() => mutate()}>
						<MSearch value={q} onChange={setQ} placeholder={t('stock.search')} />

						{rows.length === 0 ? (
							<MEmpty icon="search" title={t('common.noMatches')} sub={t('common.noMatchSub')} />
						) : (
							<>
								<div className="eyebrow2" style={{ marginTop: 4 }}>
									{t(rows.length === 1 ? 'stock.balance_one' : 'stock.balance_other', { n: rows.length })}
								</div>
								<div className="lcard">
									{rows.map((r) => (
										<div className="lrow" key={r.item_code + '|' + r.warehouse}>
											<span className="glyph">
												<Icon name="cube" size={18} />
											</span>
											<span className="tx">
												<span className="l1">{r.item_name}</span>
												<span className="l2">{r.warehouse}</span>
												<span className="l3">
													<span className="meta">{r.item_code}</span>
												</span>
											</span>
											<span className="rt">
												<span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--fg-1)' }}>
													{QTY.format(r.actual_qty)}
												</span>
												<span style={{ fontSize: 11, color: 'var(--fg-4)' }}>{r.stock_uom ?? ''}</span>
											</span>
										</div>
									))}
								</div>
							</>
						)}
					</PullToRefresh>
				)}
			</div>
		</>
	);
}
