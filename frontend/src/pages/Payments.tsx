import { useState } from 'react';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
import { API, payTone, type PaymentListRow, type PrListRow } from '../lib/api';
import { fmtDate, fmtMoney, parseServerError } from '../lib/format';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui';
import { Field } from '../components/form';

function RecordPaymentModal({ pr, onClose, onSaved }: { pr: PrListRow; onClose: () => void; onSaved: () => void }) {
	const { call: save, loading } = useFrappePostCall<{ message: { name: string } }>(API.savePayment);
	const [amount, setAmount] = useState(String(pr.outstanding));
	const [date, setDate] = useState('');
	const [remark, setRemark] = useState('');
	const [err, setErr] = useState('');

	async function submit() {
		setErr('');
		const amt = Number(amount) || 0;
		if (amt <= 0) return setErr('Enter an amount greater than zero.');
		if (amt > pr.outstanding + 0.001) return setErr('Amount cannot exceed the outstanding amount.');
		try {
			await save({ data: { purchase_receipt: pr.name, amount: amt, payment_date: date || null, remark } });
			onSaved();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Modal title={`Record payment — ${pr.name}`} icon="banknote" onClose={onClose}>
			<div className="formgrid">
				<Field label="Supplier">
					<input className="inp" disabled value={pr.supplier_name ?? pr.supplier} />
				</Field>
				<Field label="Outstanding">
					<input className="inp mono" disabled value={fmtMoney(pr.outstanding, 'INR')} />
				</Field>
				<Field label="Amount" required>
					<input className="inp mono" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
				</Field>
				<Field label="Payment date">
					<input className="inp mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
				</Field>
				<div className="span2">
					<Field label="Remark">
						<input className="inp" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Reference / note…" />
					</Field>
				</div>
			</div>
			<div className="formfoot">
				{err && <span className="ferr">{err}</span>}
				<span className="spacer" />
				<button className="btn" onClick={onClose}>Cancel</button>
				<button className="btn primary" disabled={loading} onClick={() => void submit()}>
					{loading ? 'Recording…' : 'Record payment'}
				</button>
			</div>
		</Modal>
	);
}

export function Payments() {
	const prRes = useFrappeGetCall<{ message: PrListRow[] }>(API.prList, {});
	const payRes = useFrappeGetCall<{ message: PaymentListRow[] }>(API.paymentList, {});
	const payable = (prRes.data?.message ?? []).filter((r) => r.outstanding > 0.001);
	const history = payRes.data?.message ?? [];
	const [target, setTarget] = useState<PrListRow | null>(null);

	function refetch() {
		prRes.mutate();
		payRes.mutate();
	}

	return (
		<main>
			<div className="eyebrow">Procurement · finance</div>
			<div className="titlebar">
				<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>Payments</h1>
			</div>

			<div className="stack">
				<section className="card">
					<div className="chead">
						<Icon name="rupee" size={16} />
						<span className="ttl">Outstanding receipts</span>
						<span className="cnt">{payable.length}</span>
					</div>
					{payable.length === 0 ? (
						<div className="empty"><div className="t2">Nothing outstanding — all receipts are fully paid.</div></div>
					) : (
						<div className="tablescroll">
							<table>
								<thead>
									<tr>
										<th>Receipt</th>
										<th>Supplier</th>
										<th>Project</th>
										<th style={{ textAlign: 'right' }}>Grand total</th>
										<th style={{ textAlign: 'right' }}>Outstanding</th>
										<th>Status</th>
										<th />
									</tr>
								</thead>
								<tbody>
									{payable.map((r) => (
										<tr key={r.name}>
											<td><span className="id">{r.name}</span></td>
											<td className="c1">{r.supplier_name ?? r.supplier}</td>
											<td className="c2">{r.custom_project_name ?? '—'}</td>
											<td style={{ textAlign: 'right' }}><span className="num">{fmtMoney(r.grand_total, 'INR')}</span></td>
											<td style={{ textAlign: 'right' }}><span className="num">{fmtMoney(r.outstanding, 'INR')}</span></td>
											<td><span className={'tag ' + payTone(r.custom_payment_status)}>{r.custom_payment_status ?? 'Not Paid'}</span></td>
											<td style={{ textAlign: 'right' }}>
												<button className="btn primary" style={{ padding: '5px 12px', fontSize: 12.5 }} onClick={() => setTarget(r)}>
													Record payment
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>

				<section className="card">
					<div className="chead">
						<Icon name="banknote" size={16} />
						<span className="ttl">Recent payments</span>
						<span className="cnt">{history.length}</span>
					</div>
					{history.length === 0 ? (
						<div className="empty"><div className="t2">No payments recorded yet.</div></div>
					) : (
						<div className="tablescroll">
							<table>
								<thead>
									<tr>
										<th>Payment</th>
										<th>Receipt</th>
										<th>Supplier</th>
										<th style={{ textAlign: 'right' }}>Amount</th>
										<th>Date</th>
									</tr>
								</thead>
								<tbody>
									{history.map((p) => (
										<tr key={p.name}>
											<td><span className="id">{p.name}</span></td>
											<td><span className="id">{p.purchase_receipt}</span></td>
											<td className="c1">{p.supplier}</td>
											<td style={{ textAlign: 'right' }}><span className="num">{fmtMoney(p.amount, 'INR')}</span></td>
											<td><span className="dim">{fmtDate(p.payment_date)}</span></td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			</div>

			{target && <RecordPaymentModal pr={target} onClose={() => setTarget(null)} onSaved={() => { setTarget(null); refetch(); }} />}
		</main>
	);
}
