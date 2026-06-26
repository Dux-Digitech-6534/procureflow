import { useState } from 'react';
import { useFrappePostCall, useFrappeGetDocList } from 'frappe-react-sdk';
import { API } from '../lib/api';
import { parseServerError } from '../lib/format';
import { Modal } from './ui';
import { Field, TextInput, SearchSelect } from './form';
import { useToast } from './Toast';

/** Inline "New supplier" used from the PO supplier picker. Saves via
 *  create_master (create-permission checked). */
export function CreateSupplierModal({
	onClose,
	onCreated,
}: {
	onClose: () => void;
	onCreated: (name: string) => void;
}) {
	const { call, loading } = useFrappePostCall<{ message: string }>(API.createMaster);
	const toast = useToast();
	const grpRes = useFrappeGetDocList<{ name: string }>('Supplier Group', {
		fields: ['name'],
		filters: [['is_group', '=', 0]],
		limit: 0,
	});
	const grpOpts = (grpRes.data ?? []).map((g) => ({ value: g.name }));

	const [nm, setNm] = useState('');
	const [grp, setGrp] = useState('');
	const [err, setErr] = useState('');

	async function save() {
		if (!nm.trim()) return setErr('Supplier name is required.');
		if (!grp) return setErr('Pick a supplier group.');
		setErr('');
		try {
			const r = await call({ doctype: 'Supplier', values: { supplier_name: nm.trim(), supplier_group: grp } });
			toast.success('Supplier created');
			onCreated(r.message);
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Modal title="New supplier" icon="user" onClose={onClose}>
			<div className="formgrid">
				<div className="span2">
					<Field label="Supplier name" required>
						<TextInput value={nm} onChange={setNm} placeholder="e.g. ANUSHRI ENTERPRISES" />
					</Field>
				</div>
				<div className="span2">
					<Field label="Supplier group" required>
						<SearchSelect value={grp} onChange={setGrp} options={grpOpts} placeholder="Select group…" />
					</Field>
				</div>
			</div>
			<div className="formfoot">
				{err && <span className="ferr">{err}</span>}
				<span className="spacer" />
				<button className="btn" onClick={onClose}>
					Cancel
				</button>
				<button className="btn primary" disabled={loading} onClick={() => void save()}>
					{loading ? 'Saving…' : 'Create supplier'}
				</button>
			</div>
		</Modal>
	);
}
