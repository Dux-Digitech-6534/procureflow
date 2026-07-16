import { useNavigate, useParams } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, type PaymentDetail as PaymentDetailData } from '../lib/api';
import { fmtDateLong, fmtMoney } from '../lib/format';
import { Icon } from '../components/Icon';
import { Facts } from '../components/ui';
import { LinkedDocs } from '../components/LinkedDocs';
import { DocActivity } from '../components/DocActivity';

export function PaymentDetail() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { data, isLoading, error } = useFrappeGetCall<{ message: PaymentDetailData }>(
		API.paymentDetail,
		{ name: id },
		id ? undefined : null,
	);
	const d = data?.message;

	return (
		<main>
			<div className="crumb">
				<a onClick={() => navigate('/payments')} style={{ cursor: 'pointer' }}>
					Payments
				</a>
				&nbsp;/&nbsp;<span className="data">{id}</span>
			</div>
			<div className="titlebar">
				<div>
					<div className="eyebrow">Procurement · finance</div>
					<h1 style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-ui)' }}>Payment</h1>
				</div>
				{d && (
					<>
						<div className="spacer" />
						<div style={{ textAlign: 'right' }}>
							<div className="eyebrow">Amount</div>
							<div className="num" style={{ fontSize: 22, color: 'var(--iris)', fontWeight: 700 }}>{fmtMoney(d.amount, 'INR')}</div>
						</div>
					</>
				)}
			</div>

			{isLoading && <div className="card"><div className="empty"><div className="t2">Loading…</div></div></div>}
			{error && <div className="card"><div className="empty"><div className="t2" style={{ color: 'var(--err)' }}>Could not load payment.</div></div></div>}

			{d && (
				<div className="grid">
					<div className="stack">
						<section className="card accent">
							<div className="chead">
								<Icon name="banknote" size={16} />
								<span className="ttl">Payment details</span>
							</div>
							<Facts
								rows={[
									{ k: 'Supplier', v: d.supplier },
									{ k: 'Project', v: d.project ?? '—' },
									d.is_advance
										? { k: 'Advance against PO', v: <span className="id">{d.purchase_order}</span> }
										: { k: 'Against receipt', v: <span className="id">{d.purchase_receipt}</span> },
									{ k: 'Payment date', v: fmtDateLong(d.payment_date), data: true },
									{ k: 'Amount paid', v: fmtMoney(d.amount, 'INR'), data: true },
									{ k: 'Previously paid', v: fmtMoney(d.previous_paid_amount, 'INR'), data: true },
									{ k: 'Outstanding (then)', v: fmtMoney(d.outstanding_amount, 'INR'), data: true },
									...(d.remark ? [{ k: 'Remark', v: d.remark }] : []),
								]}
							/>
						</section>
					</div>

					<div className="stack">
						<LinkedDocs doctype="Procureflow Payment Entry" name={d.name} />
						<DocActivity doctype="Procureflow Payment Entry" name={d.name} />
					</div>
				</div>
			)}
		</main>
	);
}
