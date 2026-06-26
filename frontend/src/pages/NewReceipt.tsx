import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFrappeGetCall, useFrappePostCall, useFrappeFileUpload } from 'frappe-react-sdk';
import { API, type PoReceiptItems, type ReceivablePo } from '../lib/api';
import { Field, SearchSelect, TextArea } from '../components/form';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { fmtMoney, parseServerError } from '../lib/format';

/** Image picker tile (DUX .upload), used for the receipt material / invoice
 *  photos. NOT a <label> — a label wrapping a hidden file input double-fires
 *  the native picker. */
function ImagePick({ label, file, hint, onPick }: { label: string; file: File | null; hint?: string; onPick: (f: File) => void }) {
	const ref = useRef<HTMLInputElement>(null);
	return (
		<div className="field">
			<span className="flabel">{label}</span>
			<input
				ref={ref}
				type="file"
				accept="image/*"
				style={{ display: 'none' }}
				onChange={(e) => {
					const f = e.target.files?.[0];
					e.target.value = '';
					if (f) onPick(f);
				}}
			/>
			<div className="upload" onClick={() => ref.current?.click()}>
				<Icon name="download" size={20} style={{ transform: 'rotate(180deg)' }} />
				<div>
					{file ? (
						<span>
							<b>{file.name}</b> <span className="dim">— attaches on save</span>
						</span>
					) : (
						<span>
							Drop an image or <span style={{ color: 'var(--iris)', fontWeight: 500 }}>browse</span>
						</span>
					)}
				</div>
			</div>
			{hint && <span className="fhint">{hint}</span>}
		</div>
	);
}

interface Line {
	po_item: string;
	item_code: string;
	item_name: string;
	uom: string;
	ordered: number;
	pending: number;
	max_qty: number;
	qty: string;
}

