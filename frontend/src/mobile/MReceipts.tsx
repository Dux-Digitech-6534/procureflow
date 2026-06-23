import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, type ReceivablePo } from '../lib/api';
import { Icon } from '../components/Icon';
import { fmtDate, fmtMoney } from '../lib/format';
import { MHeader, MLoad, MEmpty, MSearch, PullToRefresh } from './MobileShell';
import { useLang } from './i18n';

export function MReceipts() {
	const { t } = useLang();
	const nav = useNavigate();
	const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: ReceivablePo[] }>(API.receivablePos, {});
	const [q, setQ] = useState('');

	const base = data?.message ?? [];
	const rows = useMemo(() => {
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

	return (
		<>
			<MHeader title={t('rec.title')} />
			<div className="body">
				{isLoading && <MLoad />}
				{error && (
					<div className="malert">
						<Icon name="warning" size={16} />
						<span>{t('rec.couldNotLoad')}</span>
					</div>
				)}
				{!isLoading && !error && base.length === 0 && (
					<MEmpty icon="package" title={t('rec.emptyTitle')} sub={t('rec.emptySub')} />
				)}

				{base.length > 0 && (
					<PullToRefresh onRefresh={() => mutate()}>
						<MSearch value={q} onChange={setQ} placeholder={t('rec.search')} />

						{rows.length === 0 ? (
							<MEmpty icon="search" title={t('common.noMatches')} sub={t('common.noMatchSub')} />
						) : (
							<>
								<div className="eyebrow2" style={{ marginTop: 4 }}>
									{t('rec.toReceive')} · {rows.length}
								</div>
								<div className="lcard">
									{rows.map((r) => {
										const pct = Math.round(r.per_received ?? 0);
										return (
											<button className="lrow" key={r.name} onClick={() => nav('/m/receipts/' + r.name)}>
												<span className="glyph">
													<Icon name="package" size={18} />
												</span>
												<span className="tx">
													<span className="l1">
														<span className="id">{r.name}</span>
														<span className={'chip ' + (pct > 0 ? 'pend' : 'neutral')}>
															{pct > 0 ? t('rec.pctReceived', { pct }) : t('rec.awaiting')}
														</span>
													</span>
													<span className="l2">{r.supplier_name ?? r.supplier}</span>
													<span className="l3">
														<span className="meta">{(r.custom_project_name ?? '—') + ' · ' + fmtDate(r.transaction_date)}</span>
														<span className="when">{fmtMoney(r.grand_total, 'INR')}</span>
													</span>
												</span>
											</button>
										);
									})}
								</div>
							</>
						)}
					</PullToRefresh>
				)}
			</div>
		</>
	);
}
