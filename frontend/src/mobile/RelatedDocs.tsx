import { useFrappeGetCall } from 'frappe-react-sdk';
import {
	API,
	mrDisplayStatus,
	poDisplayStatus,
	payTone,
	type DocLinks,
	type LinkKind,
	type LinkedMr,
	type LinkedPo,
	type LinkedPr,
	type LinkedPayment,
} from '../lib/api';
import { fmtDate, fmtMoney } from '../lib/format';
import { Icon, type IconName } from '../components/Icon';
import { useLang, tStatus, tPay } from './i18n';

const KIND_ICON: Record<LinkKind, IconName> = {
	material_request: 'file-text',
	purchase_order: 'box',
	purchase_receipt: 'package',
	payment: 'banknote',
};

function Row({ kind, item }: { kind: LinkKind; item: LinkedMr | LinkedPo | LinkedPr | LinkedPayment }) {
	const { t } = useLang();
	let meta = '';
	let chip: { label: string; tone: string } | null = null;
	if (kind === 'material_request') {
		const m = item as LinkedMr;
		meta = m.project ?? '—';
		const s = mrDisplayStatus(m);
		chip = { label: tStatus(t, s.label), tone: s.tone };
	} else if (kind === 'purchase_order') {
		const p = item as LinkedPo;
		meta = (p.supplier_name ?? '—') + ' · ' + fmtMoney(p.grand_total, 'INR');
		const s = poDisplayStatus(p);
		chip = { label: tStatus(t, s.label), tone: s.tone };
	} else if (kind === 'purchase_receipt') {
		const r = item as LinkedPr;
		meta = fmtDate(r.posting_date);
		if (r.payment_status) chip = { label: tPay(t, r.payment_status), tone: payTone(r.payment_status) };
	} else {
		const pay = item as LinkedPayment;
		meta = fmtMoney(pay.amount, 'INR') + ' · ' + fmtDate(pay.payment_date);
	}
	return (
		<div className="reldoc">
			<span className="rd-ic">
				<Icon name={KIND_ICON[kind]} size={15} />
			</span>
			<span className="rd-tx">
				<span className="rd-id">{item.name}</span>
				<span className="rd-meta">{meta}</span>
			</span>
			{chip && <span className={'chip ' + chip.tone}>{chip.label}</span>}
		</div>
	);
}

/** Read-only "Related documents" panel for a detail sheet — the MR→PO→PR→Payment
 *  chain around `name`, grouped by type. Renders nothing if there are no links. */
export function RelatedDocs({ doctype, name }: { doctype: string; name: string }) {
	const { t } = useLang();
	const { data } = useFrappeGetCall<{ message: DocLinks }>(API.docLinks, { doctype, name });
	const groups = data?.message.groups ?? [];
	if (groups.length === 0) return null;
	const groupLabel = (g: DocLinks['groups'][number]): string => {
		switch (g.kind) {
			case 'material_request':
				return t('appr.materialRequests');
			case 'purchase_order':
				return t('appr.purchaseOrders');
			case 'purchase_receipt':
				return t('rec.title');
			case 'payment':
				return t('d.payments');
			default:
				return g.label;
		}
	};
	return (
		<>
			<div className="eyebrow2">{t('d.related')}</div>
			{groups.map((g) => (
				<div key={g.kind} className="reldoc-grp">
					<div className="rd-lbl">{groupLabel(g)}</div>
					{g.items.map((it) => (
						<Row key={it.name} kind={g.kind} item={it} />
					))}
				</div>
			))}
		</>
	);
}