/** Local YYYY-MM-DD (avoids the UTC drift of toISOString near midnight). */
function todayStr(): string {
	const d = new Date();
	const z = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function NewReceipt() {
	const navigate = useNavigate();
	const toast = useToast();
	const [searchParams] = useSearchParams();
	const posRes = useFrappeGetCall<{ message: ReceivablePo[] }>(API.receivablePos, {});
	const pos = posRes.data?.message ?? [];
	const [po, setPo] = useState('');
	const [lines, setLines] = useState<Line[]>([]);
	const [postingDate, setPostingDate] = useState(todayStr());
	const [deliveryNote, setDeliveryNote] = useState('');
	const [remark, setRemark] = useState('');
	const [materialImage, setMaterialImage] = useState<File | null>(null);
	const [invoiceImage, setInvoiceImage] = useState<File | null>(null);
	const [err, setErr] = useState('');

	const itemsRes = useFrappeGetCall<{ message: PoReceiptItems }>(
		API.poReceiptItems,
		{ purchase_order: po },
		po ? undefined : null,
	);
	const { call: createReceipt, loading: saving } = useFrappePostCall<{ message: { name: string } }>(API.createReceipt);
	const { upload, loading: uploading } = useFrappeFileUpload();

	// Deep-link from a PO ("Create receipt" button): /receipts/new?po=<name>.
	const poParam = searchParams.get('po');
	useEffect(() => {
		if (poParam && !po) setPo(poParam);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [poParam]);

	useEffect(() => {
		const msg = itemsRes.data?.message;
		if (msg) {
			setLines(
				msg.items.map((it) => ({
					po_item: it.po_item,
					item_code: it.item_code,
					item_name: it.item_name,
					uom: it.uom,
					ordered: it.ordered,
					pending: it.pending,
					max_qty: it.max_qty ?? it.pending,
					qty: String(it.pending),
				})),
			);
		}
	}, [itemsRes.data]);

	const meta = useMemo(() => pos.find((p) => p.name === po), [pos, po]);

	// A receipt's posting date can't precede the PO date — bump the default up.
	useEffect(() => {
		if (meta?.transaction_date && postingDate < meta.transaction_date) setPostingDate(meta.transaction_date);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [meta?.transaction_date]);

	function setQty(i: number, v: string) {
		setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, qty: v } : l)));
	}

	async function save() {
		setErr('');
		if (!po) return setErr('Pick a purchase order.');
		if (!postingDate) return setErr('Pick a receipt date.');
		const items = lines
			.map((l) => ({ po_item: l.po_item, qty: Number(l.qty) || 0 }))
			.filter((l) => l.qty > 0);
		if (items.length === 0) return setErr('Enter a received quantity for at least one item.');
		if (lines.some((l) => Number(l.qty) > l.max_qty + 1e-6))
			return setErr('Received quantity exceeds the allowed quantity (including any over-receipt tolerance).');
		try {
			// Upload the receipt images first (private + unattached); the backend
			// sets them on the PR before insert and attaches them to the receipt.
			let materialUrl: string | null = null;
			let invoiceUrl: string | null = null;
			if (materialImage) materialUrl = (await upload(materialImage, { isPrivate: true })).file_url;
			if (invoiceImage) invoiceUrl = (await upload(invoiceImage, { isPrivate: true })).file_url;
			const res = await createReceipt({
				data: {
					purchase_order: po,
					posting_date: postingDate,
					supplier_delivery_note: deliveryNote || null,
					remark: remark || null,
					material_image: materialUrl,
					invoice_image: invoiceUrl,
					items,
				},
			});
			toast.success('Receipt created');
			navigate('/receipts');
			void res;
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<main>
			<div className="crumb">
				<a onClick={() => navigate('/receipts')} style={{ cursor: 'pointer' }}>
					Receipts
				</a>
				&nbsp;/&nbsp;<span className="data">New</span>
			</div>
			<div className="titlebar">
				<div>
					<div className="eyebrow">Buying</div>
					<h1 style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-ui)' }}>New receipt</h1>
				</div>
				<div className="spacer" />
				<button className="btn primary" disabled={saving || uploading || !po} onClick={() => void save()}>
					<Icon name="check" size={15} />
					{uploading ? 'Uploading…' : saving ? 'Receiving…' : 'Create receipt'}
				</button>
			</div>

			{err && (
				<div className="alert">
					<Icon name="warning" size={16} />
					<span><b>Couldn’t create receipt.</b> {err}</span>
				</div>
			)}

			<div className="stack">
				<section className="card accent">
					<div className="chead">
						<Icon name="cube" size={16} />
						<span className="ttl">Against purchase order</span>
					</div>
					<div className="formgrid">
						<Field label="Purchase order" required hint="Submitted orders with quantity left to receive.">
							<SearchSelect
								value={po}
								onChange={setPo}
								placeholder={pos.length ? 'Select a purchase order…' : 'No receivable POs'}
								options={pos.map((p) => ({
									value: p.name,
									label: p.name,
									sub: [p.supplier_name ?? p.supplier, p.custom_project_name].filter(Boolean).join(' · '),
								}))}
							/>
						</Field>
						<Field label="Receipt date" required hint="Cannot be before the purchase order date.">
							<input
								className="inp mono"
								type="date"
								value={postingDate}
								min={meta?.transaction_date ?? undefined}
								onChange={(e) => setPostingDate(e.target.value)}
							/>
						</Field>
						<Field label="Supplier">
							<input className="inp" disabled value={meta ? meta.supplier_name ?? meta.supplier : '—'} />
						</Field>
						<Field label="Project">
							<input className="inp" disabled value={meta?.custom_project_name ?? '—'} />
						</Field>
						<Field label="PO grand total">
							<input className="inp mono" disabled value={meta ? fmtMoney(meta.grand_total, 'INR') : '—'} />
						</Field>
						<Field label="Supplier delivery note" hint="Supplier's challan / DN reference.">
							<input className="inp" value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="e.g. DN-00123" />
						</Field>
						<ImagePick
							label="Image of material receipt"
							file={materialImage}
							hint="Photo of the received material — optional."
							onPick={(f) => { setErr(''); setMaterialImage(f); }}
						/>
						<ImagePick
							label="Image of invoice"
							file={invoiceImage}
							hint="Photo / scan of the supplier invoice — optional."
							onPick={(f) => { setErr(''); setInvoiceImage(f); }}
						/>
						<div className="span2">
							<Field label="Remark">
								<TextArea value={remark} onChange={setRemark} rows={2} placeholder="Note for this receipt…" />
							</Field>
						</div>
					</div>
				</section>

				<section className="card">
					<div className="chead">
						<Icon name="package" size={16} />
						<span className="ttl">Items received</span>
						<span className="cnt">{lines.length}</span>
					</div>
					<div className="mrhead" style={{ gridTemplateColumns: '24px minmax(0,2fr) 110px 110px 110px' }}>
						<span>#</span>
						<span>Item</span>
						<span>Ordered</span>
						<span>Pending</span>
						<span>Receive</span>
					</div>
					{lines.length === 0 && (
						<div className="empty" style={{ padding: '24px 18px' }}>
							<div className="t2">{po ? 'Nothing pending to receive on this PO.' : 'Pick a purchase order.'}</div>
						</div>
					)}
					{lines.map((l, i) => (
						<div className="mrline" key={l.po_item}>
							<div className="mrtop" style={{ gridTemplateColumns: '24px minmax(0,2fr) 110px 110px 110px' }}>
								<span className="ix">{i + 1}</span>
								<div className="iname">
									<div className="t1">{l.item_name}</div>
									{l.item_code !== l.item_name && <div className="t2">{l.item_code}</div>}
								</div>
								<div className="lf">
									<span className="lfl">Ordered</span>
									<span className="mono" style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>{l.ordered} {l.uom}</span>
								</div>
								<div className="lf">
									<span className="lfl">Pending</span>
									<span className="mono" style={{ fontSize: 12.5, color: 'var(--fg-2)' }}>{l.pending}</span>
								</div>
								<div className="lf">
									<span className="lfl">Receive</span>
									<input className="inp mono" value={l.qty} inputMode="decimal" onChange={(e) => setQty(i, e.target.value)} />
								</div>
							</div>
						</div>
					))}
				</section>
			</div>
		</main>
	);
}
