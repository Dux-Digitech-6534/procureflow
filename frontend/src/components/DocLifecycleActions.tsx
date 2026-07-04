import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrappePostCall } from 'frappe-react-sdk';
import { API } from '../lib/api';
import { parseServerError } from '../lib/format';
import { Icon } from './Icon';
import { Modal } from './ui';
import { ActionButtons } from './ActionButtons';
import { useToast } from './Toast';

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
	canDelete,
	onChanged,
	basePath,
}: {
	doctype: string;
	name: string;
	noun: string; // "order" | "request"
	transitions: string[];
	canCancel: boolean;
	canAmend: boolean;
	canDelete: boolean;
	onChanged: () => void;
	basePath: string;
}) {
	const navigate = useNavigate();
	const { call: cancelDoc, loading: cancelling } = useFrappePostCall<{ message: { name: string } }>(API.cancelDoc);
	const { call: amendDoc, loading: amending } = useFrappePostCall<{ message: { name: string } }>(API.amendDoc);
	const { call: deleteDoc, loading: deleting } = useFrappePostCall<{ message: { name: string } }>(API.deleteDoc);
	const toast = useToast();
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [err, setErr] = useState('');

	async function doCancel() {
		setErr('');
		try {
			await cancelDoc({ doctype, name });
			toast.success(`${noun.charAt(0).toUpperCase() + noun.slice(1)} cancelled`);
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
			toast.success('Amended — editing the new draft');
			navigate(basePath + '/' + r.message.name);
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	async function doDelete() {
		setErr('');
		try {
			await deleteDoc({ doctype, name });
			toast.success(`${noun.charAt(0).toUpperCase() + noun.slice(1)} deleted`);
			setConfirmDelete(false);
			navigate(basePath);
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	const hasAny = (transitions?.length ?? 0) > 0 || canCancel || canAmend || canDelete;
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
			{canDelete && (
				<button className="btn danger" onClick={() => setConfirmDelete(true)}>
					<Icon name="trash" size={14} /> Delete {noun}
				</button>
			)}

			{confirmDelete && (
				<Modal title={`Delete ${noun} — ${name}`} icon="warning" onClose={() => setConfirmDelete(false)}>
					<div style={{ padding: '14px 18px', fontSize: 13.5, color: 'var(--fg-2)', lineHeight: 1.55 }}>
						This permanently deletes the cancelled {noun} <b>{name}</b>. This cannot be undone.
					</div>
					<div className="formfoot">
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn" onClick={() => setConfirmDelete(false)}>
							Keep it
						</button>
						<button className="btn danger" disabled={deleting} onClick={() => void doDelete()}>
							{deleting ? 'Deleting…' : `Delete ${noun}`}
						</button>
					</div>
				</Modal>
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
