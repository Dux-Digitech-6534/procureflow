import { useState } from 'react';
import { useFrappePostCall, useFrappeGetDocList } from 'frappe-react-sdk';
import { API } from '../lib/api';
import { parseServerError } from '../lib/format';
import { Modal } from './ui';
import { Field, TextInput, SearchSelect } from './form';
import { useToast } from './Toast';

const GST = [
	{ value: '5', label: '5%' },
	{ value: '12', label: '12%' },
	{ value: '18', label: '18%' },
	{ value: '28', label: '28%' },
];

/** Inline "New item" used from the MR/PO item pickers. Category is fixed to the
 *  picker's current category so the new item appears in that filter immediately.
 *  Saves via save_item (correct flags / item group / HSN / GST). */
export function CreateItemModal({
	category,
	onClose,
	onCreated,
}: {
	category: string;
	onClose: () => void;
	onCreated: (code: string) => void;
}) {
	const { call, loading } = useFrappePostCall<{ message: string }>(API.saveItem);
	const toast = useToast();
	const uomRes = useFrappeGetDocList<{ name: string }>('UOM', { fields: ['name'], limit: 0 });
	const subRes = useFrappeGetDocList<{ name: string }>('Material Sub Category', {
		fields: ['name'],
		filters: [['material_category', '=', category]],
		limit: 0,
	});
	const uomOpts = (uomRes.data ?? []).map((u) => ({ value: u.name }));
	const subOpts = (subRes.data ?? []).map((s) => ({ value: s.name }));

	const [code, setCode] = useState('');
	const [name, setName] = useState('');
	const [uom, setUom] = useState('Nos');
	const [subCat, setSubCat] = useState('');
	const [hsn, setHsn] = useState('');
	const [gst, setGst] = useState('');
	const [err, setErr] = useState('');

	async function save() {
		if (!code.trim()) return setErr('Item code is required.');
		if (!uom) return setErr('Pick a default UOM.');
		setErr('');
		try {
			const r = await call({
				data: {
					item_code: code.trim(),
					item_name: name.trim() || code.trim(),
					stock_uom: uom,
					custom_category: category,
					custom_sub_category: subCat || null,
					hsn: hsn.trim() || null,
					gst: gst === '' ? null : Number(gst),
					uoms: [{ uom, conversion_factor: 1 }],
				},
			});
			toast.success('Item created');
			onCreated(r.message);
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Modal title="New item" icon="cube" onClose={onClose}>
			<div className="formgrid">
				<Field label="Item code" required>
					<TextInput value={code} onChange={setCode} placeholder="e.g. OPC Cement" />
				</Field>
				<Field label="Item name">
					<TextInput value={name} onChange={setName} placeholder="Defaults to the code" />
				</Field>
				<Field label="Category" hint="Fixed to the current filter">
					<TextInput value={category} onChange={() => {}} disabled />
				</Field>
				<Field label="Sub-category">
					<SearchSelect value={subCat} onChange={setSubCat} options={subOpts} placeholder="Select sub-category…" />
				</Field>
				<Field label="Default UOM" required>
					<SearchSelect value={uom} onChange={setUom} options={uomOpts} placeholder="Select UOM…" />
				</Field>
				<Field label="GST %">
					<SearchSelect value={gst} onChange={setGst} options={GST} placeholder="No GST (0%)" />
				</Field>
				<div className="span2">
					<Field label="HSN code">
						<TextInput value={hsn} onChange={setHsn} placeholder="e.g. 2523" />
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
					{loading ? 'Saving…' : 'Create item'}
				</button>
			</div>
		</Modal>
	);
}
