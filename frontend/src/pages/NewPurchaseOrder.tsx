import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFrappeFileUpload, useFrappeGetCall, useFrappePostCall, useFrappeUpdateDoc } from 'frappe-react-sdk';
import {
	API,
	poDisplayStatus,
	type ApprovedMr,
	type ItemOption,
	type PoContext,
	type PoDetail,
	type PoSourceLine,
	type SavePoResult,
} from '../lib/api';
import { Field, SelectInput, SearchSelect, TextArea } from '../components/form';
import { Icon } from '../components/Icon';
import { DocLifecycleActions } from '../components/DocLifecycleActions';
import { LinkedDocs } from '../components/LinkedDocs';
import { DocActivity } from '../components/DocActivity';
import { CreateSupplierModal } from '../components/CreateSupplierModal';
import { CreateItemModal } from '../components/CreateItemModal';
import { useToast } from '../components/Toast';
import { fmtMoney, parseServerError, termsHtmlToText, termsTextToHtml } from '../lib/format';
import { whatsAppPoUrl } from '../lib/whatsapp';

const AMOUNT_THRESHOLD = 50000;

const INTRA = 'Intra-State (CGST + SGST)';
const INTER = 'Inter-State (IGST)';
const NONE = 'Unregistered / No GST';

interface Line {
	item_code: string;
	item_name: string;
	uom: string;
	uoms: { uom: string; conversion_factor: number }[];
	sub_category: string | null;
	category: string | null;
	qty: string;
	rate: string;
	gst: string;
	rwt: string;
	specification: string;
	remark: string;
	schedule_date: string;
	material_request: string | null;
	material_request_item: string | null;
}

