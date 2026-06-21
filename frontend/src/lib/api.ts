// Whitelisted procureflow.react_api method registry (single source of truth).
export const API = {
	mrContext: 'procureflow.react_api.mr_context',
	itemSearch: 'procureflow.react_api.item_search',
	saveMr: 'procureflow.react_api.save_material_request',
	mrList: 'procureflow.react_api.mr_list',
	mrDetail: 'procureflow.react_api.mr_detail',
	poContext: 'procureflow.react_api.po_context',
	partyTaxType: 'procureflow.react_api.party_tax_type',
	approvedMrs: 'procureflow.react_api.approved_material_requests',
	mrItemsForPo: 'procureflow.react_api.mr_items_for_po',
	savePo: 'procureflow.react_api.save_purchase_order',
	poList: 'procureflow.react_api.po_list',
	poDetail: 'procureflow.react_api.po_detail',
	itemGstRate: 'procureflow.purchase_tax.get_item_gst_rate',
	applyAction: 'procureflow.react_api.apply_action',
	cancelDoc: 'procureflow.react_api.cancel_doc',
	amendDoc: 'procureflow.react_api.amend_doc',
	pendingApprovals: 'procureflow.react_api.pending_approvals',
	receivablePos: 'procureflow.react_api.receivable_pos',
	poReceiptItems: 'procureflow.react_api.po_receipt_items',
	createReceipt: 'procureflow.react_api.create_receipt',
	prList: 'procureflow.react_api.pr_list',
	prDetail: 'procureflow.react_api.pr_detail',
	savePayment: 'procureflow.react_api.save_payment',
	paymentList: 'procureflow.react_api.payment_list',
	paymentDetail: 'procureflow.react_api.payment_detail',
	docLinks: 'procureflow.react_api.doc_links',
} as const;

export interface ProjectOption {
	name: string;
	project_name: string;
	store_name: string | null;
	company_name: string | null;
}

export interface MrContext {
	company: string;
	categories: string[];
	projects: ProjectOption[];
	priorities: string[];
	today: string;
}

export interface UomOption {
	uom: string;
	conversion_factor: number;
}

export interface ItemOption {
	value: string;
	label: string;
	uom: string;
	uoms: UomOption[];
	sub_category: string | null;
}

export interface MrListRow {
	name: string;
	custom_category: string | null;
	custom_select_project_: string | null;
	custom_priority: string | null;
	workflow_state: string | null;
	status: string | null;
	docstatus: number;
	transaction_date: string | null;
	schedule_date: string | null;
	owner: string;
	items: number;
	actions?: string[];
}

export interface MrLine {
	item_code: string;
	item_name: string;
	qty: number | string;
	uom: string;
	uoms: UomOption[];
	schedule_date: string | null;
	specification: string | null;
	remark: string | null;
	sub_category: string | null;
}

/** Live, permission-checked lifecycle actions returned by mr_detail / po_detail. */
export interface DocActionState {
	transitions: string[];
	can_cancel: boolean;
	can_amend: boolean;
}

export interface MrDetail extends DocActionState {
	name: string;
	category: string | null;
	project: string | null;
	department: string | null;
	priority: string | null;
	schedule_date: string | null;
	remark: string | null;
	workflow_state: string | null;
	status: string | null;
	docstatus: number;
	owner: string;
	attachment: string | null;
	items: MrLine[];
	can_create_po: boolean;
}

export interface SaveMrResult {
	name: string;
	workflow_state: string;
	docstatus: number;
}

export type Tone = 'ok' | 'pend' | 'err' | 'neutral';
export interface DisplayStatus {
	label: string;
	tone: Tone;
}

/**
 * Refined Purchase Order status. This system never raises invoices (no
 * Purchase Invoice → per_billed is always 0), so ERPNext's billing-based
 * states ("To Receive and Bill" / "To Bill") are meaningless here. We show the
 * approval phase from workflow_state, then once submitted derive purely from
 * how much has been RECEIVED.
 */
