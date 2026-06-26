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
	getPoTerms: 'procureflow.react_api.get_po_terms',
	savePoTerms: 'procureflow.react_api.save_po_terms',
	itemGstRate: 'procureflow.purchase_tax.get_item_gst_rate',
	applyAction: 'procureflow.react_api.apply_action',
	cancelDoc: 'procureflow.react_api.cancel_doc',
	amendDoc: 'procureflow.react_api.amend_doc',
	setPoStatus: 'procureflow.react_api.set_po_status',
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
	settingsCanCreate: 'procureflow.react_api.settings_can_create',
	renameMaster: 'procureflow.react_api.rename_master',
	updateMaster: 'procureflow.react_api.update_master',
	createMaster: 'procureflow.react_api.create_master',
	saveItem: 'procureflow.react_api.save_item',
	assignableRoles: 'procureflow.react_api.assignable_roles',
	usersList: 'procureflow.react_api.users_list',
	createUser: 'procureflow.react_api.create_user',
	updateUser: 'procureflow.react_api.update_user',
	resetUserPassword: 'procureflow.react_api.reset_user_password',
	userInfo: 'procureflow.react_api.user_info',
	capabilities: 'procureflow.react_api.capabilities',
	notifications: 'procureflow.react_api.notifications',
	markNotificationsRead: 'procureflow.react_api.mark_notifications_read',
	stockBalances: 'procureflow.react_api.stock_balances',
	dashboardData: 'procureflow.dashboard_api.get_procurement_dashboard_data',
	paymentDashboard: 'procureflow.dashboard_api.get_payment_tracking_dashboard_data',
	poRegister: 'procureflow.react_api.po_register',
	paymentWorklist: 'procureflow.react_api.payment_worklist',
	reportData: 'procureflow.react_api.report_data',
	exportReportXlsx: 'procureflow.react_api.export_report_xlsx',
	exportReportPdf: 'procureflow.react_api.export_report_pdf',
	reportItems: 'procureflow.react_api.report_items',
	itemPriceTrend: 'procureflow.dashboard_api.item_price_trend',
	supplierAnalytics: 'procureflow.dashboard_api.supplier_analytics',
	projectPortfolio: 'procureflow.dashboard_api.project_portfolio',
} as const;

export interface SupplierAnalytics {
	active_suppliers: number;
	total_spend: number;
	top_share: { supplier: string; pct: number };
	total_outstanding: number;
	spend: NameValue[];
	pareto: { supplier: string; spend: number; cumulative_pct: number }[];
	outstanding: NameValue[];
	scorecard: { supplier: string; spend: number; lead_time: number | null; fill_rate: number | null; outstanding: number }[];
}
export interface ProjectPortfolio {
	projects: { project: string; committed: number; received: number; paid: number; outstanding: number; receipts: number }[];
	totals: { committed: number; received: number; paid: number; outstanding: number };
}

export interface ReportResult {
	rows: Record<string, unknown>[];
	total: number;
	start: number;
	limit: number;
}

