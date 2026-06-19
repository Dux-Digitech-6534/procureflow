// Whitelisted procureflow.react_api method registry (single source of truth).
export const API = {
	mrContext: 'procureflow.react_api.mr_context',
	itemSearch: 'procureflow.react_api.item_search',
	saveMr: 'procureflow.react_api.save_material_request',
	mrList: 'procureflow.react_api.mr_list',
	mrDetail: 'procureflow.react_api.mr_detail',
} as const;

export interface ProjectOption {
	name: string;
	project_name: string;
	store_name: string | null;
}

export interface MrContext {
	company: string;
	categories: string[];
	projects: ProjectOption[];
	departments: string[];
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
}

export interface MrLine {
	item_code: string;
	item_name: string;
	qty: number | string;
	uom: string;
	schedule_date: string | null;
	specification: string | null;
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
