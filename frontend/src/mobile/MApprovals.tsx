import { useMemo, useState } from 'react';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, type PendingApprovals, type PendingMr, type PendingPo } from '../lib/api';
import { Icon } from '../components/Icon';
import { fmtDate, fmtMoney } from '../lib/format';
import { MHeader, MLoad, MEmpty, MSearch, MChips, PullToRefresh } from './MobileShell';
import { MrDetailSheet } from './MrDetailSheet';
import { PoDetailSheet } from './PoDetailSheet';
import { useLang, tPrio } from './i18n';

export function MApprovals() {
	const { t } = useLang();
	const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: PendingApprovals }>(API.pendingApprovals, {});
	const [openMr, setOpenMr] = useState<PendingMr | null>(null);
	const [openPo, setOpenPo] = useState<PendingPo | null>(null);
	const [q, setQ] = useState('');
	const [type, setType] = useState('all');

	const baseMrs = data?.message.material_requests ?? [];
	const basePos = data?.message.purchase_orders ?? [];

	const ql = q.trim().toLowerCase();
	const mrs = useMemo(
		() =>
			baseMrs.filter(
				(r) =>
					!ql ||
					r.name.toLowerCase().includes(ql) ||
					(r.custom_select_project_ ?? '').toLowerCase().includes(ql) ||
					(r.custom_category ?? '').toLowerCase().includes(ql) ||
					(r.owner ?? '').toLowerCase().includes(ql),
			),
		[baseMrs, ql],
	);
	const pos = useMemo(
		() =>
			basePos.filter(
				(r) =>
					!ql ||
					r.name.toLowerCase().includes(ql) ||
					(r.custom_project_name ?? '').toLowerCase().includes(ql) ||
					(r.custom_category ?? '').toLowerCase().includes(ql) ||
					(r.supplier_name ?? '').toLowerCase().includes(ql) ||
					(r.supplier ?? '').toLowerCase().includes(ql),
			),
		[basePos, ql],
	);

	const total = baseMrs.length + basePos.length;
	const showMr = type === 'all' || type === 'mr';
	const showPo = type === 'all' || type === 'po';
	const visible = (showMr ? mrs.length : 0) + (showPo ? pos.length : 0);
	const bothTypes = basePos.length > 0; // only worth a type filter + section labels when POs exist

	return (
		<>
			<MHeader title={t('appr.title')} />
			<div className="body">
				{isLoading && <MLoad />}
				{error && (
					<div className="malert">
						<Icon name="warning" size={16} />
						<span>{t('appr.couldNotLoad')}</span>
					</div>
				)}
				{!isLoading && !error && total === 0 && (
					<MEmpty icon="circle-check" title={t('appr.allClear')} sub={t('appr.allClearSub')} />
				)}

				{total > 0 && (
					<PullToRefresh onRefresh={() => mutate()}>
						<MSearch value={q} onChange={setQ} placeholder={t('appr.search')} />
						{bothTypes && (
							<MChips
								value={type}
								onChange={setType}
								options={[
									{ key: 'all', label: t('common.all'), count: mrs.length + pos.length },
									{ key: 'mr', label: t('appr.requests'), count: mrs.length },
									{ key: 'po', label: t('appr.orders'), count: pos.length },
								]}
							/>
						)}

						{visible === 0 ? (
							<MEmpty icon="search" title={t('common.noMatches')} sub={t('common.noMatchSub')} />
						) : (
							<>
								{showMr && mrs.length > 0 && (
									<>
										{bothTypes && <div className="eyebrow2" style={{ marginTop: 4 }}>{t('appr.materialRequests')} · {mrs.length}</div>}
										<div className="lcard">
											{mrs.map((r) => (
												<button className="lrow" key={r.name} onClick={() => setOpenMr(r)}>
													<span className="glyph">
														<Icon name="shield-check" size={18} />
													</span>
													<span className="tx">
														<span className="l1">
															<span className="id">{r.name}</span>
															{r.custom_priority && <span className={'prio ' + r.custom_priority}>{tPrio(t, r.custom_priority)}</span>}
														</span>
														<span className="l2">
															{(r.custom_select_project_ ?? '—') + ' · ' + (r.custom_category ?? t('common.uncategorised'))}
														</span>
														<span className="l3">
															<span className="meta">{t('appr.by', { name: r.owner })}</span>
															<span className="when">{fmtDate(r.transaction_date)}</span>
														</span>
													</span>
												</button>
											))}
										</div>
									</>
								)}

								{showPo && pos.length > 0 && (
									<>
										{bothTypes && <div className="eyebrow2">{t('appr.purchaseOrders')} · {pos.length}</div>}
										<div className="lcard">
											{pos.map((r) => (
												<button className="lrow" key={r.name} onClick={() => setOpenPo(r)}>
													<span className="glyph">
														<Icon name="box" size={18} />
													</span>
													<span className="tx">
														<span className="l1">
															<span className="id">{r.name}</span>
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
											))}
										</div>
									</>
								)}
							</>
						)}
					</PullToRefresh>
				)}
			</div>

			{openMr && (
				<MrDetailSheet name={openMr.name} actions={openMr.actions} onClose={() => setOpenMr(null)} onActed={() => void mutate()} />
			)}
			{openPo && (
				<PoDetailSheet name={openPo.name} actions={openPo.actions} onClose={() => setOpenPo(null)} onActed={() => void mutate()} />
			)}
		</>
	);
}
