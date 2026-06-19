import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
import { API, type PoReceiptItems, type ReceivablePo } from '../lib/api';
import { Field, SearchSelect } from '../components/form';
import { Icon } from '../components/Icon';
import { fmtMoney, parseServerError } from '../lib/format';

interface Line {
	po_item: string;
	item_code: string;
	item_name: string;
	uom: string;
	ordered: number;
	pending: number;
	qty: string;
}

export function NewReceipt() {
	const navigate = useNavigate();
	const posRes = useFrappeGetCall<{ message: ReceivablePo[] }>(API.receivablePos, {});
	const pos = posRes.data?.message ?? [];
	const [po, setPo] = useState('');
	const [lines, setLines] = useState<Line[]>([]);
	const [err, setErr] = useState('');

	const itemsRes = useFrappeGetCall<{ message: PoReceiptItems }>(
		API.poReceiptItems,
		{ purchase_order: po },
		po ? undefined : null,
	);
	const { call: createReceipt, loading: saving } = useFrappePostCall<{ message: { name: string } }>(API.createReceipt);

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
					qty: String(it.pending),
				})),
			);
		}
	}, [itemsRes.data]);

	const meta = useMemo(() => pos.find((p) => p.name === po), [pos, po]);

	function setQty(i: number, v: string) {
		setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, qty: v } : l)));
	}

	async function save() {
		setErr('');
		if (!po) return setErr('Pick a purchase order.');
		const items = lines
			.map((l) => ({ po_item: l.po_item, qty: Number(l.qty) || 0 }))
			.filter((l) => l.qty > 0);
		if (items.length === 0) return setErr('Enter a received quantity for at least one item.');
		if (lines.some((l) => Number(l.qty) > l.pending))
			return setErr('Received quantity cannot exceed the pending quantity.');
		try {
			const res = await createReceipt({ data: { purchase_order: po, items } });
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
				<button className="btn primary" disabled={saving || !po} onClick={() => void save()}>
					<Icon name="check" size={15} />
					{saving ? 'Receiving…' : 'Create receipt'}
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
						<Field label="Purchase order" required hint="Approved orders with quantity left to receive.">
							<SearchSelect
								value={po}
								onChange={setPo}
								placeholder={pos.length ? 'Select an approved PO…' : 'No receivable POs'}
								options={pos.map((p) => ({
									value: p.name,
									label: p.name,
									sub: [p.supplier_name ?? p.supplier, p.custom_project_name].filter(Boolean).join(' · '),
								}))}
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
								<span className="mono" style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>{l.ordered} {l.uom}</span>
								<span className="mono" style={{ fontSize: 12.5, color: 'var(--fg-2)' }}>{l.pending}</span>
								<input className="inp mono" value={l.qty} inputMode="decimal" onChange={(e) => setQty(i, e.target.value)} />
							</div>
						</div>
					))}
				</section>
			</div>
		</main>
	);
}
