import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
import {
	API,
	stateTag,
	type ApprovedMr,
	type ItemOption,
	type PoContext,
	type PoDetail,
	type PoSourceLine,
	type SavePoResult,
} from '../lib/api';
import { Field, SelectInput, SearchSelect, TextArea } from '../components/form';
import { Icon } from '../components/Icon';
import { fmtMoney, parseServerError } from '../lib/format';

const INTRA = 'Intra-State (CGST + SGST)';
const INTER = 'Inter-State (IGST)';

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
	const readOnly = !!detail && detail.docstatus !== 0;

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

	useEffect(() => {
		if (!isEdit && ctx && !requiredBy) setRequiredBy(ctx.today);
	}, [ctx, isEdit, requiredBy]);

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

	const net = lines.reduce((s, l) => s + num(l.qty) * num(l.rate), 0);
	const gstTotal = lines.reduce((s, l) => s + (num(l.qty) * num(l.rate) * num(l.gst)) / 100, 0);
	const grand = net + gstTotal;
	const hasGst = gstTotal > 0;
	const breakdown =
		taxType === INTER
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
			navigate('/purchase-orders/' + res.message.name);
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
					{detail?.workflow_state && (
						<div style={{ marginTop: 8 }}>
							<span className={'tag ' + stateTag(detail.workflow_state)}>{detail.workflow_state}</span>
						</div>
					)}
				</div>
				<div className="spacer" />
				{!readOnly && (
					<>
						<button className="btn" disabled={saving} onClick={() => save(false)}>
							Save draft
						</button>
						<button className="btn primary" disabled={saving} onClick={() => save(true)}>
							<Icon name="send" size={15} />
							{saving ? 'Saving…' : 'Send for approval'}
						</button>
					</>
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

			<div className="stack">
				<section className="card accent">
					<div className="chead">
						<Icon name="cube" size={16} />
						<span className="ttl">Order details</span>
					</div>
					<div className="formgrid">
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
								onChange={setTaxType}
								disabled={readOnly}
								allowEmpty
								placeholder="Select…"
								options={(ctx?.tax_types ?? [INTRA, INTER]).map((t) => ({ value: t }))}
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
						<div className="addwrap" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
							<div className="field">
								<span className="flabel">Get items from material request</span>
								<SearchSelect
									value={''}
									onChange={pullFromMr}
									placeholder={approvedMrs.length ? 'Pick an approved MR…' : 'No approved MRs yet'}
									disabled={approvedMrs.length === 0}
									options={approvedMrs.map((m) => ({
										value: m.name,
										label: m.name,
										sub: [m.custom_category, m.custom_select_project_].filter(Boolean).join(' · '),
									}))}
								/>
							</div>
							<div className="field">
								<span className="flabel">Or add an item by category</span>
								<SearchSelect
									value={''}
									onChange={addByCategory}
									disabled={!category}
									placeholder={category ? 'Search and add an item…' : 'Pick a category first'}
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
								<input className="inp mono" value={l.gst} disabled={readOnly} inputMode="decimal" placeholder="0" onChange={(e) => setLineCalc(i, 'gst', e.target.value)} />
								<input className="inp mono" value={l.rwt} disabled={readOnly} inputMode="decimal" placeholder="0.00" onChange={(e) => setLineCalc(i, 'rwt', e.target.value)} />
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

				<section className="card" style={{ maxWidth: 460, marginLeft: 'auto', width: '100%' }}>
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
						<div className="taxrow grand">
							<span className="k">Grand total</span>
							<span className="v">{fmtMoney(grand, 'INR')}</span>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
