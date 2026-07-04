import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
import { API, type ApprovedMr, type ItemOption, type MrItemsForPo, type PoContext, type SavePoResult, type UomOption } from '../lib/api';
import { Icon } from '../components/Icon';
import { SearchSelect } from '../components/form';
import { useToast } from '../components/Toast';
import { fmtMoney, parseServerError } from '../lib/format';
import { MHeader, useExitGuard, ConfirmSheet } from './MobileShell';
import { useLang } from './i18n';

interface Line {
	item_code: string;
	item_name: string;
	uom: string;
	uoms: UomOption[];
	qty: string;
	rate: string;
	gst: string;
	spec: string;
	remark: string;
	material_request: string | null;
	material_request_item: string | null;
}

const num = (s: string) => Number(s) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
const NO_GST = 'Unregistered / No GST';

/**
 * Mobile "create a Purchase Order from approved Material Requests": add one or
 * more approved MRs (all from the SAME project), their items pre-load with GST,
 * add extra items by category if needed, choose supplier + tax type + per-item
 * rate, pick a receiver, then save a draft or send for approval / place the order.
 * Gated at the entry point by caps.create_po; save_purchase_order re-checks perms.
 */
export function MNewPurchaseOrder() {
	const nav = useNavigate();
	const toast = useToast();
	const { t } = useLang();

	const ctxRes = useFrappeGetCall<{ message: PoContext }>(API.poContext, {});
	const ctx = ctxRes.data?.message;
	const mrsRes = useFrappeGetCall<{ message: ApprovedMr[] }>(API.approvedMrs, {});
	const mrs = mrsRes.data?.message ?? [];

	const { call: loadItems } = useFrappePostCall<{ message: MrItemsForPo }>(API.mrItemsForPo);
	const { call: savePo, loading: saving } = useFrappePostCall<{ message: SavePoResult }>(API.savePo);
	const { call: detectTax } = useFrappePostCall<{ message: string }>(API.partyTaxType);
	const { call: fetchGst } = useFrappePostCall<{ message: number }>(API.itemGstRate);

	const [srcMrs, setSrcMrs] = useState<string[]>([]);
	const [project, setProject] = useState('');
	const [category, setCategory] = useState('');
	const [supplier, setSupplier] = useState('');
	const [taxType, setTaxType] = useState('');
	const [receiver, setReceiver] = useState('');
	const [lines, setLines] = useState<Line[]>([]);
	const [busyMr, setBusyMr] = useState(false);
	const [err, setErr] = useState('');

	// Extra items are added from the PO's category (set by the first request added).
	const itemsRes = useFrappeGetCall<{ message: ItemOption[] }>(API.itemSearch, { category }, category ? undefined : null);
	const itemOptions = itemsRes.data?.message ?? [];

	const dirty = srcMrs.length > 0 || lines.length > 0 || !!supplier || !!project;
	const { confirming, setConfirming } = useExitGuard(dirty);

	// Standalone mode: with NO requests added, project & category are picked
	// directly (like the web form). Adding a request locks them to its values.
	function onProject(v: string) {
		setProject(v);
		// project drives company/warehouse & tax detection — reset dependent picks
		setSupplier('');
		setTaxType('');
		setReceiver('');
	}
	function onCategory(v: string) {
		setCategory(v);
		// the item picker is category-scoped — drop hand-added items of the old one
		setLines((ls) => ls.filter((l) => l.material_request));
	}

	async function addMr(name: string) {
		setErr('');
		if (!name || srcMrs.includes(name)) return;
		setBusyMr(true);
		try {
			const d = (await loadItems({ material_request: name })).message;
			if (project && d.project && d.project !== project) {
				setErr(t('npo.sameProject'));
				return;
			}
			if (!project) {
				setProject(d.project ?? '');
				setCategory(d.category ?? '');
				// First request fixes the project → reset any project-dependent picks.
				setSupplier('');
				setTaxType('');
				setReceiver('');
			} else if (!category && d.category) {
				setCategory(d.category);
			}
			setLines((ls) => [
				...ls,
				...(d.items ?? []).map((it) => ({
					item_code: it.item_code,
					item_name: it.item_name,
					uom: it.uom,
					uoms: it.uoms?.length ? it.uoms : [{ uom: it.uom, conversion_factor: 1 }],
					qty: String(it.qty ?? ''),
					rate: '',
					gst: it.gst_percent != null ? String(it.gst_percent) : '',
					spec: it.specification ?? '',
					remark: it.remark ?? '',
					material_request: it.material_request,
					material_request_item: it.material_request_item,
				})),
			]);
			setSrcMrs((s) => [...s, name]);
		} catch (e) {
			setErr(parseServerError(e));
		} finally {
			setBusyMr(false);
		}
	}

	function removeMr(name: string) {
		setSrcMrs((s) => s.filter((x) => x !== name));
		setLines((ls) => ls.filter((l) => l.material_request !== name));
	}

	async function addItem(code: string) {
		if (!code || lines.some((l) => l.item_code === code && !l.material_request)) return;
		const o = itemOptions.find((x) => x.value === code);
		if (!o) return;
		setLines((ls) => [
			...ls,
			{
				item_code: o.value,
				item_name: o.label,
				uom: o.uom,
				uoms: o.uoms ?? [{ uom: o.uom, conversion_factor: 1 }],
				qty: '1',
				rate: '',
				gst: '',
				spec: '',
				remark: '',
				material_request: null,
				material_request_item: null,
			},
		]);
		// Prefill the item's default GST (best-effort).
		try {
			const g = (await fetchGst({ item_code: code })).message;
			if (g != null) setLines((ls) => ls.map((l) => (l.item_code === code && !l.material_request ? { ...l, gst: String(g) } : l)));
		} catch {
			/* GST is user-editable — ignore a prefill failure */
		}
	}

	function onTaxType(v: string) {
		setTaxType(v);
		if (v === NO_GST) setLines((ls) => ls.map((l) => ({ ...l, gst: '0' })));
	}
	async function onPickSupplier(s: string) {
		setSupplier(s);
		if (!s) return setTaxType('');
		try {
			setTaxType((await detectTax({ supplier: s })).message || '');
		} catch {
			/* ignore */
		}
	}

	function setLine(i: number, patch: Partial<Line>) {
		setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
	}
	function bump(i: number, delta: number) {
		setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, qty: String(Math.max(0, (Number(l.qty) || 0) + delta)) } : l)));
	}
	function removeLine(i: number) {
		setLines((ls) => ls.filter((_, idx) => idx !== i));
	}

	const total = useMemo(() => lines.reduce((s, l) => s + num(l.qty) * num(l.rate) * (1 + num(l.gst) / 100), 0), [lines]);
	const hasGst = useMemo(() => lines.some((l) => num(l.gst) > 0), [lines]);

	async function save(strict: boolean) {
		setErr('');
		if (!project) return setErr(t('npo.errProject'));
		if (!supplier) return setErr(t('npo.errSupplier'));
		if (hasGst && !taxType) return setErr(t('npo.errTax'));
		if (lines.length === 0) return setErr(t('npo.errItems'));
		if (lines.some((l) => !l.qty || num(l.qty) <= 0)) return setErr(t('npo.errQty'));
		if (strict && lines.some((l) => !l.rate || num(l.rate) <= 0)) return setErr(t('npo.errRate'));
		if (strict && !receiver) return setErr(t('npo.errReceiver'));
		try {
			const res = await savePo({
				data: {
					name: null,
					supplier,
					project: project || null,
					category: category || null,
					transaction_date: ctx?.today ?? null,
					schedule_date: ctx?.today ?? null,
					terms: ctx?.default_terms ?? undefined,
					receiver: receiver || null,
					tax_type: taxType || null,
					submit_for_approval: strict,
					items: lines.map((l) => ({
						item_code: l.item_code,
						qty: num(l.qty),
						uom: l.uom,
						rate: num(l.rate),
						gst_percent: num(l.gst),
						rate_with_tax: round2(num(l.rate) * (1 + num(l.gst) / 100)),
						specification: l.spec,
						remark: l.remark,
						material_request: l.material_request,
						material_request_item: l.material_request_item,
					})),
				},
			});
			const st = res.message.workflow_state;
			toast.success(st === 'Pending' ? t('npo.sentForApproval') : res.message.docstatus === 1 ? t('npo.ordered') : t('npo.savedDraft'));
			nav('/m/orders');
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	// Approved requests not yet added, for the picker.
	const mrOptions = mrs
		.filter((m: ApprovedMr) => !srcMrs.includes(m.name) && (!project || m.custom_select_project_ === project))
		.map((m: ApprovedMr) => ({
			value: m.name,
			label: m.name,
			sub: [m.custom_select_project_, m.custom_category].filter(Boolean).join(' · '),
		}));

	return (
		<>
			<MHeader title={t('npo.title')} backTo="/m/orders" onBack={dirty ? () => setConfirming(true) : undefined} />
			<div className="body task">
				{err && (
					<div className="malert">
						<Icon name="warning" size={16} />
						<span>{err}</span>
					</div>
				)}

				<div className="mfield">
					<span className="mlabel">{t('npo.requests')}</span>
					<SearchSelect value="" onChange={addMr} placeholder={busyMr ? t('common.loading') : t('npo.addRequest')} options={mrOptions} />
					<span className="mhint">{srcMrs.length > 0 ? t('npo.sameProjectHint') : t('npo.standaloneHint')}</span>
					{srcMrs.length > 0 && (
						<div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
							{srcMrs.map((m) => (
								<span key={m} className="chip neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
									{m}
									<button type="button" onClick={() => removeMr(m)} aria-label="Remove" style={{ border: 0, background: 'none', color: 'inherit', display: 'inline-flex', padding: 0, cursor: 'pointer' }}>
										<Icon name="close" size={12} />
									</button>
								</span>
							))}
						</div>
					)}
				</div>

				<div className="mfield">
					<span className="mlabel">
						{t('npo.project')} <em>*</em>
					</span>
					<SearchSelect
						value={project}
						onChange={onProject}
						disabled={srcMrs.length > 0}
						placeholder={t('npo.projectPlaceholder')}
						options={(ctx?.projects ?? []).map((p) => ({
							value: p.name,
							label: p.project_name || p.name,
							sub: [p.company_name, p.store_name].filter(Boolean).join(' · '),
						}))}
					/>
					{srcMrs.length > 0 && <span className="mhint">{t('npo.lockedByMr')}</span>}
				</div>

				<div className="mfield">
					<span className="mlabel">
						{t('npo.category')} <em>*</em>
					</span>
					<SearchSelect
						value={category}
						onChange={onCategory}
						disabled={srcMrs.length > 0}
						placeholder={t('npo.categoryPlaceholder')}
						options={(ctx?.categories ?? []).map((c) => ({ value: c }))}
					/>
					{srcMrs.length > 0 && <span className="mhint">{t('npo.lockedByMr')}</span>}
				</div>

				<div className="mfield">
					<span className="mlabel">{t('npo.supplier')} <em>*</em></span>
							<SearchSelect value={supplier} onChange={onPickSupplier} placeholder={t('npo.supplierPlaceholder')}
								options={(ctx?.suppliers ?? []).map((s) => ({ value: s.name, label: s.supplier_name || s.name }))} />
						</div>

						<div className="mfield">
							<span className="mlabel">{t('npo.taxTypeLabel')} {hasGst ? <em>*</em> : null}</span>
							<SearchSelect value={taxType} onChange={onTaxType} placeholder={t('npo.taxTypePlaceholder')}
								options={(ctx?.tax_types ?? []).map((tt) => ({ value: tt }))} />
							<span className="mhint">{t('npo.taxTypeHint')}</span>
						</div>

						<div className="mfield">
							<span className="mlabel">{t('npo.receiver')}</span>
							<SearchSelect value={receiver} onChange={setReceiver} placeholder={t('npo.receiverPlaceholder')}
								options={(ctx?.receivers ?? []).map((r) => ({ value: r.user, label: r.full_name, sub: r.mobile_no || undefined }))} />
							<span className="mhint">{t('npo.receiverHint')}</span>
						</div>

						<div className="eyebrow2">{t('common.items')}{lines.length ? ` · ${lines.length}` : ''}</div>
						<div className="mcard">
							<div className="additem">
								<SearchSelect value="" onChange={addItem} disabled={!category}
									placeholder={category ? t('npo.addItem') : t('npo.pickCategoryFirst')}
									options={itemOptions.map((o) => ({ value: o.value, label: o.label, sub: o.sub_category ? `${o.sub_category} · ${o.uom}` : o.uom }))} />
							</div>
							{lines.length === 0 && <div className="mhint" style={{ padding: 12 }}>{t('npo.noItems')}</div>}
							{lines.map((l, i) => {
								const lineTotal = num(l.qty) * num(l.rate) * (1 + num(l.gst) / 100);
								return (
									<div className="item" key={i}>
										<div className="ih">
											<div className="inm">
												<div className="t1">{l.item_name}</div>
												<div className="t2">{l.material_request ? l.material_request : t('npo.extraItem')}</div>
											</div>
											<button className="rm" onClick={() => removeLine(i)} aria-label="Remove" type="button">
												<Icon name="close" size={15} />
											</button>
										</div>
										<div className="qrow">
											<div className="stepper">
												<button type="button" onClick={() => bump(i, -1)} aria-label="Decrease">−</button>
												<input value={l.qty} inputMode="decimal" onChange={(e) => setLine(i, { qty: e.target.value })} aria-label="Quantity" />
												<button type="button" onClick={() => bump(i, 1)} aria-label="Increase">+</button>
											</div>
											{l.uoms.length > 1 ? (
												<select className="uomsel" value={l.uom} onChange={(e) => setLine(i, { uom: e.target.value })} aria-label="Unit">
													{l.uoms.map((u) => <option key={u.uom} value={u.uom}>{u.uom}</option>)}
												</select>
											) : (
												<span className="uomtag">{l.uom}</span>
											)}
										</div>
										<div className="qrow">
											<label className="ratefld"><span>{t('npo.rate')}</span>
												<input value={l.rate} inputMode="decimal" placeholder="0" onChange={(e) => setLine(i, { rate: e.target.value })} aria-label="Rate" /></label>
											<label className="ratefld"><span>{t('npo.gst')} %</span>
												<input value={l.gst} inputMode="decimal" placeholder="0" onChange={(e) => setLine(i, { gst: e.target.value })} aria-label="GST %" /></label>
										</div>
										<div className="linetot"><span>{t('npo.lineTotal')}</span><b>{fmtMoney(round2(lineTotal), 'INR')}</b></div>
									</div>
								);
							})}
						</div>

						<div className="pototal"><span>{t('npo.total')}</span><b>{fmtMoney(round2(total), 'INR')}</b></div>
			</div>

			<div className="actionbar">
				<button className="draftlink" onClick={() => save(false)} disabled={saving}>{t('npo.saveDraft')}</button>
				<button className="mbtn grow" onClick={() => save(true)} disabled={saving}>
					<Icon name="check" size={18} /> {saving ? t('npo.submitting') : t('npo.submit')}
				</button>
			</div>

			{confirming && (
				<ConfirmSheet title={t('confirm.leaveTitle')} message={t('npo.leaveMsg')}
					onCancel={() => setConfirming(false)} onConfirm={() => nav('/m/orders', { replace: true })} />
			)}
		</>
	);
}