export function poDisplayStatus(r: {
	workflow_state?: string | null;
	status?: string | null;
	docstatus?: number;
	per_received?: number | null;
}): DisplayStatus {
	if (r.docstatus === 2 || r.status === 'Cancelled') return { label: 'Cancelled', tone: 'err' };
	if (r.status === 'On Hold') return { label: 'On Hold', tone: 'neutral' };
	if (r.status === 'Closed') return { label: 'Closed', tone: 'neutral' };
	if (r.docstatus === 1) {
		const pr = r.per_received ?? 0;
		if (pr >= 100) return { label: 'Received', tone: 'ok' };
		if (pr > 0) return { label: 'Partially received', tone: 'pend' };
		return { label: 'Ordered', tone: 'pend' };
	}
	if (r.workflow_state === 'Rejected') return { label: 'Rejected', tone: 'err' };
	if (r.workflow_state === 'Pending') return { label: 'Pending approval', tone: 'pend' };
	return { label: 'Draft', tone: 'neutral' };
}

/**
 * Refined Material Request status. The MR axis (per_ordered / per_received)
 * has nothing to do with billing, so we use ERPNext's status directly once
 * approved — only relabelling its "Pending" (= approved, nothing ordered yet)
 * to "Approved" so it doesn't clash with the approval-phase "Pending approval".
 */
export function mrDisplayStatus(r: {
	workflow_state?: string | null;
	status?: string | null;
	docstatus?: number;
}): DisplayStatus {
	if (r.docstatus === 2 || r.status === 'Cancelled') return { label: 'Cancelled', tone: 'err' };
	if (r.status === 'Stopped') return { label: 'Stopped', tone: 'neutral' };
	if (r.docstatus === 1) {
		switch (r.status) {
			case 'Received':
				return { label: 'Received', tone: 'ok' };
			case 'Partially Received':
				return { label: 'Partially received', tone: 'pend' };
			case 'Ordered':
				return { label: 'Ordered', tone: 'pend' };
			case 'Partially Ordered':
				return { label: 'Partially ordered', tone: 'pend' };
			default: // "Pending" = approved, nothing ordered yet
				return { label: 'Approved', tone: 'ok' };
		}
	}
	if (r.workflow_state === 'Rejected') return { label: 'Rejected', tone: 'err' };
	if (r.workflow_state === 'Draft') return { label: 'Draft', tone: 'neutral' };
	return { label: 'Pending approval', tone: 'pend' };
}

/* ------------------------------- Purchase Order ----------------------------- */

export interface SupplierOption {
	name: string;
	supplier_name: string;
}

export interface PoContext {
	company: string;
	suppliers: SupplierOption[];
	categories: string[];
	projects: ProjectOption[];
	tax_types: string[];
	today: string;
}

export interface ApprovedMr {
	name: string;
	custom_category: string | null;
	custom_select_project_: string | null;
	transaction_date: string | null;
	schedule_date: string | null;
}

export interface PoSourceLine {
	item_code: string;
	item_name: string;
	uom: string;
	uoms: UomOption[];
	qty: number;
	specification: string | null;
	remark: string | null;
	material_request: string | null;
	material_request_item: string | null;
	sub_category: string | null;
}

export interface PoListRow {
	name: string;
	supplier: string;
	supplier_name: string | null;
	custom_category: string | null;
	custom_project_name: string | null;
	workflow_state: string | null;
	status: string | null;
	docstatus: number;
	per_received: number | null;
	grand_total: number | null;
	transaction_date: string | null;
	schedule_date: string | null;
	items: number;
	actions?: string[];
}

export interface PoLine {
	item_code: string;
	item_name: string;
	qty: number;
	uom: string;
	uoms: UomOption[];
	rate: number;
	gst_percent: number | null;
	rate_with_tax: number | null;
	amount: number;
	specification: string | null;
	remark: string | null;
	schedule_date: string | null;
	material_request: string | null;
	sub_category: string | null;
}

export interface PoTaxRow {
	description: string;
	amount: number;
}

export interface PoDetail extends DocActionState {
	name: string;
	supplier: string;
	supplier_name: string | null;
	category: string | null;
	project: string | null;
	company: string | null;
	tax_type: string | null;
	remark: string | null;
	schedule_date: string | null;
	workflow_state: string | null;
	status: string | null;
	per_received: number | null;
	docstatus: number;
	attachment: string | null;
	net_total: number;
	total_taxes: number;
	grand_total: number;
	rounding_adjustment: number | null;
	rounded_total: number | null;
	taxes: PoTaxRow[];
	items: PoLine[];
	print_format: string | null;
}

