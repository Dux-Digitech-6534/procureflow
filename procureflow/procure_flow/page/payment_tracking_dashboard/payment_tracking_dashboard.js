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

		this.state = {
			company: "",
			project: "",
			supplier: "",
			payment_status: "",
			month: this.get_current_month(),
		};

		this.data = null;
		this.make();
		this.bind_events();
		this.refresh();
	}

	get_current_month() {
		const today = new Date();
		return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
	}

	make() {
		$(this.page.main).empty().append(`
			<div class="ptd-dashboard">
				<header class="ptd-topbar">
					<div class="ptd-title-wrap">
						<div class="ptd-title">Payment Tracking Dashboard</div>
						<div class="ptd-subtitle" data-role="subtitle">Purchase receipt payment overview</div>
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
							<select data-filter="payment_status"><option value="">All Statuses</option></select>
						</label>
						<label class="ptd-filter ptd-filter-month">
							<i class="ti ti-calendar"></i>
							<input type="month" data-filter="month" value="${this.state.month}">
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
					${this.section_header("Payment Status Summary")}
					<div class="ptd-status-grid" data-role="status-summary"></div>
					<div class="ptd-two-col">
						<div>
							${this.section_header("Outstanding by Supplier")}
							<div data-role="supplier-summary"></div>
						</div>
						<div>
							${this.section_header("Outstanding by Project")}
							<div data-role="project-summary"></div>
						</div>
					</div>
					${this.section_header("Recent Purchase Receipt Payments")}
					<div data-role="recent-receipts"></div>
					${this.section_header("Insights")}
					<div class="ptd-insight-grid" data-role="insights"></div>
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
		root.on("change", "[data-filter]", (event) => {
			const field = $(event.currentTarget).data("filter");
			this.state[field] = $(event.currentTarget).val() || "";
			this.refresh();
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
				payment_status: this.state.payment_status,
				month: this.state.month,
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
		this.render_status_summary();
		this.render_group_table("supplier-summary", this.data.outstanding_by_supplier || [], "Supplier");
		this.render_group_table("project-summary", this.data.outstanding_by_project || [], "Project");
		this.render_recent_receipts();
		this.render_insights();
	}

	render_filters() {
		const options = this.data.filter_options || {};
		this.fill_select("company", options.companies || [], "All Companies", this.state.company);
		this.fill_select("project", options.projects || [], "All Projects", this.state.project);
		this.fill_select("supplier", options.suppliers || [], "All Suppliers", this.state.supplier);
		this.fill_select("payment_status", options.payment_statuses || [], "All Statuses", this.state.payment_status);
		$(this.page.main).find("[data-filter='month']").val(this.state.month);
	}

	fill_select(field, values, empty_label, selected) {
		const select = $(this.page.main).find(`[data-filter='${field}']`);
		const current = selected || "";
		select.html(`<option value="">${frappe.utils.escape_html(empty_label)}</option>`);
		values.forEach((value) => {
			const safe = frappe.utils.escape_html(value);
			select.append(`<option value="${safe}" ${value === current ? "selected" : ""}>${safe}</option>`);
		});
	}

	render_subtitle() {
		const filters = this.data.filters || {};
		const parts = [
			filters.company || "All Companies",
			filters.project || "All Projects",
			filters.supplier || "All Suppliers",
			filters.payment_status || "All Statuses",
			this.format_month(filters.month || this.state.month),
		];
		$(this.page.main).find("[data-role='subtitle']").text(`Purchase receipt payment overview - ${parts.join(" / ")}`);
	}

	render_kpis() {
		const kpis = this.data.kpis || {};
		const cards = [
			["Total Receipt Amount", this.money(kpis.total_receipt_amount), "receipt-2", "blue"],
			["Total Paid Amount", this.money(kpis.total_paid_amount), "cash", "green"],
			["Total Outstanding Amount", this.money(kpis.total_outstanding_amount), "alert-circle", "red"],
			["Pending Receipts", this.number(kpis.pending_receipts), "clock", "amber"],
			["Partially Paid Receipts", this.number(kpis.partial_receipts), "progress", "teal"],
			["Fully Paid Receipts", this.number(kpis.paid_receipts), "circle-check", "purple"],
		];
		$(this.page.main).find("[data-role='kpis']").html(cards.map((card) => this.kpi_card(...card)).join(""));
	}

	kpi_card(label, value, icon, tone) {
		return `
			<div class="ptd-kpi-card ${tone}">
				<div class="ptd-kpi-top">
					<span>${frappe.utils.escape_html(label)}</span>
					<div class="ptd-kpi-icon"><i class="ti ti-${icon}"></i></div>
				</div>
				<div class="ptd-kpi-value">${frappe.utils.escape_html(String(value || 0))}</div>
			</div>
		`;
	}

	render_status_summary() {
		const summary = this.data.status_summary || {};
		const statuses = [
			["Paid", "circle-check", "green"],
			["Partial", "progress", "teal"],
			["Pending", "clock", "amber"],
			["Zero", "circle-minus", "gray"],
		];
		$(this.page.main).find("[data-role='status-summary']").html(statuses.map(([status, icon, tone]) => {
			const row = summary[status] || {};
			return `
				<div class="ptd-card ptd-status-card">
					<div class="ptd-status-head">
						<div class="ptd-status-icon ${tone}"><i class="ti ti-${icon}"></i></div>
						<div>
							<div class="ptd-card-label">${status}</div>
							<div class="ptd-card-value">${this.number(row.count)}</div>
						</div>
					</div>
					<div class="ptd-status-lines">
						<div><span>Total</span><strong>${this.money(row.total_amount)}</strong></div>
						<div><span>Paid</span><strong>${this.money(row.paid_amount)}</strong></div>
						<div><span>Outstanding</span><strong>${this.money(row.outstanding_amount)}</strong></div>
					</div>
				</div>
			`;
		}).join(""));
	}

	render_group_table(role, rows, label) {
		$(this.page.main).find(`[data-role='${role}']`).html(`
			<div class="ptd-card ptd-table-card">
				<table class="ptd-table">
					<thead>
						<tr>
							<th>${frappe.utils.escape_html(label)}</th>
							<th>Total</th>
							<th>Paid</th>
							<th>Outstanding</th>
							<th>Receipts</th>
						</tr>
					</thead>
					<tbody>
						${rows.length ? rows.map((row) => `
							<tr>
								<td>${frappe.utils.escape_html(row.label || "Not Set")}</td>
								<td>${this.money(row.total_amount)}</td>
								<td>${this.money(row.paid_amount)}</td>
								<td><strong>${this.money(row.outstanding_amount)}</strong></td>
								<td>${this.number(row.receipt_count)}</td>
							</tr>
						`).join("") : `<tr><td colspan="5">${this.empty_state("No records found")}</td></tr>`}
					</tbody>
				</table>
			</div>
		`);
	}

	render_recent_receipts() {
		const rows = this.data.recent_receipts || [];
		$(this.page.main).find("[data-role='recent-receipts']").html(`
			<div class="ptd-card ptd-table-card ptd-wide-card">
				<table class="ptd-table">
					<thead>
						<tr>
							<th>Purchase Receipt</th>
							<th>Supplier</th>
							<th>Project</th>
							<th>Company</th>
							<th>Receipt Date</th>
							<th>Total Amount</th>
							<th>Paid Amount</th>
							<th>Outstanding Amount</th>
							<th>Status</th>
							<th>Last Payment Date</th>
						</tr>
					</thead>
					<tbody>
						${rows.length ? rows.map((row) => `
							<tr>
								<td>${this.mono(row.purchase_receipt)}</td>
								<td>${frappe.utils.escape_html(row.supplier || "-")}</td>
								<td>${frappe.utils.escape_html(row.project || "-")}</td>
								<td>${frappe.utils.escape_html(row.company || "-")}</td>
								<td>${frappe.utils.escape_html(row.receipt_date || "-")}</td>
								<td>${this.money(row.total_amount)}</td>
								<td>${this.money(row.paid_amount)}</td>
								<td><strong>${this.money(row.outstanding_amount)}</strong></td>
								<td>${this.badge(row.payment_status)}</td>
								<td>${frappe.utils.escape_html(row.last_payment_date || "-")}</td>
							</tr>
						`).join("") : `<tr><td colspan="10">${this.empty_state("No purchase receipt payments found")}</td></tr>`}
					</tbody>
				</table>
			</div>
		`);
	}

	render_insights() {
		const insights = this.data.insights || {};
		const supplier = insights.highest_outstanding_supplier || {};
		const project = insights.highest_outstanding_project || {};
		const oldest = insights.oldest_pending_receipt || {};
		const cards = [
			["Highest Outstanding Supplier", supplier.label || "-", this.money(supplier.outstanding_amount), "users", "red"],
			["Highest Outstanding Project", project.label || "-", this.money(project.outstanding_amount), "building-community", "amber"],
			["Oldest Pending Receipt", oldest.purchase_receipt || "-", oldest.receipt_date || "-", "calendar-clock", "teal"],
			["Payment Completion", `${this.number(insights.completion_percent, 1)}%`, "Paid vs total receipt value", "chart-pie", "blue"],
		];
		$(this.page.main).find("[data-role='insights']").html(cards.map(([title, value, detail, icon, tone]) => `
			<div class="ptd-card ptd-insight-card">
				<div class="ptd-insight-icon ${tone}"><i class="ti ti-${icon}"></i></div>
				<div>
					<div class="ptd-card-label">${frappe.utils.escape_html(title)}</div>
					<div class="ptd-insight-value">${frappe.utils.escape_html(String(value || "-"))}</div>
					<div class="ptd-insight-detail">${frappe.utils.escape_html(String(detail || ""))}</div>
				</div>
			</div>
		`).join(""));
	}

	badge(status) {
		const tone = { Paid: "paid", Partial: "partial", Pending: "pending", Zero: "zero" }[status] || "zero";
		return `<span class="ptd-badge ${tone}">${frappe.utils.escape_html(status || "Zero")}</span>`;
	}

	mono(value) {
		return `<span class="ptd-mono">${frappe.utils.escape_html(value || "-")}</span>`;
	}

	empty_state(text) {
		return `<div class="ptd-empty">${frappe.utils.escape_html(text)}</div>`;
	}

	money(value) {
		const number = Number(value || 0);
		return `Rs ${number.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
	}

	number(value, digits = 0) {
		return Number(value || 0).toLocaleString("en-IN", {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		});
	}

	format_month(value) {
		if (!value) return "";
		const [year, month] = value.split("-");
		const date = new Date(Number(year), Number(month) - 1, 1);
		return date.toLocaleString("en-IN", { month: "short", year: "numeric" });
	}
};