const num = (s: string | number | null | undefined) => Number(s) || 0;
const round = (n: number, d = 2) => {
	const f = 10 ** d;
	return Math.round(n * f) / f;
};
// Round to a whole rupee using banker's rounding (half-to-even) to match
// ERPNext's frappe.utils.rounded(); plain Math.round (half-up) would show a
// total 1 rupee too high on .5-over-even amounts (e.g. 76.50).
const bankersRound = (x: number) => {
	const floor = Math.floor(x);
	if (Math.abs(x - floor - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1;
	return Math.round(x);
};

export function NewPurchaseOrder() {
	const { id } = useParams();
	const navigate = useNavigate();
	const toast = useToast();
	const isEdit = !!id;

	const ctxRes = useFrappeGetCall<{ message: PoContext }>(API.poContext, {});
	const ctx = ctxRes.data?.message;
	const [supModal, setSupModal] = useState(false);
	const [itemModal, setItemModal] = useState(false);
	const [pendingAdd, setPendingAdd] = useState<string | null>(null);
	const mrsRes = useFrappeGetCall<{ message: ApprovedMr[] }>(API.approvedMrs, {});
	const approvedMrs = mrsRes.data?.message ?? [];

	const detailRes = useFrappeGetCall<{ message: PoDetail }>(
		API.poDetail,
		{ name: id },
		isEdit ? undefined : null,
	);
	const detail = detailRes.data?.message;
	// A PO is editable only as a brand-new doc or while still in Draft. A Pending
	// PO is docstatus 0 too, but it's out for approval — lock the form and surface
	// the approver's workflow actions instead. Submitted/cancelled are read-only.
	const editable = isEdit ? !!detail && detail.docstatus === 0 && detail.workflow_state === 'Draft' : true;
	const readOnly = !editable;

	const { call: savePo, loading: saving } = useFrappePostCall<{ message: SavePoResult }>(API.savePo);
	const { call: fetchMrItems } = useFrappePostCall<{ message: { category: string; project: string; requester?: string; items: PoSourceLine[] } }>(API.mrItemsForPo);
	const { call: fetchGst } = useFrappePostCall<{ message: number }>(API.itemGstRate);
	const { call: detectTax } = useFrappePostCall<{ message: string }>(API.partyTaxType);
	const { call: changeStatus, loading: statusBusy } = useFrappePostCall<{ message: { status: string } }>(API.setPoStatus);

	const [supplier, setSupplier] = useState('');
	const [project, setProject] = useState('');
	const [category, setCategory] = useState('');
	const [taxType, setTaxType] = useState('');
	const [orderDate, setOrderDate] = useState('');
	const [requiredBy, setRequiredBy] = useState('');
	const [remark, setRemark] = useState('');
	const [receiver, setReceiver] = useState('');
	const [requesters, setRequesters] = useState<string[]>([]);
	const [terms, setTerms] = useState('');
	const [termsSeeded, setTermsSeeded] = useState(false);
	const { upload, loading: uploading } = useFrappeFileUpload();
	const { updateDoc } = useFrappeUpdateDoc();
	const fileRef = useRef<HTMLInputElement>(null);
	const [attachment, setAttachment] = useState<string | null>(null);
	const [pendingFile, setPendingFile] = useState<File | null>(null);

	async function uploadTo(name: string, file: File) {
		const res = await upload(file, { doctype: 'Purchase Order', docname: name, fieldname: 'custom_add_receipt', isPrivate: true });
		await updateDoc('Purchase Order', name, { custom_add_receipt: res.file_url });
		return res.file_url;
	}
	function onPickFile(file: File) {
		setErr('');
		if (id) {
			uploadTo(id, file).then((url) => setAttachment(url)).catch((e) => setErr(parseServerError(e)));
		} else {
			setPendingFile(file); // staged — uploaded right after the first save
		}
	}
	const [lines, setLines] = useState<Line[]>([]);
	const [err, setErr] = useState('');
	const [seeded, setSeeded] = useState(false);

	// Deep-link from an approved Material Request ("Create purchase order" button):
	// /purchase-orders/new?mr=<name> auto-pulls that MR's items, project & category.
	const [searchParams] = useSearchParams();
	const mrParam = searchParams.get('mr');
	const [mrPulled, setMrPulled] = useState(false);

	useEffect(() => {
		if (!isEdit && ctx) {
			if (!requiredBy) setRequiredBy(ctx.today);
			if (!orderDate) setOrderDate(ctx.today);
		}
	}, [ctx, isEdit, requiredBy, orderDate]);

	useEffect(() => {
		if (!isEdit && mrParam && !mrPulled) {
			setMrPulled(true);
			void pullFromMr(mrParam);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isEdit, mrParam, mrPulled]);

	useEffect(() => {
		if (isEdit && detail && !seeded) {
			setSupplier(detail.supplier ?? '');
			setProject(detail.project ?? '');
			setCategory(detail.category ?? '');
			setTaxType(detail.tax_type ?? '');
			setOrderDate(detail.transaction_date ?? '');
			setRequiredBy(detail.schedule_date ?? '');
			setRemark(detail.remark ?? '');
			setReceiver(detail.receiver ?? '');
			setRequesters(detail.requesters ?? []);
			setAttachment(detail.attachment ?? null);
			setLines(
				detail.items.map((it) => ({
					item_code: it.item_code,
					item_name: it.item_name,
					uom: it.uom,
					uoms: it.uoms ?? [{ uom: it.uom, conversion_factor: 1 }],
					sub_category: it.sub_category,
					category: it.category,
					qty: String(it.qty ?? ''),
					rate: String(it.rate ?? ''),
					gst: it.gst_percent != null ? String(it.gst_percent) : '',
					rwt: it.rate_with_tax != null ? String(it.rate_with_tax) : '',
					specification: it.specification ?? '',
					remark: it.remark ?? '',
					schedule_date: it.schedule_date ?? '',
					material_request: it.material_request ?? null,
					material_request_item: it.material_request_item ?? null,
				})),
			);
			setSeeded(true);
		}
	}, [isEdit, detail, seeded]);

	// Seed the Terms & Conditions box once. New PO -> the editable default; editing
	// -> the PO's saved terms, falling back to the default for older POs that have
	// none. Kept separate from the field seed above so it can wait for whichever of
	// detail / ctx provides its source.
	useEffect(() => {
		if (termsSeeded) return;
		if (isEdit) {
			if (!detail) return;
			if (!detail.terms && !ctx) return; // wait for ctx to supply the default
			setTerms(termsHtmlToText(detail.terms || ctx?.default_terms || ''));
		} else {
			if (!ctx) return;
			setTerms(termsHtmlToText(ctx.default_terms || ''));
		}
		setTermsSeeded(true);
	}, [isEdit, detail, ctx, termsSeeded]);

	const itemsRes = useFrappeGetCall<{ message: ItemOption[] }>(
		API.itemSearch,
		{ category },
		category ? undefined : null,
	);
	const pickerOptions = useMemo(
		() =>
			(itemsRes.data?.message ?? []).map((o) => ({
				value: o.value,
				label: o.label,
				sub: o.sub_category ? `${o.sub_category} · ${o.uom}` : o.uom || '',
			})),
		[itemsRes.data],
	);

	const proj = useMemo(() => ctx?.projects.find((p) => p.name === project), [ctx, project]);
	const storeName = proj?.store_name ?? '';
	const companyName = proj?.company_name ?? '';

	function onSupplier(v: string) {
		setSupplier(v);
		if (v && !taxType) {
			detectTax({ supplier: v }).then((r) => {
				if (r?.message) setTaxType(r.message);
			}).catch(() => undefined);
		}
	}

	function onTaxType(v: string) {
		setTaxType(v);
		// Unregistered / No GST: clear any per-line GST so the form matches the
		// saved doc (the backend zeroes GST for this tax type anyway).
		if (v === NONE) setLines((ls) => ls.map((l) => ({ ...l, gst: '', rwt: l.rate })));
	}

	async function appendItems(rows: { item_code: string; item_name: string; uom: string; uoms?: { uom: string; conversion_factor: number }[]; sub_category: string | null; category?: string | null; qty?: number; specification?: string | null; remark?: string | null; material_request?: string | null; material_request_item?: string | null }[]) {
		const fresh = rows.filter((r) => !lines.some((l) => l.item_code === r.item_code));
		const built: Line[] = fresh.map((r) => ({
			item_code: r.item_code,
			item_name: r.item_name,
			uom: r.uom,
			uoms: r.uoms ?? [{ uom: r.uom, conversion_factor: 1 }],
			sub_category: r.sub_category,
			category: r.category ?? null,
			qty: r.qty != null ? String(r.qty) : '',
			rate: '',
			gst: '',
			rwt: '',
			specification: r.specification ?? '',
			remark: r.remark ?? '',
			schedule_date: requiredBy,
			material_request: r.material_request ?? null,
			material_request_item: r.material_request_item ?? null,
		}));
		setLines((ls) => [...ls, ...built]);
		// GST prefill from each item's Item Tax Template
		for (const b of built) {
			try {
				const g = (await fetchGst({ item_code: b.item_code, company: ctx?.company }))?.message;
				if (g) {
					setLines((ls) =>
						ls.map((l) =>
							l.item_code === b.item_code
								? { ...l, gst: String(g), rwt: l.rate ? String(round(num(l.rate) * (1 + g / 100), 2)) : l.rwt }
								: l,
						),
					);
				}
			} catch {
				/* ignore prefill failure */
			}
		}
	}

	function addByCategory(code: string) {
		const opt = (itemsRes.data?.message ?? []).find((o) => o.value === code);
		if (!opt) return;
		void appendItems([{ item_code: opt.value, item_name: opt.label, uom: opt.uom, uoms: opt.uoms, sub_category: opt.sub_category, category }]);
	}

	// After an inline item create + list refresh, auto-add the new item to the order.
	useEffect(() => {
		if (pendingAdd && (itemsRes.data?.message ?? []).some((o) => o.value === pendingAdd)) {
			addByCategory(pendingAdd);
			setPendingAdd(null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pendingAdd, itemsRes.data]);

	async function pullFromMr(mrName: string) {
		if (!mrName) return;
		setErr('');
		try {
			const res = await fetchMrItems({ material_request: mrName });
			const msg = res?.message;
			if (!msg) return;
			// One project per PO — refuse a material request from another project.
			if (fromMr && project && msg.project && msg.project !== project) {
				setErr(
					`That material request belongs to “${msg.project}”. A purchase order can include requests from only one project (“${project}”).`,
				);
				return;
			}
			if (msg.category) setCategory(msg.category);
			if (msg.project) setProject(msg.project);
			if (msg.requester) setRequesters((rs) => (rs.includes(msg.requester!) ? rs : [...rs, msg.requester!]));
			await appendItems(msg.items.map((it) => ({ ...it, category: msg.category })));
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	function setLineCalc(i: number, field: 'qty' | 'rate' | 'gst' | 'rwt', value: string) {
		setLines((ls) =>
			ls.map((l, idx) => {
				if (idx !== i) return l;
				const n = { ...l, [field]: value };
				const g = num(n.gst);
				if (field === 'rate' || field === 'gst') {
					n.rwt = n.rate ? String(round(num(n.rate) * (1 + g / 100), 2)) : '';
				} else if (field === 'rwt') {
					n.rate = g ? String(round(num(n.rwt) / (1 + g / 100), 4)) : n.rwt;
				}
				return n;
			}),
		);
	}
	function setLine(i: number, patch: Partial<Line>) {
		setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
	}
	function removeLine(i: number) {
		setLines((ls) => ls.filter((_, idx) => idx !== i));
	}

	const isNoGst = taxType === NONE;
	const net = lines.reduce((s, l) => s + num(l.qty) * num(l.rate), 0);
	const gstTotal = isNoGst ? 0 : lines.reduce((s, l) => s + (num(l.qty) * num(l.rate) * num(l.gst)) / 100, 0);
	const grand = net + gstTotal;
	// Round-off to whole rupees. For a saved (read-only) PO show the server's
	// authoritative rounded_total/rounding_adjustment; for an editable/new PO
	// mirror ERPNext's banker's rounding on the live total.
	const useServerRound = !!detail && !editable && detail.rounded_total != null;
	const roundedGrand = useServerRound ? (detail!.rounded_total as number) : bankersRound(grand);
	const roundOff = useServerRound ? (detail!.rounding_adjustment ?? 0) : round(roundedGrand - grand, 2);
	const overThreshold = grand > AMOUNT_THRESHOLD;
	const hasGst = gstTotal > 0;
	// Source material request(s): derived from the lines (covers new / from-MR /
	// editing). When present, the project & category are fixed by the MR.
	const sourceMrs = useMemo(() => {
		const fromLines = Array.from(new Set(lines.map((l) => l.material_request).filter(Boolean))) as string[];
		return fromLines.length ? fromLines : detail?.material_requests ?? [];
	}, [lines, detail]);
	const fromMr = sourceMrs.length > 0;
	// Distinct categories represented by the lines. A PO is normally one category,
	// but when built from multiple MRs of different categories we surface all of
	// them in the form (custom_category holds a single value, so a multi-category
	// PO stores none rather than a misleading single category).
	const lineCats = useMemo(
		() => Array.from(new Set(lines.map((l) => l.category).filter(Boolean))) as string[],
		[lines],
	);
	const multiCat = lineCats.length > 1;
	// MR picker: drop already-added MRs, and once a project is locked (from the
	// first MR) show only that project's requests — a PO can't mix projects.
	const mrPickerOptions = useMemo(
		() =>
			approvedMrs
				.filter((m) => !sourceMrs.includes(m.name))
				.filter((m) => !fromMr || m.custom_select_project_ === project)
				.map((m) => ({
					value: m.name,
					label: m.name,
					sub: [m.custom_category, m.custom_select_project_].filter(Boolean).join(' · '),
				})),
		[approvedMrs, sourceMrs, fromMr, project],
	);
	const breakdown = isNoGst
		? []
		: taxType === INTER
			? [{ k: 'IGST', v: gstTotal }]
			: taxType === INTRA
				? [{ k: 'CGST', v: gstTotal / 2 }, { k: 'SGST', v: gstTotal / 2 }]
				: [];

	async function save(strict: boolean) {
		setErr('');
		if (!supplier) return setErr('Select a supplier.');
		if (lines.length === 0) return setErr('Add at least one item.');
		if (hasGst && !taxType) return setErr('Select the tax type (Intra-State or Inter-State).');
		if (strict && lines.some((l) => num(l.qty) <= 0 || num(l.rate) <= 0))
			return setErr('Every line needs a quantity and a rate.');
		if (strict && !receiver) return setErr('Assign a receiver before placing the order.');
		try {
			const payload = {
				name: id ?? null,
				supplier,
				project: project || null,
				category: lineCats.length === 1 ? lineCats[0] : multiCat ? null : category || null,
				tax_type: taxType || null,
				transaction_date: orderDate || null,
				schedule_date: requiredBy || null,
				remark,
				terms: termsTextToHtml(terms),
				receiver: receiver || null,
				submit_for_approval: strict,
				items: lines.map((l) => ({
					item_code: l.item_code,
					qty: num(l.qty),
					uom: l.uom,
					rate: num(l.rate),
					gst_percent: num(l.gst),
					rate_with_tax: num(l.rwt),
					specification: l.specification,
					remark: l.remark,
					schedule_date: l.schedule_date || null,
					material_request: l.material_request,
					material_request_item: l.material_request_item,
				})),
			};
			const res = await savePo({ data: payload });
			const newName = res.message.name;
			const st = res.message.workflow_state;
			toast.success(st === 'Approved' ? 'Purchase order placed' : st === 'Pending' ? 'Sent for approval' : 'Draft saved');
			// Upload a staged attachment now that the new PO exists.
			if (pendingFile && !id) {
				try {
					const url = await uploadTo(newName, pendingFile);
					setAttachment(url);
				} catch (e) {
					console.error(e);
				}
				setPendingFile(null);
			}
			// Editing in place: revalidate, then re-seed ONLY the items (which the
			// backend rebuilds) + attachment from the fresh doc. Do NOT re-run the full
			// seed — that overwrote header fields the user set (e.g. snapped Required-by
			// back to today). A brand-new PO changes route and refetches.
			if (isEdit && newName === id) {
				const fresh = await detailRes.mutate();
				const d = fresh?.message;
				if (d) {
					setLines(
						d.items.map((it) => ({
							item_code: it.item_code,
							item_name: it.item_name,
							uom: it.uom,
							uoms: it.uoms ?? [{ uom: it.uom, conversion_factor: 1 }],
							sub_category: it.sub_category,
							category: it.category,
							qty: String(it.qty ?? ''),
							rate: String(it.rate ?? ''),
							gst: it.gst_percent != null ? String(it.gst_percent) : '',
							rwt: it.rate_with_tax != null ? String(it.rate_with_tax) : '',
							specification: it.specification ?? '',
							remark: it.remark ?? '',
							schedule_date: it.schedule_date ?? '',
							material_request: it.material_request ?? null,
							material_request_item: it.material_request_item ?? null,
						})),
					);
					setAttachment(d.attachment ?? null);
				}
			} else {
				navigate('/purchase-orders/' + newName);
			}
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	// Open the ERPNext print format (carries the company-linked signature set on
	// submit) in a new tab — same-origin, so the logged-in session applies.
	function printPo() {
		if (!detail) return;
		const fmt = detail.print_format || 'Sanskruti PO Print Format';
		const url =
			`/printview?doctype=${encodeURIComponent('Purchase Order')}` +
			`&name=${encodeURIComponent(detail.name)}` +
			`&format=${encodeURIComponent(fmt)}&trigger_print=1&no_letterhead=0`;
		window.open(url, '_blank', 'noopener');
	}

	async function doStatus(action: 'close' | 'reopen') {
		if (!detail) return;
		setErr('');
		try {
			await changeStatus({ name: detail.name, action });
			toast.success(action === 'close' ? 'Order closed' : 'Order re-opened');
			await detailRes.mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<main>
			<div className="crumb">
				<a onClick={() => navigate('/purchase-orders')} style={{ cursor: 'pointer' }}>
					Purchase orders
				</a>
				&nbsp;/&nbsp;
				<span className="data">{isEdit ? id : 'New'}</span>
			</div>
			<div className="titlebar">
				<div>
					<div className="eyebrow">Buying</div>
					<h1 style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-ui)' }}>
						{isEdit ? 'Purchase order' : 'New purchase order'}
					</h1>
					{detail && (
						<div style={{ marginTop: 8 }}>
							<span className={'tag ' + poDisplayStatus(detail).tone}>{poDisplayStatus(detail).label}</span>
						</div>
					)}
					{detail && detail.workflow_state === 'Rejected' && detail.rejection_remark && (
						<div className="alert" style={{ marginTop: 10 }}>
							<Icon name="warning" size={16} />
							<span><b>Rejected.</b> {detail.rejection_remark}</span>
						</div>
					)}
					{sourceMrs.length > 0 && (
						<div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
							<span className="eyebrow" style={{ margin: 0 }}>From material request</span>
							{sourceMrs.map((mr) => (
								<span
									key={mr}
									className="id"
									style={{ cursor: 'pointer', textDecoration: 'underline' }}
									onClick={() => navigate('/material-requests/' + mr)}
								>
									{mr}
								</span>
							))}
						</div>
					)}
				</div>
				<div className="spacer" />
				{isEdit && detail && (
					<button className="btn" onClick={printPo} title="Open the purchase order print format in a new tab">
						<Icon name="file-text" size={15} /> Print
					</button>
				)}
				{isEdit && detail && detail.docstatus === 1 && (
					<button
						className="btn"
						onClick={() => window.open(whatsAppPoUrl(detail), '_blank', 'noopener')}
						title={detail.supplier_mobile ? `Send to ${detail.supplier_name || detail.supplier} on WhatsApp` : 'Open WhatsApp (no supplier number on file — pick a contact)'}
					>
						<Icon name="whatsapp" size={15} /> WhatsApp
					</button>
				)}
				{isEdit && detail && detail.docstatus === 1 && detail.status !== 'Closed' && (detail.per_received ?? 0) < 100 && (
					<button
						className="btn"
						onClick={() => navigate('/receipts/new?po=' + encodeURIComponent(detail.name))}
						title="Create a goods receipt for this order"
					>
						<Icon name="package" size={15} /> Create receipt
					</button>
				)}
				{isEdit && detail?.can_close && (
					<button className="btn" disabled={statusBusy} onClick={() => void doStatus('close')}>
						<Icon name="lock" size={14} /> {statusBusy ? 'Closing…' : 'Close'}
					</button>
				)}
				{isEdit && detail?.can_reopen && (
					<button className="btn" disabled={statusBusy} onClick={() => void doStatus('reopen')}>
						<Icon name="unlock" size={14} /> {statusBusy ? 'Reopening…' : 'Re-open'}
					</button>
				)}
				{editable && (
					<>
						<button className="btn" disabled={saving} onClick={() => save(false)}>
							Save draft
						</button>
						{/* Primary action follows the live grand total via the amount-gated
						    workflow: <= ₹50k places the order directly (submitted), > ₹50k
						    routes it for approval. The server re-resolves the real
						    transition from get_transitions on save. */}
						<button className="btn primary" disabled={saving} onClick={() => save(true)} title={`Grand total ${fmtMoney(grand, 'INR')}`}>
							<Icon name={overThreshold ? 'send' : 'check'} size={15} />
							{saving ? 'Saving…' : overThreshold ? 'Send for approval' : 'Place order'}
						</button>
					</>
				)}
				{isEdit && detail && !editable && (
					<DocLifecycleActions
						doctype="Purchase Order"
						name={detail.name}
						noun="order"
						transitions={detail.transitions}
						canCancel={detail.can_cancel}
						canAmend={detail.can_amend}
						onChanged={() => void detailRes.mutate()}
						basePath="/purchase-orders"
					/>
				)}
			</div>

			{err && (
				<div className="alert">
					<Icon name="warning" size={16} />
					<span>
						<b>Couldn’t save.</b> {err}
					</span>
				</div>
			)}

			<div className="grid">
				<div className="stack">
				<section className="card accent">
					<div className="chead">
						<Icon name="cube" size={16} />
						<span className="ttl">Order details</span>
					</div>
					<div className="formgrid">
						{!readOnly && (
							<div className="span2">
								<Field
									label="Start from a material request"
									hint={fromMr ? `A PO can include requests from one project only — showing requests for “${project}”.` : "Pull an approved MR's items, project & category in one step — or build the order from scratch below. Optional."}
								>
									<SearchSelect
										value={''}
										onChange={pullFromMr}
										placeholder={mrPickerOptions.length ? 'Pick an approved material request…' : fromMr ? `No more requests for ${project}` : 'No material requests pending order'}
										disabled={mrPickerOptions.length === 0}
										options={mrPickerOptions}
									/>
								</Field>
							</div>
						)}
						<Field label="Supplier" required>
							<SearchSelect
								value={supplier}
								onChange={onSupplier}
								disabled={readOnly}
								placeholder="Select supplier…"
								options={(ctx?.suppliers ?? []).map((s) => ({ value: s.name, label: s.supplier_name || s.name }))}
								onCreate={readOnly ? undefined : () => setSupModal(true)}
								createLabel="New supplier"
							/>
						</Field>
						<Field label="Project" hint={fromMr ? 'Set by the material request.' : 'Company, store & warehouse fill from the project.'}>
							<SearchSelect
								value={project}
								onChange={setProject}
								disabled={readOnly || fromMr}
								placeholder="Select project…"
								options={(ctx?.projects ?? []).map((p) => ({
									value: p.name,
									label: p.project_name || p.name,
									sub: [p.company_name, p.store_name].filter(Boolean).join(' · '),
								}))}
							/>
						</Field>
						<Field label="Company">
							<input className="inp" disabled value={companyName || '—'} />
						</Field>
						<Field label={multiCat ? 'Categories' : 'Category'} hint={multiCat ? 'This order spans multiple categories from the selected requests.' : undefined}>
							{multiCat ? (
								<div className="sochips" style={{ marginTop: 0 }}>
									{lineCats.map((c) => (
										<span key={c} className="sochip">{c}</span>
									))}
								</div>
							) : (
							<SelectInput
								value={category}
								onChange={(v) => {
									setCategory(v);
									setLines([]);
								}}
								disabled={readOnly || fromMr}
								allowEmpty
								placeholder="Select category…"
								options={(ctx?.categories ?? []).map((c) => ({ value: c }))}
							/>
							)}
						</Field>
						<Field
							label="Tax type"
							hint="Auto-set from supplier vs company state; change if needed."
						>
							<SelectInput
								value={taxType}
								onChange={onTaxType}
								disabled={readOnly}
								allowEmpty
								placeholder="Select…"
								options={(ctx?.tax_types ?? [INTRA, INTER, NONE]).map((t) => ({ value: t }))}
							/>
						</Field>
						<Field label="Order date" hint="Back-date the order if needed.">
							<input
								className="inp mono"
								type="date"
								value={orderDate}
								disabled={readOnly}
								max={requiredBy || undefined}
								onChange={(e) => setOrderDate(e.target.value)}
							/>
						</Field>
						<Field label="Required by">
							<input
								className="inp mono"
								type="date"
								value={requiredBy}
								disabled={readOnly}
								min={orderDate || undefined}
								onChange={(e) => setRequiredBy(e.target.value)}
							/>
						</Field>
						<Field label="Store / warehouse">
							<input className="inp" disabled value={storeName || '—'} />
						</Field>
						<Field label="Receiver" required hint="Who will receive this material — only they can make its receipt.">
							<SearchSelect
								value={receiver}
								onChange={setReceiver}
								disabled={readOnly}
								placeholder="Select receiver…"
								options={(ctx?.receivers ?? []).map((r) => ({ value: r.user, label: r.full_name, sub: r.mobile_no || undefined }))}
							/>
						</Field>
						<Field label="Requested by" hint="Who raised the material request(s).">
							<input className="inp" disabled value={requesters.length ? requesters.join(', ') : '—'} />
						</Field>
						<div className="span2">
							<Field label="Remark">
								<TextArea value={remark} onChange={setRemark} rows={2} disabled={readOnly} placeholder="Header note…" />
							</Field>
						</div>
						<div className="span2">
							<div className="field">
								<span className="flabel">Attachment</span>
								<input
									ref={fileRef}
									type="file"
									style={{ display: 'none' }}
									onChange={(e) => {
										const f = e.target.files?.[0];
										e.target.value = '';
										if (f) onPickFile(f);
									}}
								/>
								<div className={'upload' + (readOnly ? ' disabled' : '')} onClick={() => !readOnly && fileRef.current?.click()}>
									<Icon name="download" size={20} style={{ transform: 'rotate(180deg)' }} />
									<div>
										{attachment ? (
											<a href={attachment} target="_blank" rel="noreferrer" style={{ color: 'var(--iris)' }}>View attached file</a>
										) : pendingFile ? (
											<span><b>{pendingFile.name}</b> <span className="dim">— attaches on save</span></span>
										) : uploading ? (
											'Uploading…'
										) : readOnly ? (
											<span className="dim">No attachment.</span>
										) : (
											<span>Drop a file or <span style={{ color: 'var(--iris)', fontWeight: 500 }}>browse</span></span>
										)}
									</div>
								</div>
								<span className="fhint">PO scan, quotation, drawing — header level</span>
							</div>
						</div>
					</div>
				</section>

				<section className="card">
					<div className="chead">
						<Icon name="layers" size={16} />
						<span className="ttl">Items</span>
						<span className="cnt">{lines.length}</span>
					</div>
					{!readOnly && (
						<div className="addwrap">
							<div className="field">
								<span className="flabel">Add an item by category</span>
								<SearchSelect
									value={''}
									onChange={addByCategory}
									disabled={!category}
									placeholder={category ? 'Search and add an item…' : 'Pick a category (or pull a material request) first'}
									options={pickerOptions}
									onCreate={category ? () => setItemModal(true) : undefined}
									createLabel="New item"
								/>
							</div>
						</div>
					)}
					<div className="pohead">
						<span>#</span>
						<span>Item</span>
						<span>Qty</span>
						<span>UOM</span>
						<span>Rate (w/o tax)</span>
						<span>GST %</span>
						<span>Rate (w/ tax)</span>
						<span className="r">Amount (w/o tax)</span>
						<span />
					</div>
					{lines.length === 0 && (
						<div className="empty" style={{ padding: '26px 18px' }}>
							<div className="t2">No items yet. Pull from a material request or add by category.</div>
						</div>
					)}
					{lines.map((l, i) => (
						<div className="poline" key={l.item_code}>
							<div className="potop">
								<span className="ix">{i + 1}</span>
								<div className="iname">
									<div className="t1">{l.item_name}</div>
									<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
										{l.item_code !== l.item_name && <span className="t2">{l.item_code}</span>}
										{l.sub_category && <span className="subpill" style={{ padding: '1px 7px', fontSize: 10 }}>{l.sub_category}</span>}
										{l.material_request && <span className="t2" style={{ color: 'var(--fg-4)' }} title={l.material_request}>· MR</span>}
									</div>
								</div>
								<div className="lf">
									<span className="lfl">Qty</span>
									<input className="inp mono" value={l.qty} disabled={readOnly} inputMode="decimal" onChange={(e) => setLineCalc(i, 'qty', e.target.value)} />
								</div>
								<div className="lf">
									<span className="lfl">UOM</span>
									{l.uoms.length > 1 ? (
										<SelectInput value={l.uom} onChange={(v) => setLine(i, { uom: v })} disabled={readOnly} options={l.uoms.map((u) => ({ value: u.uom }))} />
									) : (
										<input className="inp" value={l.uom} disabled />
									)}
								</div>
								<div className="lf">
									<span className="lfl">Rate (w/o tax)</span>
									<input className="inp mono" value={l.rate} disabled={readOnly} inputMode="decimal" placeholder="0.00" onChange={(e) => setLineCalc(i, 'rate', e.target.value)} />
								</div>
								<div className="lf">
									<span className="lfl">GST %</span>
									<input className="inp mono" value={isNoGst ? '' : l.gst} disabled={readOnly || isNoGst} inputMode="decimal" placeholder="0" onChange={(e) => setLineCalc(i, 'gst', e.target.value)} />
								</div>
								<div className="lf">
									<span className="lfl">Rate (w/ tax)</span>
									<input className="inp mono" value={isNoGst ? l.rate : l.rwt} disabled={readOnly || isNoGst} inputMode="decimal" placeholder="0.00" onChange={(e) => setLineCalc(i, 'rwt', e.target.value)} />
								</div>
								<div className="lf">
									<span className="lfl">Amount (w/o tax)</span>
									<div className="amtwrap">
										<span className="amt">{fmtMoney(num(l.qty) * num(l.rate), 'INR')}</span>
										{!isNoGst && num(l.gst) > 0 && (
											<span className="amtincl">incl. {fmtMoney(num(l.qty) * (num(l.rwt) || num(l.rate) * (1 + num(l.gst) / 100)), 'INR')}</span>
										)}
									</div>
								</div>
								{!readOnly ? (
									<button className="xbtn" onClick={() => removeLine(i)} aria-label="Remove">
										<Icon name="close" size={13} />
									</button>
								) : (
									<span />
								)}
							</div>
							<div className="pobot">
								<div className="ff">
									<span className="fl">Specification</span>
									<input className="inp" value={l.specification} disabled={readOnly} placeholder="Grade, size, standard…" onChange={(e) => setLine(i, { specification: e.target.value })} />
								</div>
								<div className="ff">
									<span className="fl">Remark</span>
									<input className="inp" value={l.remark} disabled={readOnly} placeholder="Line note…" onChange={(e) => setLine(i, { remark: e.target.value })} />
								</div>
							</div>
						</div>
					))}
				</section>

				<section className="card">
					<div className="chead">
						<Icon name="file-text" size={16} />
						<span className="ttl">Terms &amp; conditions</span>
					</div>
					<div className="formgrid">
						<div className="span2">
							<Field
								label="Printed at the bottom of this purchase order"
								hint="One point per line. Prefilled from your default (Settings → PO Terms &amp; Conditions) — edit here to change it for this order only."
							>
								<TextArea value={terms} onChange={setTerms} rows={6} disabled={readOnly} placeholder="One term per line…" />
							</Field>
						</div>
					</div>
				</section>
				</div>

				<div className="stack">
					<section className="card">
						<div className="chead">
							<Icon name="rupee" size={16} />
							<span className="ttl">Tax breakdown</span>
						</div>
					<div className="taxsum">
						<div className="taxrow">
							<span className="k">Total (before tax)</span>
							<span className="v">{fmtMoney(net, 'INR')}</span>
						</div>
						{hasGst && breakdown.length === 0 && (
							<div className="taxrow">
								<span className="k" style={{ color: 'var(--pending)' }}>Select a tax type to split GST</span>
								<span className="v">{fmtMoney(gstTotal, 'INR')}</span>
							</div>
						)}
						{breakdown.map((b) => (
							<div className="taxrow" key={b.k}>
								<span className="k">{b.k}</span>
								<span className="v">{fmtMoney(b.v, 'INR')}</span>
							</div>
						))}
						{Math.abs(roundOff) >= 0.005 && (
							<div className="taxrow">
								<span className="k">Round-off</span>
								<span className="v">{roundOff > 0 ? '+' : ''}{fmtMoney(roundOff, 'INR')}</span>
							</div>
						)}
						<div className="taxrow grand">
							<span className="k">Grand total</span>
							<span className="v">{fmtMoney(roundedGrand, 'INR')}</span>
						</div>
					</div>
				</section>

					{isEdit && detail && <LinkedDocs doctype="Purchase Order" name={detail.name} />}
					{isEdit && detail && <DocActivity doctype="Purchase Order" name={detail.name} />}
				</div>
			</div>
			{supModal && (
				<CreateSupplierModal
					onClose={() => setSupModal(false)}
					onCreated={async (nm) => { setSupModal(false); await ctxRes.mutate(); onSupplier(nm); }}
				/>
			)}
			{itemModal && (
				<CreateItemModal
					category={category}
					onClose={() => setItemModal(false)}
					onCreated={async (code) => { setItemModal(false); await itemsRes.mutate(); setPendingAdd(code); }}
				/>
			)}
		</main>
	);
}