export interface SavePoResult {
	name: string;
	workflow_state: string;
	docstatus: number;
}

/* --------------------------------- Approvals -------------------------------- */

export interface PendingMr {
	name: string;
	custom_category: string | null;
	custom_select_project_: string | null;
	custom_priority: string | null;
	transaction_date: string | null;
	owner: string;
	actions: string[];
}

export interface PendingPo {
	name: string;
	supplier: string;
	supplier_name: string | null;
	custom_category: string | null;
	custom_project_name: string | null;
	grand_total: number | null;
	transaction_date: string | null;
	owner: string;
	actions: string[];
}

export interface PendingApprovals {
	material_requests: PendingMr[];
	purchase_orders: PendingPo[];
}

/** Tone for an action button. */
export function actionTone(action: string): 'primary' | 'danger' | 'default' {
	if (/reject/i.test(action)) return 'danger';
	if (/approve|place order/i.test(action)) return 'primary';
	return 'default';
}

/* --------------------------- Receipts & Payments ---------------------------- */

export interface ReceivablePo {
	name: string;
	supplier: string;
	supplier_name: string | null;
	custom_project_name: string | null;
	grand_total: number | null;
	transaction_date: string | null;
}

export interface PoReceiptItem {
	po_item: string;
	item_code: string;
	item_name: string;
	uom: string;
	ordered: number;
	received: number;
	pending: number;
}

export interface PoReceiptItems {
	supplier: string;
	supplier_name: string | null;
	project: string | null;
	items: PoReceiptItem[];
}

export interface PrListRow {
	name: string;
	supplier: string;
	supplier_name: string | null;
	custom_project_name: string | null;
	grand_total: number | null;
	posting_date: string | null;
	custom_payment_status: string | null;
	total: number;
	paid: number;
	outstanding: number;
}

export interface PaymentDefaults {
	purchase_receipt: string;
	supplier: string;
	project: string | null;
	company: string | null;
	previous_paid_amount: number;
	outstanding_amount: number;
	amount: number;
	payment_date: string;
}

export interface PaymentListRow {
	name: string;
	purchase_receipt: string;
	supplier: string;
	project: string | null;
	amount: number;
	payment_date: string | null;
}

export interface PrDetailItem {
	item_code: string;
	item_name: string;
	qty: number;
	uom: string;
	rate: number;
	amount: number;
}

export interface PrDetail {
	name: string;
	supplier: string;
	supplier_name: string | null;
	project: string | null;
	posting_date: string | null;
	grand_total: number | null;
	payment_status: string | null;
	total: number;
	paid: number;
	outstanding: number;
	items: PrDetailItem[];
}

export interface PaymentDetail {
	name: string;
	supplier: string;
	project: string | null;
	company: string | null;
	purchase_receipt: string;
	previous_paid_amount: number | null;
	outstanding_amount: number | null;
	amount: number;
	payment_date: string | null;
	remark: string | null;
	docstatus: number;
}

/* ----------------------------- Linked documents ---------------------------- */

export interface LinkedMr {
	name: string;
	project: string | null;
	workflow_state: string | null;
	status: string | null;
	docstatus: number;
}
export interface LinkedPo {
	name: string;
	supplier_name: string | null;
	grand_total: number | null;
	workflow_state: string | null;
	status: string | null;
	docstatus: number;
	per_received: number | null;
}
export interface LinkedPr {
	name: string;
	supplier_name: string | null;
	posting_date: string | null;
	payment_status: string | null;
}
export interface LinkedPayment {
	name: string;
	amount: number | null;
	payment_date: string | null;
	supplier: string | null;
}

export type LinkKind = 'material_request' | 'purchase_order' | 'purchase_receipt' | 'payment';

export interface DocLinkGroup {
	kind: LinkKind;
	label: string;
	route: string;
	items: (LinkedMr | LinkedPo | LinkedPr | LinkedPayment)[];
}

export interface DocLinks {
	groups: DocLinkGroup[];
}

/** Tone for a payment status. */
export function payTone(status: string | null | undefined): 'ok' | 'pend' | 'err' {
	if (status === 'Fully Paid') return 'ok';
	if (status === 'Partially Paid') return 'pend';
	return 'err';
}
