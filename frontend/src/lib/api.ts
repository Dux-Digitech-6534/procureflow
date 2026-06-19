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
	pendingApprovals: 'procureflow.react_api.pending_approvals',
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

export interface ItemOption {
	value: string;
	label: string;
	uom: string;
	sub_category: string | null;
}

export interface MrListRow {
	name: string;
	custom_category: string | null;
	custom_select_project_: string | null;
	custom_priority: string | null;
	workflow_state: string | null;
	status: string | null;
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
	schedule_date: string | null;
	specification: string | null;
	remark: string | null;
	sub_category: string | null;
}

export interface MrDetail {
	name: string;
	category: string | null;
	project: string | null;
	department: string | null;
	priority: string | null;
	schedule_date: string | null;
	remark: string | null;
	workflow_state: string | null;
	docstatus: number;
	owner: string;
	attachment: string | null;
	items: MrLine[];
}

export interface SaveMrResult {
	name: string;
	workflow_state: string;
	docstatus: number;
}

/** Map a workflow_state to a DUX status-tag class. */
export function stateTag(state: string | null | undefined): 'ok' | 'pend' | 'err' {
	if (state === 'Approved') return 'ok';
	if (state === 'Rejected') return 'err';
	return 'pend';
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

export interface PoDetail {
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
	docstatus: number;
	attachment: string | null;
	net_total: number;
	total_taxes: number;
	grand_total: number;
	taxes: PoTaxRow[];
	items: PoLine[];
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
