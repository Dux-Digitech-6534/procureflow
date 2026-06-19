import { useNavigate, useParams } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, payTone, type PrDetail } from '../lib/api';
import { fmtDateLong, fmtMoney, fmtNum } from '../lib/format';
import { Icon } from '../components/Icon';
import { Facts } from '../components/ui';
import { LinkedDocs } from '../components/LinkedDocs';

export function ReceiptDetail() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { data, isLoading, error } = useFrappeGetCall<{ message: PrDetail }>(
		API.prDetail,
		{ name: id },
		id ? undefined : null,
	);
	const d = data?.message;

	return (
		<main>
			<div className="crumb">
				<a onClick={() => navigate('/receipts')} style={{ cursor: 'pointer' }}>
					Receipts
				</a>
				&nbsp;/&nbsp;<span className="data">{id}</span>
			</div>
			<div className="titlebar">
				<div>
					<div className="eyebrow">Buying</div>
					<h1 style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-ui)' }}>Purchase receipt</h1>
					{d && (
						<div style={{ marginTop: 8 }}>
							<span className={'tag ' + payTone(d.payment_status)}>{d.payment_status ?? 'Not Paid'}</span>
						</div>
					)}
				</div>
			</div>

			{isLoading && <div className="card"><div className="empty"><div className="t2">Loading…</div></div></div>}
			{error && <div className="card"><div className="empty"><div className="t2" style={{ color: 'var(--err)' }}>Could not load receipt.</div></div></div>}

			{d && (
				<div className="grid">
					<div className="stack">
						<section className="card accent">
							<div className="chead">
								<Icon name="package" size={16} />
								<span className="ttl">Receipt details</span>
							</div>
							<Facts
								rows={[
									{ k: 'Supplier', v: d.supplier_name ?? d.supplier },
									{ k: 'Project', v: d.project ?? '—' },
									{ k: 'Receipt date', v: fmtDateLong(d.posting_date), data: true },
									{ k: 'Grand total', v: fmtMoney(d.total || d.grand_total, 'INR'), data: true },
									{ k: 'Paid', v: fmtMoney(d.paid, 'INR'), data: true },
									{ k: 'Outstanding', v: fmtMoney(d.outstanding, 'INR'), data: true },
								]}
							/>
						</section>

						<section className="card">
							<div className="chead">
								<Icon name="layers" size={16} />
								<span className="ttl">Items</span>
								<span className="cnt">{d.items.length}</span>
							</div>
							<div className="tablescroll">
								<table>
									<thead>
										<tr>
											<th>Item</th>
											<th style={{ textAlign: 'right' }}>Qty</th>
											<th>UOM</th>
											<th style={{ textAlign: 'right' }}>Rate</th>
											<th style={{ textAlign: 'right' }}>Amount</th>
										</tr>
									</thead>
									<tbody>
										{d.items.map((it, i) => (
											<tr key={i}>
												<td>
													<span className="c1">{it.item_name}</span>
													{it.item_code !== it.item_name && <div className="c2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{it.item_code}</div>}
												</td>
												<td style={{ textAlign: 'right' }}><span className="num">{fmtNum(it.qty, 3)}</span></td>
												<td>{it.uom}</td>
												<td style={{ textAlign: 'right' }}><span className="num">{fmtMoney(it.rate, 'INR')}</span></td>
												<td style={{ textAlign: 'right' }}><span className="num">{fmtMoney(it.amount, 'INR')}</span></td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</section>
					</div>

					<div className="stack">
						<LinkedDocs doctype="Purchase Receipt" name={d.name} />
					</div>
				</div>
			)}
		</main>
	);
}