// ---- Dashboard payload types (subset actually rendered) ----
export interface NameValue {
	label: string;
	value: number;
	total?: number;
}
export interface StatusCounts {
	total: number;
	approved?: number;
	pending?: number;
	rejected?: number;
	completed?: number;
	partial?: number;
}
export interface DashboardData {
	filters: {
		company: string;
		project: string;
		from_date: string;
		to_date: string;
		scope?: { see_all: boolean; projects: string[] | null; companies: string[] | null };
	};
	filter_options: { companies: string[]; projects: string[] };
	kpis: {
		material_requests: StatusCounts;
		purchase_orders: StatusCounts;
		purchase_receipts: StatusCounts;
		total_po_value: { total: number };
		outstanding_amount: { total: number; overdue: number; pending: number; partial: number };
	};
	commitments: { value: number; count: number };
	overview: {
		monthly_po_value: { label: string; month: string; value: number; percent: number; is_current: boolean }[];
		mom_growth: number;
		avg_monthly: number;
		period_total: number;
	};
	operations: {
		material_requests: { name: string; status: string; project?: string; priority?: string }[];
		purchase_orders: { name: string; status: string; supplier?: string; value?: number }[];
		purchase_receipts: { name: string; status: string; supplier?: string; project?: string }[];
		top_suppliers: { supplier: string; total: number; percent: number }[];
	};
	outstanding_breakdown: {
		total_outstanding: number;
		over_30_days_outstanding: number;
		pending_outstanding: number;
		partial_outstanding: number;
		top_supplier: string;
		top_project: string;
	};
	analytics: {
		mr_to_po_conversion: { value: number; converted: number; material_requests: number };
		total_period_spend: { value: number };
		top_supplier_share: { value: number; supplier: string; total: number };
		project_wise: NameValue[];
		company_wise: NameValue[];
		category_wise: NameValue[];
		supplier_wise: NameValue[];
		priority_wise: NameValue[];
	};
}
export interface PaymentDashboard {
	kpis: {
		total_receipt_amount: number;
		total_paid_amount: number;
		total_outstanding_amount: number;
		paid_percent: number;
		overdue_receipts: number;
		pending_receipts: number;
		partial_receipts: number;
		paid_receipts: number;
		avg_payment_days: number;
		receipt_count: number;
	};
	status_summary: Record<string, { count: number; total_amount: number; paid_amount: number; outstanding_amount: number }>;
	outstanding_by_supplier: { label: string; receipt_count: number; total_amount: number; paid_amount: number; outstanding_amount: number }[];
	outstanding_by_project: { label: string; receipt_count: number; total_amount: number; paid_amount: number; outstanding_amount: number }[];
	ageing: { bucket: string; outstanding: number; count: number }[];
	ledger_rows: {
		purchase_receipt: string;
		supplier: string;
		project: string;
		total_amount: number;
		paid_amount: number;
		outstanding_amount: number;
		payment_status: string;
		receipt_date: string;
		progress_percent: number;
	}[];
}

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

export interface ReceiverOption {
	user: string;
	full_name: string;
	mobile_no: string;
}

export interface PoContext {
	company: string;
	suppliers: SupplierOption[];
	categories: string[];
	projects: ProjectOption[];
	tax_types: string[];
	today: string;
	default_terms: string;
	receivers: ReceiverOption[];
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
	material_request_item: string | null;
	sub_category: string | null;
	category: string | null;
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
	terms: string | null;
	receiver: string | null;
	receiver_name: string | null;
	receiver_mobile: string | null;
	requesters: string[];
	supplier_mobile: string | null;
	pdf_url: string | null;
	transaction_date: string | null;
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
	material_requests: string[];
	can_close: boolean;
	can_reopen: boolean;
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
	per_received: number | null;
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
	docstatus: number;
	total: number;
	paid: number;
	outstanding: number;
	material_image: string | null;
	invoice_image: string | null;
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

/* ------------------- Mobile: profile / notifications / stock ------------------- */

export interface UserInfo {
	user: string;
	full_name: string;
	email: string;
	user_image: string | null;
	company: string | null;
	roles: string[];
}

/** Per-user capability flags that gate which mobile screens/actions are shown. */
export interface Capabilities {
	create_mr: boolean;
	receive: boolean;
	read_po: boolean;
	read_pr: boolean;
	read_stock: boolean;
	approve: boolean;
	reports: boolean;
	manage_users: boolean;
	email_configured: boolean;
}

export interface AssignableRole {
	role: string;
	label: string;
	description: string;
}

export interface ManagedUser {
	name: string;
	full_name: string | null;
	email: string | null;
	mobile_no: string | null;
	enabled: number;
	roles: string[];
	is_admin: boolean;
}

export interface NotificationItem {
	name: string;
	subject: string;
	type: string | null;
	document_type: string | null;
	document_name: string | null;
	read: number;
	creation: string;
}

export interface NotificationsResult {
	items: NotificationItem[];
	unread: number;
}

export interface StockRow {
	item_code: string;
	item_name: string;
	warehouse: string;
	actual_qty: number;
	stock_uom: string | null;
}
