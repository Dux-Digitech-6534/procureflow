frappe.provide("procureflow.dashboard");

frappe.pages["procurement-dashboard"].on_page_load = function (wrapper) {
	procureflow.dashboard.load_assets();
	new procureflow.dashboard.ProcurementDashboard(wrapper);
};

procureflow.dashboard.load_assets = function () {
	if (!document.getElementById("procureflow-tabler-icons")) {
		const link = document.createElement("link");
		link.id = "procureflow-tabler-icons";
		link.rel = "stylesheet";
		link.href = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css";
		link.onerror = () => document.documentElement.classList.add("pf-icons-fallback");
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

procureflow.dashboard.ProcurementDashboard = class ProcurementDashboard {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Procurement Dashboard"),
			single_column: true,
		});
		$(this.wrapper).addClass("pf-dashboard-page");
		$(this.wrapper).find(".page-head").hide();

		this.state = {
			company: "",
			project: "",
			month: this.get_current_month(),
		};

		this.data = null;
		this.make();
		this.bind_events();
		this.verify_icon_font();
		this.refresh();
	}

	verify_icon_font() {
		window.setTimeout(() => {
			if (document.fonts && !document.fonts.check('16px "tabler-icons"')) {
				document.documentElement.classList.add("pf-icons-fallback");
			}
		}, 2000);
	}

	get_current_month() {
		const today = new Date();
		return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
	}

	make() {
		$(this.page.main).empty().append(`
			<div class="pf-dashboard">
				<main class="pf-main">
					<header class="pf-topbar">
						<div class="pf-header-copy">
							<div class="pf-title">Procurement Dashboard</div>
							<div class="pf-subtitle" data-role="subtitle">Live overview</div>
						</div>
						<div class="pf-topbar-right">
							<label class="pf-chip pf-filter-chip">
								<i class="ti ti-building-community"></i>
								<select data-filter="company"><option value="">All Companies</option></select>
							</label>
							<label class="pf-chip pf-filter-chip">
								<i class="ti ti-map-pin"></i>
								<select data-filter="project"><option value="">All Projects</option></select>
							</label>
							<label class="pf-chip pf-month-chip">
								<i class="ti ti-calendar"></i>
								<input type="month" data-filter="month" value="${this.state.month}">
							</label>
							<button class="pf-chip-btn" data-action="refresh" title="${__("Refresh")}"><i class="ti ti-refresh"></i></button>
							<div class="pf-user-pill">
								<div class="pf-avatar">${this.initials(frappe.session.user_fullname || frappe.session.user)}</div>
								<div class="pf-user-name">${frappe.utils.escape_html(frappe.session.user_fullname || frappe.session.user)}</div>
							</div>
						</div>
					</header>
					<section class="pf-content">
						<div class="pf-loading" data-role="loading">
							<div class="pf-spinner"></div>
							<div>${__("Loading procurement dashboard")}</div>
						</div>
						<div class="pf-kpi-grid" data-role="kpis"></div>
						${this.section_header("Overview")}
						<div class="pf-overview" data-role="overview"></div>
						${this.section_header("Operations")}
						<div class="pf-op-grid" data-role="operations"></div>
						${this.section_header("Analytics")}
						<div class="pf-insight-grid" data-role="analytics"></div>
					</section>
				</main>
			</div>
		`);
	}

	nav_item(label, icon, doctype, active, badge_key, route) {
		return `
			<div class="pf-nav-item ${active ? "active" : ""}" data-doctype="${frappe.utils.escape_html(doctype || "")}" data-route="${frappe.utils.escape_html(route || "")}">
				<i class="ti ti-${icon}"></i><span>${frappe.utils.escape_html(label)}</span>
				${badge_key ? `<span class="pf-nav-badge" data-badge="${badge_key}">0</span>` : ""}
			</div>
		`;
	}

	section_header(title) {
		return `<div class="pf-section-header"><span class="pf-section-title">${frappe.utils.escape_html(title)}</span><div class="pf-section-line"></div></div>`;
	}

	bind_events() {
		const root = $(this.page.main);

		root.on("click", "[data-action='refresh']", () => this.refresh());
		root.on("change", "[data-filter]", (event) => {
			const field = $(event.currentTarget).data("filter");
			this.state[field] = $(event.currentTarget).val() || "";
			this.refresh();
		});
		root.on("click", ".pf-nav-item", (event) => {
			const doctype = $(event.currentTarget).data("doctype");
			const route = $(event.currentTarget).data("route");
			if (doctype) {
				frappe.set_route("List", doctype);
			} else if (route) {
				frappe.set_route(route.split("/"));
			}
		});
	}

	refresh() {
		this.set_loading(true);
		frappe.call({
			method: "procureflow.dashboard_api.get_procurement_dashboard_data",
			args: {
				company: this.state.company,
				project: this.state.project,
				month: this.state.month,
			},
			callback: (r) => {
				this.data = r.message || {};
				this.render();
			},
			error: () => {
				frappe.msgprint(__("Could not load procurement dashboard data. Please check Error Log for details."));
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
		this.render_overview();
		this.render_operations();
		this.render_analytics();
	}

	render_filters() {
		const options = this.data.filter_options || {};
		this.fill_select("company", options.companies || [], "All Companies", this.state.company);
		this.fill_select("project", options.projects || [], "All Projects", this.state.project);
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
		const company = filters.company || "All Companies";
		const project = filters.project || "All Projects";
		const month = this.format_month(filters.month || this.state.month);
		$(this.page.main).find("[data-role='subtitle']").text(`Live overview · ${company} · ${project} · ${month}`);
	}

	render_kpis() {
		const kpis = this.data.kpis || {};
		const mr = kpis.material_requests || {};
		const po = kpis.purchase_orders || {};
		const pr = kpis.purchase_receipts || {};
		const po_value = kpis.total_po_value || {};
		const outstanding = kpis.outstanding_amount || {};

		$(this.page.main).find("[data-role='kpis']").html(`
			${this.kpi_card("Material Requests", "file-text", "blue", mr.total, [
				["green", `${mr.approved || 0} Approved`, "check"],
				["amber", `${mr.pending || 0} Pending`, "hourglass"],
				["red", `${mr.rejected || 0} Rejected`, "x"],
			])}
			${this.kpi_card("Purchase Orders", "shopping-cart", "teal", po.total, [
				["green", `${po.approved || 0} Approved`, "check"],
				["amber", `${po.pending || 0} Pending`, "hourglass"],
				["red", `${po.rejected || 0} Rejected`, "x"],
			])}
			${this.kpi_card("Purchase Receipts", "truck-delivery", "purple", pr.total, [
				["teal", `${pr.completed || 0} Completed`, "check"],
				["amber", `${pr.pending || 0} Pending`, "hourglass"],
				["gray", `${pr.overdue || 0} Overdue`, "clock-exclamation"],
			])}
			${this.kpi_card("Total PO Value", "coin-rupee", "amber", this.money(po_value.total), [
				["blue", `This Month ${this.money(po_value.current_month)}`, ""],
			], true)}
			${this.kpi_card("Outstanding Amount", "alert-circle", "red", this.money(outstanding.total), [
				["red", `Overdue ${this.money(outstanding.overdue)}`, "alert-triangle"],
			], true)}
		`);

		$(this.page.main).find("[data-badge='mr_pending']").text(mr.pending || 0).toggle(Boolean(mr.pending));
	}

	kpi_card(label, icon, color, value, pills, small) {
		const pill_html = pills.map(([tone, text, pill_icon]) => {
			const icon_html = pill_icon ? `<i class="ti ti-${pill_icon}"></i>` : "";
			return `<span class="pf-pill ${tone}">${icon_html}${frappe.utils.escape_html(text)}</span>`;
		}).join("");

		return `
			<div class="pf-kpi-card c-${color}">
				<div class="pf-kpi-top">
					<span class="pf-kpi-label">${frappe.utils.escape_html(label)}</span>
					<div class="pf-kpi-icon"><i class="ti ti-${icon}"></i></div>
				</div>
				<div class="pf-kpi-value ${small ? "sm" : ""}">${frappe.utils.escape_html(String(value || 0))}</div>
				<div class="pf-kpi-pills">${pill_html}</div>
			</div>
		`;
	}

	render_overview() {
		const overview = this.data.overview || {};
		const months = overview.monthly_po_value || [];
		const bars = months.map((row) => `
			<div class="pf-bar-col">
				<div class="pf-bar-lbl">${this.money_short(row.value)}</div>
				<div class="pf-bar-fill ${row.is_current ? "current" : ""}" style="height:${row.percent || 8}%">
					${row.is_current ? `<div class="pf-current-badge">Current</div>` : ""}
				</div>
				<div class="pf-bar-month ${row.is_current ? "active" : ""}">${frappe.utils.escape_html(row.label || "")}</div>
			</div>
		`).join("");

		$(this.page.main).find("[data-role='overview']").html(`
			<div class="pf-card pf-trend-card">
				<div class="pf-card-header">
					<div class="pf-card-title"><i class="ti ti-chart-bar-popular"></i>Monthly PO Value Trend</div>
					<span class="pf-pill ${overview.mom_growth >= 0 ? "green" : "red"}">${overview.mom_growth >= 0 ? "+" : ""}${this.number(overview.mom_growth, 1)}% MoM</span>
				</div>
				<div class="pf-bar-area">
					${bars || this.empty_state("No PO value for this period")}
					<div class="pf-axis-line"></div>
				</div>
				<div class="pf-chart-footer">
					<div class="pf-cf-item">Total YTD: <span class="pf-cf-val">${this.money(overview.total_ytd)}</span></div>
					<div class="pf-cf-item">MoM Growth: <span class="pf-cf-val ${overview.mom_growth >= 0 ? "up" : "down"}">${overview.mom_growth >= 0 ? "+" : ""}${this.number(overview.mom_growth, 1)}%</span></div>
					<div class="pf-cf-item">Avg Monthly: <span class="pf-cf-val">${this.money_short(overview.avg_monthly)}</span></div>
				</div>
			</div>
		`);
	}

	render_operations() {
		const ops = this.data.operations || {};
		$(this.page.main).find("[data-role='operations']").html(`
			${this.table_card("Material Requests", "clipboard-list", ["MR No.", "Project", "Priority", "Status"], (ops.material_requests || []).map((row) => [
				this.mono(row.name),
				row.project || "-",
				this.badge(row.priority || "Not Set", this.priority_tone(row.priority)),
				this.badge(row.status, this.status_tone(row.status)),
			]))}
			${this.table_card("Supplier Quotations", "file-invoice", ["SQ No.", "Supplier", "Project", "Status"], (ops.supplier_quotations || []).map((row) => [
				this.mono(row.name),
				row.supplier || "-",
				row.project || "-",
				this.badge(row.status, this.status_tone(row.status)),
			]))}
			${this.table_card("Purchase Orders", "shopping-cart", ["PO No.", "Supplier", "Value", "Status"], (ops.purchase_orders || []).map((row) => [
				this.mono(row.name),
				row.supplier || "-",
				this.money(row.value),
				this.badge(row.status, this.status_tone(row.status)),
			]))}
			${this.top_suppliers(ops.top_suppliers || [])}
		`);
	}

	table_card(title, icon, headers, rows) {
		const head = headers.map((item) => `<th>${frappe.utils.escape_html(item)}</th>`).join("");
		const body = rows.length
			? rows.map((cols) => `<tr>${cols.map((col) => `<td>${col == null ? "-" : col}</td>`).join("")}</tr>`).join("")
			: `<tr><td colspan="${headers.length}">${this.empty_state("No records found")}</td></tr>`;

		return `
			<div class="pf-card">
				<div class="pf-card-header">
					<div class="pf-card-title"><i class="ti ti-${icon}"></i>${frappe.utils.escape_html(title)}</div>
					<span class="pf-pill blue">Recent</span>
				</div>
				<table class="pf-data-table">
					<thead><tr>${head}</tr></thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`;
	}

	top_suppliers(rows) {
		const max_rows = rows.length ? rows : [];
		const body = max_rows.length
			? max_rows.map((row, index) => `
				<tr>
					<td class="pf-sup-rank">${String(index + 1).padStart(2, "0")}</td>
					<td>
						<div class="pf-sup-name">${frappe.utils.escape_html(row.supplier || "Unknown Supplier")}</div>
						<div class="pf-sup-bar"><div class="pf-sup-fill" style="width:${row.percent || 0}%"></div></div>
					</td>
					<td class="pf-sup-amt">${this.money_short(row.total)}</td>
				</tr>
			`).join("")
			: `<tr><td colspan="3">${this.empty_state("No supplier spend yet")}</td></tr>`;

		return `
			<div class="pf-card">
				<div class="pf-card-header">
					<div class="pf-card-title"><i class="ti ti-award"></i>Top Suppliers</div>
					<span class="pf-muted">By PO Value</span>
				</div>
				<table class="pf-sup-table">${body}</table>
			</div>
		`;
	}

	render_analytics() {
		const analytics = this.data.analytics || {};
		const cards = [
			["Project wise procurement value", "building-community", "blue", analytics.project_wise || [], true],
			["Category wise spend", "category", "purple", analytics.category_wise || [], true],
			["Priority wise MR count", "alert-triangle", "amber", analytics.priority_wise || [], false],
			["Supplier wise PO value", "users", "teal", analytics.supplier_wise || [], true],
		];
		$(this.page.main).find("[data-role='analytics']").html(cards.map((card) => this.insight_card(...card)).join(""));
	}

	insight_card(label, icon, tone, rows, is_money) {
		const top = rows[0] || {};
		const value = is_money ? this.money_short(top.value) : this.number(top.value, 0);
		const detail = rows.slice(0, 4).map((row) => `
			<div class="pf-mini-row">
				<span>${frappe.utils.escape_html(row.label || "Not Set")}</span>
				<strong>${is_money ? this.money_short(row.value) : this.number(row.value, 0)}</strong>
			</div>
		`).join("");

		return `
			<div class="pf-insight-card">
				<div class="pf-insight-top">
					<div class="pf-ins-icon ${tone}"><i class="ti ti-${icon}"></i></div>
					<div>
						<div class="pf-ins-label">${frappe.utils.escape_html(label)}</div>
						<div class="pf-ins-val">${value || "-"}</div>
					</div>
				</div>
				<div class="pf-mini-list">${detail || this.empty_state("No data")}</div>
			</div>
		`;
	}

	empty_state(text) {
		return `<div class="pf-empty">${frappe.utils.escape_html(text)}</div>`;
	}

	mono(value) {
		return `<span class="pf-mono">${frappe.utils.escape_html(value || "-")}</span>`;
	}

	badge(value, tone) {
		return `<span class="pf-badge b-${tone}">${frappe.utils.escape_html(value || "-")}</span>`;
	}

	status_tone(value) {
		const status = String(value || "").toLowerCase();
		if (status.includes("reject") || status.includes("cancel")) return "rejected";
		if (status.includes("complete") || status.includes("approved") || status.includes("submit") || status.includes("closed")) return "approved";
		if (status.includes("overdue")) return "overdue";
		return "pending";
	}

	priority_tone(value) {
		const priority = String(value || "").toLowerCase();
		if (priority.includes("high")) return "high";
		if (priority.includes("low")) return "low";
		return "medium";
	}

	payment_tone(status, overdue) {
		if (overdue) return "overdue";
		if (status === "Paid") return "paid";
		if (status === "Partial") return "partial";
		return "pending";
	}

	payment_percent(row) {
		const total = Number(row.total_amount || 0);
		if (!total) return 0;
		return Math.min(100, Math.max(0, (Number(row.paid_amount || 0) / total) * 100));
	}

	money(value) {
		const amount = Number(value || 0);
		return `\u20b9${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
	}

	money_short(value) {
		const amount = Number(value || 0);
		if (Math.abs(amount) >= 10000000) return `\u20b9${this.number(amount / 10000000, 1)}Cr`;
		if (Math.abs(amount) >= 100000) return `\u20b9${this.number(amount / 100000, 1)}L`;
		if (Math.abs(amount) >= 1000) return `\u20b9${this.number(amount / 1000, 1)}K`;
		return this.money(amount);
	}

	number(value, digits) {
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

	initials(value) {
		return String(value || "AD")
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0])
			.join("")
			.toUpperCase() || "AD";
	}
};
