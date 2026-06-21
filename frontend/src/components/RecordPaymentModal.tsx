import { useState } from 'react';
import { useFrappePostCall } from 'frappe-react-sdk';
import { API } from '../lib/api';
import { fmtMoney, parseServerError } from '../lib/format';
import { Modal } from './ui';
import { Field } from './form';

/** A receipt we can record a payment against (subset shared by PrListRow / PrDetail). */
export interface PayableReceipt {
	name: string;
	supplier: string;
	supplier_name: string | null;
	outstanding: number;
}

/** Record a Procureflow Payment Entry against a Purchase Receipt. Used from the
 *  Payments page and the Receipt detail page. */
export function RecordPaymentModal({ pr, onClose, onSaved }: { pr: PayableReceipt; onClose: () => void; onSaved: () => void }) {
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
