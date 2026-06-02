frappe.provide("procureflow.payment_dashboard");

frappe.pages["payment-tracking-dashboard"].on_page_load = function (wrapper) {
	procureflow.payment_dashboard.load_assets();
	new procureflow.payment_dashboard.PaymentTrackingDashboard(wrapper);
};

procureflow.payment_dashboard.load_assets = function () {
	if (!document.getElementById("procureflow-tabler-icons")) {
		const link = document.createElement("link");
		link.id = "procureflow-tabler-icons";
		link.rel = "stylesheet";
		link.href = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css";
		link.onerror = () => document.documentElement.classList.add("ptd-icons-fallback");
		document.head.appendChild(link);
	}

	if (!document.getElementById("procureflow-dashboard-font")) {
		const link = document.createElement("link");
		link.id = "procureflow-dashboard-font";
		link.rel = "stylesheet";
		link.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap";
		document.head.appendChild(link);
	}
};

procureflow.payment_dashboard.PaymentTrackingDashboard = class PaymentTrackingDashboard {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Payment Tracking Dashboard"),
			single_column: true,
		});
		$(this.wrapper).addClass("ptd-page");
		$(this.wrapper).find(".page-head").hide();

		const range = this.current_month_range();
		this.state = {
			company: "",
			project: "",
			supplier: "",
			status: "",
			search: "",
			from_date: range.from_date,
			to_date: range.to_date,
		};

		this.data = null;
		this.search_timer = null;
		this.make();
		this.bind_events();
		this.refresh();
	}

	current_month_range() {
		const today = new Date();
		return {
			from_date: this.input_date(new Date(today.getFullYear(), today.getMonth() - 5, 1)),
			to_date: this.input_date(today),
		};
	}

	input_date(date) {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	}

	make() {
		$(this.page.main).empty().append(`
			<div class="ptd-dashboard">
				<header class="ptd-topbar">
					<div class="ptd-title-wrap">
						<div class="ptd-title">Payment Tracking</div>
						<div class="ptd-subtitle" data-role="subtitle">Purchase receipt payment ledger</div>
					</div>
					<div class="ptd-filter-row">
						<label class="ptd-filter">
							<i class="ti ti-building-community"></i>
							<select data-filter="company"><option value="">All Companies</option></select>
						</label>
						<label class="ptd-filter">
							<i class="ti ti-map-pin"></i>
							<select data-filter="project"><option value="">All Projects</option></select>
						</label>
						<label class="ptd-filter">
							<i class="ti ti-users"></i>
							<select data-filter="supplier"><option value="">All Suppliers</option></select>
						</label>
						<label class="ptd-filter ptd-filter-status">
							<i class="ti ti-progress-check"></i>
							<select data-filter="status"><option value="">All Statuses</option></select>
						</label>
						<label class="ptd-filter ptd-date-filter">
							<i class="ti ti-calendar-event"></i>
							<span>From</span>
							<input type="date" data-filter="from_date" value="${this.state.from_date}">
						</label>
						<label class="ptd-filter ptd-date-filter">
							<i class="ti ti-calendar-due"></i>
							<span>To</span>
							<input type="date" data-filter="to_date" value="${this.state.to_date}">
						</label>
						<button class="ptd-refresh" data-action="refresh" title="${__("Refresh")}"><i class="ti ti-refresh"></i></button>
					</div>
				</header>
				<section class="ptd-content">
					<div class="ptd-loading" data-role="loading">
						<div class="ptd-spinner"></div>
						<div>${__("Loading payment dashboard")}</div>
					</div>
					<div class="ptd-kpi-grid" data-role="kpis"></div>
					${this.section_header("Procureflow Payment Entries")}
					<div class="ptd-ledger-shell">
						<div class="ptd-ledger-toolbar">
							<label class="ptd-search">
								<i class="ti ti-search"></i>
								<input type="search" data-filter="search" placeholder="Search receipt, supplier, project..." autocomplete="off">
							</label>
							<label class="ptd-inline-filter">
								<select data-filter="supplier"><option value="">All Suppliers</option></select>
							</label>
							<label class="ptd-inline-filter">
								<select data-filter="project"><option value="">All Projects</option></select>
							</label>
							<div class="ptd-status-chips" data-role="status-chips"></div>
						</div>
						<div data-role="ledger"></div>
					</div>
				</section>
			</div>
		`);
	}

	section_header(title) {
		return `<div class="ptd-section-header"><span>${frappe.utils.escape_html(title)}</span><div></div></div>`;
	}

	bind_events() {
		const root = $(this.page.main);
		root.on("click", "[data-action='refresh']", () => this.refresh());
		root.on("change", "select[data-filter], input[type='date'][data-filter]", (event) => {
			const field = $(event.currentTarget).data("filter");
			this.state[field] = $(event.currentTarget).val() || "";
			if (this.state.from_date && this.state.to_date && this.state.from_date > this.state.to_date) {
				const other = field === "from_date" ? "to_date" : "from_date";
				this.state[other] = this.state[field];
			}
			this.refresh();
		});
		root.on("input", "input[type='search'][data-filter='search']", (event) => {
			this.state.search = $(event.currentTarget).val() || "";
			window.clearTimeout(this.search_timer);
			this.search_timer = window.setTimeout(() => this.refresh(), 300);
		});
		root.on("click", "[data-status-chip]", (event) => {
			this.state.status = $(event.currentTarget).data("status-chip") || "";
			this.refresh();
		});
		root.on("click", ".ptd-clickable-row, .ptd-receipt-card", (event) => {
			this.open_doc("Purchase Receipt", $(event.currentTarget).data("receipt"));
		});
		root.on("click", "[data-open-doctype]", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.open_doc($(event.currentTarget).data("open-doctype"), $(event.currentTarget).data("name"));
		});
	}

	refresh() {
		this.set_loading(true);
		frappe.call({
			method: "procureflow.dashboard_api.get_payment_tracking_dashboard_data",
			args: {
				company: this.state.company,
				project: this.state.project,
				supplier: this.state.supplier,
				status: this.state.status,
				from_date: this.state.from_date,
				to_date: this.state.to_date,
				search: this.state.search,
				limit: 50,
			},
			callback: (r) => {
				this.data = r.message || {};
				this.render();
			},
			error: () => {
				frappe.msgprint(__("Could not load payment dashboard data. Please check Error Log for details."));
			},
			always: () => this.set_loading(false),
		});
	}

	set_loading(show) {
		$(this.page.main).find("[data-role='loading']").toggleClass("visible", Boolean(show));
		$(this.page.main).find("[data-action='refresh'] i").toggleClass("ti-spin", Boolean(show));
	}

	render() {
		this.render_filters();
		this.render_subtitle();
		this.render_kpis();
		this.render_status_chips();
		this.render_ledger();
	}

	render_filters() {
		const options = this.data.filter_options || {};
		this.fill_select("company", options.companies || [], "All Companies", this.state.company);
		this.fill_select("project", options.projects || [], "All Projects", this.state.project);
		this.fill_select("supplier", options.suppliers || [], "All Suppliers", this.state.supplier);
		this.fill_select("status", options.statuses || options.payment_statuses || [], "All Statuses", this.state.status);

		const filters = this.data.filters || {};
		this.state.from_date = filters.from_date || this.state.from_date;
		this.state.to_date = filters.to_date || this.state.to_date;
		this.state.status = filters.status || filters.payment_status || this.state.status;
		$(this.page.main).find("[data-filter='from_date']").val(this.state.from_date);
		$(this.page.main).find("[data-filter='to_date']").val(this.state.to_date);
		$(this.page.main).find("[data-filter='search']").val(this.state.search);
	}

	fill_select(field, values, empty_label, selected) {
		const current = selected || "";
		$(this.page.main).find(`select[data-filter='${field}']`).each((_, element) => {
			const select = $(element);
			select.html(`<option value="">${frappe.utils.escape_html(empty_label)}</option>`);
			values.forEach((value) => {
				const safe = frappe.utils.escape_html(value);
				select.append(`<option value="${safe}" ${value === current ? "selected" : ""}>${safe}</option>`);
			});
		});
	}

	render_subtitle() {
		const filters = this.data.filters || {};
		const parts = [
			filters.company || "All Companies",
			filters.project || "All Projects",
			filters.supplier || "All Suppliers",
			this.format_date(filters.from_date || this.state.from_date),
			this.format_date(filters.to_date || this.state.to_date),
		];
		$(this.page.main).find("[data-role='subtitle']").text(parts.join(" / "));
	}

	render_kpis() {
		const kpis = this.data.kpis || {};
		const paid_summary = `${this.number(kpis.paid_receipts)} fully paid / ${this.number(kpis.partial_receipts)} partial`;
		const cards = [
			["Total Receipt Amount", this.money(kpis.total_receipt_amount), "receipt-2", "blue", `${this.number(kpis.receipt_count)} purchase receipts in selected range`],
			["Total Paid Amount", this.money(kpis.total_paid_amount), "cash", "green", `${paid_summary} - ${this.number(kpis.paid_percent, 1)}% paid`],
			["Total Outstanding Amount", this.money(kpis.total_outstanding_amount), "alert-circle", "amber", "Pending + partial outstanding"],
			["Overdue > 30 Days", this.money((this.data.status_summary || {}).Overdue?.outstanding_amount), "alert-triangle", "red", `${this.number(kpis.overdue_receipts)} receipts older than 30 days`],
			["Avg Payment Days", this.number(kpis.avg_payment_days, 1), "calendar-check", "teal", "Average receipt date to latest payment date"],
		];
		$(this.page.main).find("[data-role='kpis']").html(cards.map((card) => this.kpi_card(...card)).join(""));
	}

	kpi_card(label, value, icon, tone, helper) {
		return `
			<div class="ptd-kpi-card ${tone}">
				<div class="ptd-kpi-top">
					<span>${frappe.utils.escape_html(label)}</span>
					<div class="ptd-kpi-icon"><i class="ti ti-${icon}"></i></div>
				</div>
				<div class="ptd-kpi-value">${frappe.utils.escape_html(String(value || 0))}</div>
				<div class="ptd-kpi-helper">${frappe.utils.escape_html(helper || "")}</div>
			</div>
		`;
	}

	render_status_chips() {
		const statuses = ["", "Paid", "Partial", "Pending", "Overdue"];
		$(this.page.main).find("[data-role='status-chips']").html(statuses.map((status) => {
			const active = (this.state.status || "") === status;
			return `<button class="ptd-chip ${active ? "active" : ""} ${this.status_tone(status)}" data-status-chip="${this.escape_attr(status)}">${frappe.utils.escape_html(status || "All")}</button>`;
		}).join(""));
	}

	render_ledger() {
		const rows = this.data.ledger_rows || [];
		$(this.page.main).find("[data-role='ledger']").html(`
			<div class="ptd-card ptd-table-card ptd-wide-card">
				<div class="ptd-card-header">
					<div class="ptd-card-title"><i class="ti ti-receipt"></i>Payment Entry Ledger</div>
					<span class="ptd-muted">${this.number(rows.length)} shown</span>
				</div>
				<table class="ptd-table ptd-ledger-table">
					<thead>
						<tr>
							<th>Receipt No.</th>
							<th>Supplier</th>
							<th>Project</th>
							<th>Total Amount</th>
							<th>Previous Paid</th>
							<th>Paid Amount</th>
							<th>Outstanding</th>
							<th>Payment Date</th>
							<th>Progress</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						${rows.length ? rows.map((row) => this.ledger_row(row)).join("") : `<tr><td colspan="10">${this.empty_state("No payment entries found")}</td></tr>`}
					</tbody>
				</table>
			</div>
		`);
	}

	ledger_row(row) {
		return `
			<tr class="ptd-clickable-row" data-receipt="${this.escape_attr(row.purchase_receipt)}" title="${__("Open Purchase Receipt")}">
				<td>${this.mono(row.purchase_receipt)}</td>
				<td>${this.link_chip("Supplier", row.supplier, "user")}</td>
				<td>${this.link_chip("Project Master", row.project, "building")}</td>
				<td>${this.money(row.total_amount)}</td>
				<td>${this.money_or_dash(row.previous_paid_amount)}</td>
				<td><strong class="ptd-paid">${this.money(row.paid_amount)}</strong></td>
				<td><strong class="ptd-outstanding">${this.money_or_dash(row.outstanding_amount)}</strong></td>
				<td>${frappe.utils.escape_html(row.last_payment_date || "-")}</td>
				<td>${this.progress(row.progress_percent, row.payment_status)}</td>
				<td>${this.badge(row.payment_status)}</td>
			</tr>
		`;
	}

	render_receipt_overview() {
		const rows = this.data.receipt_overview || [];
		$(this.page.main).find("[data-role='receipt-overview']").html(`
			<div class="ptd-card ptd-receipt-list">
				<div class="ptd-card-header">
					<div class="ptd-card-title"><i class="ti ti-files"></i>Linked Receipts</div>
					<span class="ptd-pill">${this.number(rows.length)} Receipts</span>
				</div>
				<div class="ptd-receipt-stack">
					${rows.length ? rows.map((row) => this.receipt_card(row)).join("") : this.empty_state("No linked receipts found")}
				</div>
			</div>
		`);
	}

	receipt_card(row) {
		return `
			<div class="ptd-receipt-card" data-receipt="${this.escape_attr(row.purchase_receipt)}" title="${__("Open Purchase Receipt")}">
				<div class="ptd-receipt-head">
					<div>
						<div class="ptd-receipt-name">${this.mono(row.purchase_receipt)}</div>
						<div class="ptd-receipt-meta">${frappe.utils.escape_html(row.supplier || "-")} / ${frappe.utils.escape_html(row.project || "-")}</div>
					</div>
					${this.badge(row.payment_status)}
				</div>
				<div class="ptd-receipt-amounts">
					<div><span>Total</span><strong>${this.money(row.total_amount)}</strong></div>
					<div><span>Paid</span><strong class="ptd-paid">${this.money(row.paid_amount)}</strong></div>
					<div><span>Outstanding</span><strong class="ptd-outstanding">${this.money_or_dash(row.outstanding_amount)}</strong></div>
				</div>
				${this.progress(row.progress_percent, row.payment_status)}
			</div>
		`;
	}

	render_status_summary() {
		const summary = this.data.status_summary || {};
		const statuses = [
			["Paid", "green"],
			["Partial", "teal"],
			["Pending", "amber"],
			["Overdue", "red"],
		];
		const max = Math.max(...statuses.map(([status]) => Number((summary[status] || {}).outstanding_amount || 0)), 1);
		$(this.page.main).find("[data-role='status-summary']").html(`
			<div class="ptd-card ptd-status-panel">
				<div class="ptd-card-header">
					<div class="ptd-card-title"><i class="ti ti-chart-donut"></i>Payment Status</div>
				</div>
				<div class="ptd-status-list">
					${statuses.map(([status, tone]) => {
						const row = summary[status] || {};
						const amount = Number(row.outstanding_amount || row.paid_amount || 0);
						const width = Math.max(4, Math.round((amount / max) * 100));
						return `
							<div class="ptd-status-row">
								<div><span class="ptd-dot ${tone}"></span>${frappe.utils.escape_html(status)} <em>${this.number(row.count)}</em></div>
								<strong>${this.money_or_dash(amount)}</strong>
								<div class="ptd-status-bar"><span class="${tone}" style="width:${width}%"></span></div>
							</div>
						`;
					}).join("")}
				</div>
			</div>
		`);
	}

	link_chip(doctype, value, icon) {
		if (!value || value === "-") {
			return "-";
		}
		return `<button class="ptd-link-chip" data-open-doctype="${this.escape_attr(doctype)}" data-name="${this.escape_attr(value)}"><i class="ti ti-${icon}"></i>${frappe.utils.escape_html(value)}</button>`;
	}

	progress(value, status) {
		const percent = Math.max(0, Math.min(100, Number(value || 0)));
		return `
			<div class="ptd-progress">
				<div class="ptd-progress-meta"><span>${this.number(percent, 0)}%</span></div>
				<div class="ptd-progress-track"><div class="${this.status_tone(status)}" style="width:${percent}%"></div></div>
			</div>
		`;
	}

	badge(status) {
		const tone = this.status_tone(status);
		return `<span class="ptd-badge ${tone}">${frappe.utils.escape_html(status || "Zero")}</span>`;
	}

	status_tone(status) {
		const value = String(status || "").toLowerCase();
		if (value === "paid") return "paid";
		if (value === "partial") return "partial";
		if (value === "pending") return "pending";
		if (value === "overdue") return "overdue";
		return "all";
	}

	mono(value) {
		return `<span class="ptd-mono">${frappe.utils.escape_html(value || "-")}</span>`;
	}

	empty_state(text) {
		return `<div class="ptd-empty">${frappe.utils.escape_html(text)}</div>`;
	}

	open_doc(doctype, name) {
		if (!doctype || !name || name === "-") {
			return;
		}
		frappe.set_route("Form", doctype, String(name));
	}

	escape_attr(value) {
		return frappe.utils.escape_html(String(value || "")).replace(/"/g, "&quot;");
	}

	money(value) {
		const number = Number(value || 0);
		return `\u20b9${number.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
	}

	money_or_dash(value) {
		return Number(value || 0) ? this.money(value) : "-";
	}

	number(value, digits = 0) {
		return Number(value || 0).toLocaleString("en-IN", {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		});
	}

	format_date(value) {
		if (!value) return "";
		const [year, month, day] = value.split("-");
		const date = new Date(Number(year), Number(month) - 1, Number(day));
		return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
	}
};
