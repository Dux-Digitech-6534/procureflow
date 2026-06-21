import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
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
import { fmtMoney, parseServerError } from '../lib/format';

const AMOUNT_THRESHOLD = 50000;

const INTRA = 'Intra-State (CGST + SGST)';
const INTER = 'Inter-State (IGST)';
const NONE = 'Unregistered / No GST';

interface Line {
	item_code: string;
	item_name: string;
	uom: string;
	sub_category: string | null;
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

export function NewPurchaseOrder() {
	const { id } = useParams();
	const navigate = useNavigate();
	const isEdit = !!id;

	const ctx = useFrappeGetCall<{ message: PoContext }>(API.poContext, {}).data?.message;
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
	const { call: fetchMrItems } = useFrappePostCall<{ message: { category: string; project: string; items: PoSourceLine[] } }>(API.mrItemsForPo);
	const { call: fetchGst } = useFrappePostCall<{ message: number }>(API.itemGstRate);
	const { call: detectTax } = useFrappePostCall<{ message: string }>(API.partyTaxType);

	const [supplier, setSupplier] = useState('');
	const [project, setProject] = useState('');
	const [category, setCategory] = useState('');
	const [taxType, setTaxType] = useState('');
	const [requiredBy, setRequiredBy] = useState('');
	const [remark, setRemark] = useState('');
	const [lines, setLines] = useState<Line[]>([]);
	const [err, setErr] = useState('');
	const [seeded, setSeeded] = useState(false);

	// Deep-link from an approved Material Request ("Create purchase order" button):
	// /purchase-orders/new?mr=<name> auto-pulls that MR's items, project & category.
	const [searchParams] = useSearchParams();
	const mrParam = searchParams.get('mr');
	const [mrPulled, setMrPulled] = useState(false);

	useEffect(() => {
		if (!isEdit && ctx && !requiredBy) setRequiredBy(ctx.today);
	}, [ctx, isEdit, requiredBy]);

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
			setRequiredBy(detail.schedule_date ?? '');
			setRemark(detail.remark ?? '');
			setLines(
				detail.items.map((it) => ({
					item_code: it.item_code,
					item_name: it.item_name,
					uom: it.uom,
					sub_category: it.sub_category,
					qty: String(it.qty ?? ''),
					rate: String(it.rate ?? ''),
					gst: it.gst_percent != null ? String(it.gst_percent) : '',
					rwt: it.rate_with_tax != null ? String(it.rate_with_tax) : '',
					specification: it.specification ?? '',
					remark: it.remark ?? '',
					schedule_date: it.schedule_date ?? '',
					material_request: it.material_request ?? null,
					material_request_item: null,
				})),
			);
			setSeeded(true);
		}
	}, [isEdit, detail, seeded]);

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

	async function appendItems(rows: { item_code: string; item_name: string; uom: string; sub_category: string | null; qty?: number; specification?: string | null; remark?: string | null; material_request?: string | null; material_request_item?: string | null }[]) {
		const fresh = rows.filter((r) => !lines.some((l) => l.item_code === r.item_code));
		const built: Line[] = fresh.map((r) => ({
			item_code: r.item_code,
			item_name: r.item_name,
			uom: r.uom,
			sub_category: r.sub_category,
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
		void appendItems([{ item_code: opt.value, item_name: opt.label, uom: opt.uom, sub_category: opt.sub_category }]);
	}

	async function pullFromMr(mrName: string) {
		if (!mrName) return;
		setErr('');
		try {
			const res = await fetchMrItems({ material_request: mrName });
			const msg = res?.message;
			if (!msg) return;
			if (msg.category) setCategory(msg.category);
			if (msg.project) setProject(msg.project);
			await appendItems(msg.items);
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
	// Round-off to whole rupees (mirrors ERPNext's rounded_total). Show the
	// adjustment as its own line; the payable Grand total is the rounded figure.
	const roundedGrand = Math.round(grand);
	const roundOff = round(roundedGrand - grand, 2);
	const overThreshold = grand > AMOUNT_THRESHOLD;
	const hasGst = gstTotal > 0;
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
		try {
			const payload = {
				name: id ?? null,
				supplier,
				project: project || null,
				category: category || null,
				tax_type: taxType || null,
				schedule_date: requiredBy || null,
				remark,
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
			// When editing an existing PO we stay on the same URL, so React Router
			// won't refetch — revalidate the detail so the new workflow state (e.g.
			// Draft -> Approved after "Place order") and its buttons update without a
			// manual refresh. A brand-new PO changes the route, which refetches.
			if (isEdit && res.message.name === id) {
				setSeeded(false);
				await detailRes.mutate();
			} else {
				navigate('/purchase-orders/' + res.message.name);
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
				</div>
				<div className="spacer" />
				{isEdit && detail && (
					<button className="btn" onClick={printPo} title="Open the purchase order print format in a new tab">
						<Icon name="file-text" size={15} /> Print
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
									hint="Pull an approved MR's items, project & category in one step — or build the order from scratch below. Optional."
								>
									<SearchSelect
										value={''}
										onChange={pullFromMr}
										placeholder={approvedMrs.length ? 'Pick an approved material request…' : 'No material requests pending order'}
										disabled={approvedMrs.length === 0}
										options={approvedMrs.map((m) => ({
											value: m.name,
											label: m.name,
											sub: [m.custom_category, m.custom_select_project_].filter(Boolean).join(' · '),
										}))}
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
							/>
						</Field>
						<Field label="Project" hint="Company, store & warehouse fill from the project.">
							<SearchSelect
								value={project}
								onChange={setProject}
								disabled={readOnly}
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
						<Field label="Category">
							<SelectInput
								value={category}
								onChange={(v) => {
									setCategory(v);
									setLines([]);
								}}
								disabled={readOnly}
								allowEmpty
								placeholder="Select category…"
								options={(ctx?.categories ?? []).map((c) => ({ value: c }))}
							/>
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
						<Field label="Required by">
							<input
								className="inp mono"
								type="date"
								value={requiredBy}
								disabled={readOnly}
								onChange={(e) => setRequiredBy(e.target.value)}
							/>
						</Field>
						<Field label="Store / warehouse">
							<input className="inp" disabled value={storeName || '—'} />
						</Field>
						<div className="span2">
							<Field label="Remark">
								<TextArea value={remark} onChange={setRemark} rows={2} disabled={readOnly} placeholder="Header note…" />
							</Field>
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
						<span className="r">Amount</span>
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
								<input className="inp mono" value={l.qty} disabled={readOnly} inputMode="decimal" onChange={(e) => setLineCalc(i, 'qty', e.target.value)} />
								<input className="inp" value={l.uom} disabled />
								<input className="inp mono" value={l.rate} disabled={readOnly} inputMode="decimal" placeholder="0.00" onChange={(e) => setLineCalc(i, 'rate', e.target.value)} />
								<input className="inp mono" value={isNoGst ? '' : l.gst} disabled={readOnly || isNoGst} inputMode="decimal" placeholder="0" onChange={(e) => setLineCalc(i, 'gst', e.target.value)} />
								<input className="inp mono" value={isNoGst ? l.rate : l.rwt} disabled={readOnly || isNoGst} inputMode="decimal" placeholder="0.00" onChange={(e) => setLineCalc(i, 'rwt', e.target.value)} />
								<span className="amt">{fmtMoney(num(l.qty) * num(l.rate), 'INR')}</span>
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
				</div>
			</div>
		</main>
	);
}
