import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrappePostCall } from 'frappe-react-sdk';
import { API } from '../lib/api';
import { parseServerError } from '../lib/format';
import { Icon } from './Icon';
import { Modal } from './ui';
import { ActionButtons } from './ActionButtons';

/**
 * Top-of-detail-page workflow + lifecycle actions, all driven by the LIVE,
 * permission-checked state from mr_detail / po_detail:
 *  - `transitions`: the workflow actions available to THIS user right now
 *    (e.g. an approver's Place Order / Reject on a Pending PO, or Approve /
 *    Reject / Reopen on an MR) — rendered via the shared ActionButtons (which
 *    carries the reject-reason modal).
 *  - `canCancel` (docstatus 1) → Cancel, behind a confirm.
 *  - `canAmend` (docstatus 2) → Amend, which creates a fresh editable draft and
 *    navigates to it.
 * Nothing here bypasses Frappe perms — the server re-checks on every call.
 */
export function DocLifecycleActions({
	doctype,
	name,
	noun,
	transitions,
	canCancel,
	canAmend,
	onChanged,
	basePath,
}: {
	doctype: string;
	name: string;
	noun: string; // "order" | "request"
	transitions: string[];
	canCancel: boolean;
	canAmend: boolean;
	onChanged: () => void;
	basePath: string;
}) {
	const navigate = useNavigate();
	const { call: cancelDoc, loading: cancelling } = useFrappePostCall<{ message: { name: string } }>(API.cancelDoc);
	const { call: amendDoc, loading: amending } = useFrappePostCall<{ message: { name: string } }>(API.amendDoc);
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [err, setErr] = useState('');

	async function doCancel() {
		setErr('');
		try {
			await cancelDoc({ doctype, name });
			setConfirmCancel(false);
			onChanged();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	async function doAmend() {
		setErr('');
		try {
			const r = await amendDoc({ doctype, name });
			navigate(basePath + '/' + r.message.name);
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	const hasAny = (transitions?.length ?? 0) > 0 || canCancel || canAmend;
	if (!hasAny) return null;

	return (
		<>
			{transitions?.length > 0 && (
				<ActionButtons doctype={doctype} name={name} actions={transitions} onDone={onChanged} />
			)}
			{canCancel && (
				<button className="btn danger" onClick={() => setConfirmCancel(true)}>
					<Icon name="close" size={14} /> Cancel {noun}
				</button>
			)}
			{canAmend && (
				<button className="btn" disabled={amending} onClick={() => void doAmend()}>
					<Icon name="copy" size={14} /> {amending ? 'Amending…' : 'Amend'}
				</button>
			)}

			{confirmCancel && (
				<Modal title={`Cancel ${noun} — ${name}`} icon="warning" onClose={() => setConfirmCancel(false)}>
					<div style={{ padding: '14px 18px', fontSize: 13.5, color: 'var(--fg-2)', lineHeight: 1.55 }}>
						This cancels the submitted {noun}. You can then <b>Amend</b> it into a new editable draft if you
						need to make changes. This cannot be undone.
					</div>
					<div className="formfoot">
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn" onClick={() => setConfirmCancel(false)}>
							Keep it
						</button>
						<button className="btn danger" disabled={cancelling} onClick={() => void doCancel()}>
							{cancelling ? 'Cancelling…' : `Cancel ${noun}`}
						</button>
					</div>
				</Modal>
			)}
		</>
	);
}
