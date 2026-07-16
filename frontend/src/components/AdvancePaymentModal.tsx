import { useState } from 'react';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
import { API } from '../lib/api';
import { fmtMoney, parseServerError } from '../lib/format';
import { Modal } from './ui';
import { Field } from './form';
import { useToast } from './Toast';

interface AdvanceDefaults {
	purchase_order: string;
	supplier: string;
	supplier_name: string | null;
	po_total: number;
	advance_paid: number;
	cap: { enabled: boolean; pct: number };
	cap_remaining: number | null; // null == uncapped
	amount: number;
}

/** Record a Procureflow Payment Entry as an ADVANCE against a Purchase Order.
 *  The advance becomes a PO-level credit that auto-allocates to that PO's
 *  receipts, oldest first, as they arrive. Used from the PO detail page. */
export function AdvancePaymentModal({ po, onClose, onSaved }: { po: string; onClose: () => void; onSaved: () => void }) {
	const res = useFrappeGetCall<{ message: AdvanceDefaults }>(API.advancePaymentDefaults, { purchase_order: po });
	const d = res.data?.message;
	const { call: save, loading } = useFrappePostCall<{ message: { name: string } }>(API.savePayment);
	const toast = useToast();
	const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
	const [amount, setAmount] = useState('');
	const [date, setDate] = useState('');
	const [remark, setRemark] = useState('');
	const [err, setErr] = useState('');

	const capRemaining = d?.cap_remaining ?? null;

	async function submit() {
		setErr('');
		const amt = Number(amount) || 0;
		if (amt <= 0) return setErr('Enter an amount greater than zero.');
		if (capRemaining != null && amt > capRemaining + 0.01)
			return setErr(`Amount exceeds the remaining advance limit (${fmtMoney(capRemaining, 'INR')}).`);
		if (date && date > today) return setErr('Payment date cannot be in the future.');
		try {
			await save({ data: { purchase_order: po, amount: amt, payment_date: date || null, remark } });
			toast.success('Advance recorded');
			onSaved();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Modal title={`Pay advance — ${po}`} icon="banknote" onClose={onClose}>
			<div className="formgrid">
				<Field label="Supplier">
					<input className="inp" disabled value={d?.supplier_name ?? d?.supplier ?? '…'} />
				</Field>
				<Field label="PO value">
					<input className="inp mono" disabled value={d ? fmtMoney(d.po_total, 'INR') : '…'} />
				</Field>
				<Field label="Advance already paid">
					<input className="inp mono" disabled value={d ? fmtMoney(d.advance_paid, 'INR') : '…'} />
				</Field>
				<Field label={capRemaining != null ? 'Can still advance' : 'Advance limit'}>
					<input className="inp mono" disabled value={capRemaining != null ? fmtMoney(capRemaining, 'INR') : 'No limit'} />
				</Field>
				<Field label="Advance amount" required>
					<input className="inp mono" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
				</Field>
				<Field label="Payment date">
					<input className="inp mono" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
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
				<button className="btn primary" disabled={loading || !d} onClick={() => void submit()}>
					{loading ? 'Recording…' : 'Pay advance'}
				</button>
			</div>
		</Modal>
	);
}
