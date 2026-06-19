import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import {
	API,
	mrDisplayStatus,
	poDisplayStatus,
	payTone,
	type DocLinks,
	type LinkedMr,
	type LinkedPo,
	type LinkedPr,
	type LinkedPayment,
} from '../lib/api';
import { fmtDate, fmtMoney } from '../lib/format';
import { Icon, type IconName } from './Icon';
import { LRow } from './ui';

const KIND_ICON: Record<string, IconName> = {
	material_request: 'file-text',
	purchase_order: 'cube',
	purchase_receipt: 'package',
	payment: 'banknote',
};

/**
 * "Linked documents" panel for the MR / PO / Receipt / Payment detail pages.
 * Shows the doc's direct neighbours across the MR→PO→Receipt→Payment chain
 * (from procureflow.react_api.doc_links) grouped by type, each row navigable.
 */
export function LinkedDocs({ doctype, name }: { doctype: string; name: string }) {
	const navigate = useNavigate();
	const { data, isLoading, error } = useFrappeGetCall<{ message: DocLinks }>(API.docLinks, { doctype, name });
	const groups = data?.message?.groups ?? [];
	const total = groups.reduce((s, g) => s + g.items.length, 0);

	function row(kind: string, route: string, it: LinkedMr | LinkedPo | LinkedPr | LinkedPayment) {
		const go = () => navigate('/' + route + '/' + it.name);
		if (kind === 'material_request') {
			const m = it as LinkedMr;
			const s = mrDisplayStatus(m);
			return <LRow key={m.name} icon="file-text" t1={m.name} t2={m.project ?? '—'} right={<span className={'tag ' + s.tone}>{s.label}</span>} onClick={go} />;
		}
		if (kind === 'purchase_order') {
			const p = it as LinkedPo;
			const s = poDisplayStatus(p);
			return <LRow key={p.name} icon="cube" t1={p.name} t2={[p.supplier_name, fmtMoney(p.grand_total, 'INR')].filter(Boolean).join(' · ')} right={<span className={'tag ' + s.tone}>{s.label}</span>} onClick={go} />;
		}
		if (kind === 'purchase_receipt') {
			const r = it as LinkedPr;
			return <LRow key={r.name} icon="package" t1={r.name} t2={[r.supplier_name, fmtDate(r.posting_date)].filter(Boolean).join(' · ')} right={<span className={'tag ' + payTone(r.payment_status)}>{r.payment_status ?? 'Not Paid'}</span>} onClick={go} />;
		}
		const pay = it as LinkedPayment;
		return <LRow key={pay.name} icon="banknote" t1={pay.name} t2={fmtDate(pay.payment_date)} right={<span className="num">{fmtMoney(pay.amount, 'INR')}</span>} onClick={go} />;
	}

	return (
		<section className="card">
			<div className="chead">
				<Icon name="link-boxes" size={16} />
				<span className="ttl">Linked documents</span>
				<span className="cnt">{total}</span>
			</div>
			{isLoading && <div className="empty" style={{ padding: '22px 18px' }}><div className="t2">Loading…</div></div>}
			{error && <div className="empty" style={{ padding: '22px 18px' }}><div className="t2" style={{ color: 'var(--err)' }}>Could not load links.</div></div>}
			{!isLoading && !error && total === 0 && (
				<div className="empty" style={{ padding: '22px 18px' }}><div className="t2">Nothing linked yet.</div></div>
			)}
			{groups.map((g) => (
				<div key={g.kind}>
					<div className="lgroup-h">
						<Icon name={KIND_ICON[g.kind]} size={12} />
						{g.label}
						<span className="lgroup-n">{g.items.length}</span>
					</div>
					{g.items.map((it) => row(g.kind, g.route, it))}
				</div>
			))}
		</section>
	);
}
