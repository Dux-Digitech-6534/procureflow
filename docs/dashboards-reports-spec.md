# ProcureFlow — Dashboards & Reports: Master Spec + Review
> Generated 2026-06-21 by a multi-agent research+design pass (11 agents). The Review Addendum at the end corrects two real issues in the spec — read it alongside §0–§8.

---

All key references confirmed. Here is the master specification.

---

# ProcureFlow — Dashboards & Reports Master Specification

**Version 1.0 — for stakeholder approval**
Prepared against the live ProcureFlow codebase (`procureflow-repo/`). Sanskruti Group — multi-company, multi-project real-estate / construction buying module on ERPNext/Frappe v16.

## 0. Context & guiding principles

- **Buying chain:** Material Request (MR) → Purchase Order (PO) → Purchase Receipt (PR / GRN) → Procureflow Payment Entry. **No Purchase Invoice exists** anywhere, so `per_billed` is always 0 — the **PR grand total is the bookable payable** and the custom Payment Entry is the only settlement.
- **Reuse-first:** ~85–90% of all KPIs/series/groupings are **already computed** by `procureflow/dashboard_api.py` and exposed via **two whitelisted endpoints** (verified lines 31–45 and 862). The current Frappe Desk dashboards are being **retired in favor of an in-SPA experience**.
- **Per-doctype dimension fields (critical):** PO/PR project = `custom_project_name`; MR project = `custom_select_project_`; Payment project = `project`. Display/group company = `custom_test_company_` (PO/PR), `company` (Payment) — **NOT** the fixed accounting company "Sanskruti Developers". MR/SQ have no group-company field → roll up via **Project Master.company_name**. `build_filters()` already resolves these automatically.
- **Honesty in metrics:** Several existing metrics are proxies and must be labelled as such in the UI (see §6). We do not silently present approximations as exact.

---

## 1. Dashboard Architecture

**Recommendation: ONE dashboard route (`/dashboard`) with role-aware TABS, plus ONE reports route (`/reports`) with a report catalog.** This avoids six separate pages, keeps the global filter bar shared, and lets a user's role pick the default tab.

| Tab | Audience / Role | Purpose |
|---|---|---|
| **Executive** | Owner / Directors, Admin | Boardroom view: total spend + trend, spend mix (company/project/category/supplier), open commitments, payables at a glance, supplier concentration, MoM growth. |
| **Operations** | Purchase Officer, Supervisor | "What do I do next": pipeline funnel, action queues, approvals, receipts-due, MR→PO backlog, buyer workload. |
| **Finance (AP)** | Finance / Accounts | Payables command center: outstanding, ageing buckets, payment-run worklist, cash outflow, settlement %, GST input. |
| **Project** | Project Managers, Site Engineers | Per-project committed→received→paid flow, material consumption, category/store spend, open pipeline, (future) budget-vs-actual. |
| **Suppliers** | Procurement Managers | Spend Pareto, concentration, scorecard (lead time/fill-rate/on-time), price intelligence, new-vs-repeat. |

**Placement & wiring (verified):**
- New routes in `frontend/src/App.tsx` — flat list under the existing `<AppShell>` layout route, added **before** the `*` catch-all (line 54). Static imports (no lazy-loading used).
- Two NAV entries in `frontend/src/components/AppShell.tsx` `NAV` array: `{ to:'/dashboard', label:'Dashboard', icon:'layers' }` and `{ to:'/reports', label:'Reports', icon:'file-text' }`.
- **Repoint the index route** (App.tsx line 40, currently `MaterialRequests`) to `/dashboard` **only for leadership roles**; non-leadership keep their work list as landing (role-based default, §5).
- Backend: **reuse the two existing whitelisted endpoints**; add **thin wrappers in `react_api.py`** (not Desk-page coupling) for the handful of net-new cuts (§7).

---

## 2. Dashboard Widget Catalog

Legend — **Source tags:** `EXISTING` = already returned by a whitelisted endpoint (zero backend); `FREE` = computed today but **unrendered** (zero backend, just surface it); `NEW` = small new thin wrapper in `react_api.py`; `NEW-DATA` = requires a new master/field (§6). All widgets honor the global filter bar (§4) unless noted.

### 2A. Executive tab

| Title | Viz | Metric definition | Dimension | Data source | Priority |
|---|---|---|---|---|---|
| Total Procurement Spend | KPI | SUM(PO amount) over range; amount = COALESCE(base_grand_total, grand_total, rounded_total, total). Delta pill = MoM growth. | scalar | EXISTING `kpis.total_po_value.total` + `overview.mom_growth` | P1 |
| Spend Growth (MoM) | KPI | (curr month − prev month)/prev × 100; sub-label Avg Monthly = period_total/months. | last 2 months | EXISTING `overview.mom_growth`, `overview.avg_monthly` | P1 |
| Open Commitments | KPI | SUM(grand_total × (1 − per_received/100)) over docstatus=1 POs, status NOT IN (Closed,Stopped); + open-PO count. | scalar | NEW `exec_open_commitments` (per_received verified react_api.py:807) | P1 |
| Outstanding Payables | KPI | SUM(max(PR_total − paid, 0)); paid = SUM(Payment.amount docstatus=1). Sub-label overdue >30d in red. | scalar | EXISTING `kpis.outstanding_amount.{total,overdue}` | P1 |
| Supplier Concentration (Top-1 share) | KPI | top_supplier_total / total_period_spend × 100 + name. | supplier | EXISTING `analytics.top_supplier_share` | P1 |
| Monthly Spend Trend | bar | Per-month SUM(PO grand_total); current month highlighted; footer total/growth/avg. | month | EXISTING `overview.monthly_po_value[]` | P1 |
| Spend by Company | bar | SUM(PO grand_total) grouped by `custom_test_company_`. | group company | NEW `get_grouped_sum(...,'custom_test_company_')` | P1 |
| Spend by Project (Top 10) | bar | SUM(PO grand_total) by `custom_project_name`, top 10. | project | FREE `analytics.project_wise` (bump limit 5→10) | P1 |
| Top Suppliers by Spend | bar | Top 5–10 suppliers by SUM(PO grand_total), % bar. | supplier | EXISTING `operations.top_suppliers` / `analytics.supplier_wise` | P1 |
| Spend by Category | donut | SUM(PO grand_total) by `custom_category` + "Others". | category | FREE `analytics.category_wise` | P2 |
| Payables by Supplier (current vs >30d) | stacked bar | Per supplier outstanding split current vs >30d. | supplier | FREE `outstanding_by_supplier` + >30d flag | P2 |
| Payment Status Mix | donut | Count/amount by Paid/Partial/Pending/Overdue/Zero. | computed status | FREE `status_summary` | P2 |
| PO count + status mix | KPI | PO count with Approved/Pending/Rejected. | workflow bucket | EXISTING `kpis.purchase_orders` | P2 |
| MR→PO Conversion & Avg Approval (approx) | KPI | (a) distinct linked POs / MR count, capped 100; (b) avg PO approval days. **Label "approx"** (proxy). | scalar | EXISTING `analytics.mr_to_po_conversion`, `avg_po_approval_time` | P3 |
| Active Projects with Spend | KPI | distinct projects with PO spend > 0. | project | NEW `COUNT(DISTINCT custom_project_name)` | P3 |

### 2B. Operations tab

| Title | Viz | Metric definition | Dimension | Data source | Priority |
|---|---|---|---|---|---|
| Pipeline funnel (MR→PO→PR→Paid) | funnel | Stage counts + value with stage-to-stage conversion %. | pipeline stage | EXISTING `kpis` + `mr_to_po_conversion` | P1 |
| Action queue strip (5 tiles) | KPI ×5 | (a) MRs awaiting approval; (b) POs >₹50k awaiting; (c) MRs approved & orderable (per_ordered<100); (d) POs open to receive (per_received<100); (e) PRs with outstanding>0. Each click-through. | scalar counters | EXISTING `pending_approvals`, `approved_material_requests`, `receivable_pos`, `outstanding_breakdown` | P1 |
| Approvals queue (live) | table | Row per pending MR/PO: No., project, priority, supplier/value, age days (amber>3d, red>7d). | document | EXISTING `pending_approvals` | P1 |
| MR status breakdown | donut | MR counts: Draft/Pending/Rejected/Approved-not-ordered/Partially/Ordered (per_ordered buckets). | MR state | EXISTING counts + small per_ordered bucketing | P1 |
| PO status breakdown | donut | PO counts: Draft/Pending/Rejected/To-Receive/Partial/Received/Closed (per_received buckets); center = total value. | PO state | EXISTING + per_received bucketing | P1 |
| Receipts due / GRN pending | table | Open POs: %received, pending%, days open, expected-by (schedule_date overdue flag). | open PO | NEW (add per_received + schedule_date to `receivable_pos`) | P1 |
| MR→PO ordering backlog | table | Approved MRs with per_ordered<100: priority, required-by, %ordered, age. Click → seeded New-PO. | MR | NEW (add custom_priority + per_ordered to `approved_material_requests`) | P1 |
| Project-wise pipeline load | stacked bar | Per project: open MRs + open POs + unpaid PRs; value = open PO grand_total. | project | FREE `analytics.project_wise` + grouped counts | P2 |
| Monthly PO volume & value | bar | Per-month PO value + secondary count series. | month | EXISTING `overview` (+ monthly count) | P2 |
| Buyer workload | stacked bar | Per PO.owner: count by status bucket + total value handled. | buyer | NEW `get_grouped_count`/`sum` on owner | P2 |
| Cycle-time tiles (proxy) | KPI | MR approval lag, approval→PO, PO→first-receipt (days). **Label "directional / proxy".** | scalar | NEW (proxy via dates; see §6) | P2 |
| Top requested items / fulfilment gap | bar / stacked | Top items by MR stock_qty; ordered vs pending (stock UOM). | item_code | NEW (sum MR Item.stock_qty by item_code) | P2 |
| Priority mix of open demand | donut | Open MR count by `custom_priority`. | priority | FREE `analytics.priority_wise` (filter open) | P3 |
| Aging of stuck items | heatmap | stage × age bucket (0-3/4-7/8-14/15-30/>30d), cell=count. | stage×age | EXISTING lists, client-side bucketing | P3 |

### 2C. Finance (AP) tab

| Title | Viz | Metric definition | Dimension | Data source | Priority |
|---|---|---|---|---|---|
| Total Outstanding Payable | KPI | SUM(outstanding) + open-receipt count. | scalar | EXISTING `kpis.total_outstanding_amount` | P1 |
| Paid vs Outstanding (settlement %) | donut | paid vs outstanding slices; center = paid_percent. | status split | EXISTING `kpis.{paid,outstanding,receipt,paid_percent}` | P1 |
| Outstanding by Ageing (0-30/31-60/61-90/90+) | stacked bar | Bucket open PRs by today − (due_date‖posting_date). | ageing bucket | NEW `ap_ageing_summary` (today only single >30d flag) | P1 |
| Overdue >30 Days | KPI | SUM(outstanding) where receipt_date < today−30 & outstanding>0; + count. | scalar | EXISTING `status_summary.Overdue` | P1 |
| Avg Payment Days (proxy DPO) | KPI | AVG(last_payment_date − receipt_date). **Label "avg days to pay" not DPO.** | scalar | EXISTING `kpis.avg_payment_days` | P1 |
| Supplier-wise Outstanding (Top 10) | bar | Per supplier outstanding + total/paid tooltip. | supplier | FREE `outstanding_by_supplier` | P1 |
| Project-wise Outstanding (Top 10) | bar | Per project outstanding. | project | FREE `outstanding_by_project` | P1 |
| Payment Status Mix (count + value) | stacked bar | Per bucket count + total/paid/outstanding. | status | FREE `status_summary` | P1 |
| Partial-Payment Tracker | table | PRs where paid>0 & outstanding>0; progress bar, last payment. | PR | EXISTING `ledger_rows` filtered Partial | P2 |
| Monthly Cash Outflow (actual paid) | line | SUM(Payment.amount docstatus=1) by month(payment_date). | month | NEW `cash_outflow_trend` | P2 |
| Forecast Cash Outflow | stacked bar | Open outstanding bucketed by due_date (Overdue/this wk/next wk/this mo/later). **Label "approximate".** | due-date bucket | NEW `cash_forecast` | P2 |
| GST Input Summary (CGST/SGST/IGST) | stacked bar | SUM(tax_amount) over Purchase Taxes & Charges classified by head; base = net_total. **Label "GST on POs, not ITC".** | GST head | NEW `gst_input_summary` | P2 |
| Oldest Pending Receipt | KPI | min(receipt_date) among outstanding>0; "pay first" nudge. | single receipt | FREE `insights.oldest_pending_receipt` | P3 |
| Supplier concentration of payable | gauge | top supplier outstanding / total outstanding × 100. | supplier | FREE `insights.highest_outstanding_supplier` | P3 |

### 2D. Project tab (single-project view + portfolio sub-view)

| Title | Viz | Metric definition | Dimension | Data source | Priority |
|---|---|---|---|---|---|
| Committed / Received / Paid / Outstanding | KPI ×4 | committed=SUM(PO grand_total); received=SUM(PR total); paid=SUM(Payment.amount); outstanding=max(received−paid,0). All scoped to project. | project scalar | EXISTING (`get_sum`, `get_receipt_payment_rows`) | P1 |
| Cost-flow funnel Committed→Received→Paid | funnel | 3 stages + conversion % (leakage view). | pipeline | EXISTING (composition of 4 KPIs) | P1 |
| Monthly spend trend (project) | line | Monthly committed (+optional PR series), MoM. | month | EXISTING `get_overview` (project filter flows) | P1 |
| Spend by category (project) | bar | SUM(PO grand_total) by custom_category for project. | category | FREE `analytics.category_wise` | P1 |
| Top materials consumed (project) | table | Per item ordered/received qty + value + avg rate. Toggle PO vs PR. | item | NEW child-table aggregator | P1 |
| Open MR/PO pipeline (project) | stacked bar | open MR count + open PO count by status. | doctype×status | EXISTING counts + build_filters | P1 |
| Spend by sub-category (project) | bar | by custom_sub_category. **Flag sparse** (front-door sets category only). | sub-category | NEW `get_grouped_sum(...,'custom_sub_category')` | P2 |
| Spend by store/warehouse | donut | via Project Master.store_name (coarse) or PO Item.warehouse (fine). | store | NEW (Project Master join / PO Item.warehouse) | P2 |
| Priority mix of project demand | donut | MR count by custom_priority. | priority | FREE `analytics.priority_wise` | P2 |
| **Portfolio:** Project spend leaderboard | bar | committed by project top 10, received/paid markers. | project | FREE `analytics.project_wise` (raise limit) | P1 |
| **Portfolio:** Outstanding exposure by project | table | outstanding + overdue + receipt count per project. | project | EXISTING `get_outstanding_breakdown.project_totals` | P1 |
| **Portfolio:** Category spend heatmap | heatmap | cell = SUM(PO grand_total) by (project, category). | project×category | NEW two-key grouped SQL | P2 |
| **Portfolio:** Spend by group company | donut | SUM(PO grand_total) by custom_test_company_. | company | NEW (shared with Exec "Spend by Company") | P2 |
| Budget vs Actual (project / by category) | gauge / stacked | utilisation% = committed / budget × 100; variance. | project / category | **NEW-DATA** (Project Budget master, §6) | P3 |

### 2E. Suppliers tab

| Title | Viz | Metric definition | Dimension | Data source | Priority |
|---|---|---|---|---|---|
| Active Suppliers (period) | KPI | COUNT(DISTINCT PO.supplier) in range + master total. | scalar | EXISTING (distinct from grouped sum) | P1 |
| Total Supplier Spend | KPI | SUM(PO grand_total). | scalar | EXISTING `analytics.total_period_spend` | P1 |
| Top-Supplier Concentration | KPI | #1 supplier share %. | supplier | EXISTING `top_supplier_share` | P1 |
| Total Supplier Outstanding | KPI | SUM(outstanding) + >30d pill. | scalar | EXISTING `outstanding_breakdown` | P1 |
| Supplier Spend Pareto (80/20) | bar + cumulative line | spend per supplier desc + running cumulative %; mark N suppliers = 80%. | supplier | EXISTING `get_grouped_sum(...,'supplier', limit=20)` + client cumulative | P1 |
| Spend by Supplier (Top N) | h-bar | top 10 by spend, % bars. | supplier | EXISTING `supplier_wise` | P1 |
| Avg Lead Time (PO→PR) | KPI | mean(PR.posting_date − PO.transaction_date) per supplier. **Label proxy.** | supplier | NEW (PR Item→PO join) | P1 |
| Fill Rate / Short-Supply | gauge | SUM(received_qty)/SUM(qty) × 100; short-supply value. | supplier | NEW (PO Item.qty/received_qty) | P1 |
| Avg Days to Pay (supplier) | KPI | scoped `get_average_payment_days`. | supplier | EXISTING (filter by supplier) | P1 |
| Supplier Outstanding & Ageing | stacked bar | current/1-30/>30 (full 30/60/90 = new buckets). | supplier×bucket | FREE `payment_group_summary` + NEW buckets | P1 |
| Monthly Spend by Top Suppliers | stacked bar | month × top-5 suppliers + Other. | month×supplier | NEW (month-bucket + supplier group) | P2 |
| New vs Repeat Suppliers | donut | NEW if MIN(transaction_date) in range. | classification | NEW (MIN per supplier) | P2 |
| On-Time Delivery % | KPI | % received lines with posting_date ≤ schedule_date. **Label "met required-by".** | supplier | NEW (PR Item→PO Item.schedule_date) | P2 |
| Supplier Category Coverage | heatmap | spend by (supplier, category); single-source flag. | supplier×category | NEW grouped SQL | P2 |
| Item Price Trend | line (per supplier) | PO Item.rate over time per supplier for an item. | time×supplier | NEW (PO Item rows) | P1 |
| Cross-Supplier Price Comparison | bar | latest rate per supplier for an item; min highlighted, % above min. | supplier | NEW (latest rate per item×supplier) | P1 |
| Composite Supplier Rating | gauge | weighted blend of lead-time/fill/on-time/pay. **Weights = new config.** | supplier | NEW (composite of above) | P3 |
| Quote vs Awarded savings | bar | quoted − awarded × qty. | item/supplier | **NEW-DATA** (Supplier Quotation, likely empty, §6) | P3 |

---

## 3. Reports Catalog

All reports are row-level, filterable, drill-through, exportable. Reuse `frontend/src/components/DataTable.tsx` for drill-downs (client-side, ~100-row cap); registers over thousands of rows need **server-side paging** (§7 gap). Backend: register/child-row reports need **new thin row-level whitelisted methods in `react_api.py`**; subtotals reuse `get_grouped_sum`/`get_grouped_count`.

| # | Report | Purpose | Key Columns | Filters | Group-by / Subtotals | Drill-through | Export | Priority |
|---|---|---|---|---|---|---|---|---|
| R1 | **Purchase Order Register** | Flagship PO log. | PO No., Date, Supplier, Project, Company, Category, Priority, Net, Tax, Grand Total, Tax Type, %Received, State, Owner | Date, Company, Project, Supplier, Category, Tax Type, State, Priority, Amount range | Supplier/Project/Company/Category subtotals + grand total | PO No. → PO detail | CSV (P1), XLSX, PDF | P1 |
| R2 | **Material Request Register** | Demand log. | MR No., Date, Required-by, Project, Category, Priority, Requester, State, %Ordered, Rejection remark | Date, Project, Category, Priority, State, Requester | Project/Category/Priority/Requester count + subtotal | MR No. → MR detail | CSV, XLSX, PDF | P1 |
| R3 | **GRN / Purchase Receipt Register** | Goods-inward log. | Receipt No., Posting Date, Supplier, Project, Company, Grand Total, Paid, Outstanding, Payment Status, %Received | Date, Company, Project, Supplier, Payment Status | Supplier/Project subtotal | Receipt → Receipt detail | CSV, XLSX, PDF | P1 |
| R4 | **Payment Register / Ledger** | Cash-out log. | Payment No., Date, Supplier, Project, Company, Receipt, Previous Paid, Amount, Outstanding After, Remark | Date, Company, Project, Supplier, Receipt, Amount range | Supplier/Project/Month sum(amount) | Payment → Payment detail; Receipt cell → Receipt | CSV, XLSX, PDF | P1 |
| R5 | **Outstanding & Ageing Report** | Money owed, aged. | Receipt, Supplier, Project, Posting Date, Days Outstanding, Total, Paid, Outstanding, Bucket 0-30/31-60/61-90/90+ | As-on date, Company, Project, Supplier, outstanding>0 toggle, Bucket, Ageing basis | Supplier (default)/Project, bucketed subtotals | Receipt → detail; supplier subtotal → Payment Register | CSV, XLSX (bucket cols), PDF | P1 |
| R6 | **Supplier Spend Analysis / Ledger** | Rank suppliers; concentration. | Supplier, PO Count, Total PO Value, %Spend, Cumulative %, Avg PO, Received, Paid, Outstanding, First/Last PO, New/Repeat | Date, Company, Project, Category, Min spend | Supplier (this IS the grouping) | Supplier → Scorecard / PO list | CSV, XLSX, PDF | P1 |
| R7 | **Project-wise Spend Report** | Cost roll-up per site. | Project, Group Company, PO Count, Committed, Received, Paid, Outstanding, Top Category | Date, Company, Project, Category | Project; category sub-rows | Project → PO Register filtered | CSV, XLSX, PDF | P1 |
| R8 | **Item Purchase History** | Per-item buying ledger. | Item Code, Name, PO No., Date, Supplier, Project, Qty, UOM, Rate (w/o tax), GST%, Rate w/tax, Amount | Item (primary), Date, Supplier, Project, Category | Item then chronological; Supplier sub-group | PO No. → detail | CSV, XLSX, PDF | P1 |
| R9 | **Payment Run Worklist** | What to pay now (actionable AP). | PR No., Supplier, Project, Company, Receipt Date, Due/Age, Total, Paid, Outstanding, Progress%, Last Payment, Status | Status, Company, Project, Supplier, Date, free-text search, Min outstanding | optional group by supplier (batch-pay) | Row → Receipt detail → Record Payment prefilled | CSV | P1 |
| R10 | **Supplier Statement of Account** | Per-supplier reconciliation letter. | Date, Particulars (PR/Payment No.), Project, Debit (PR total), Credit (Payment), Running Balance | Supplier (required), Date, Company, Project | single supplier chronological; opening/closing | line → source doc | PDF (primary), CSV, XLSX | P1 |
| R11 | **Open Commitments Register** | Ordered-not-received exposure. | PO No., Supplier, Project, PO Value, %Received, Open Commitment, Date, Days open, Status | Date, Company, Project, Supplier, exclude Closed/Stopped | Project / Supplier subtotal | PO → detail | CSV | P2 |
| R12 | **Category Spend Report** | Spend by material type. | Category, Sub-Category, PO Count, Total, %Spend, Avg Line Rate, Total GST | Date, Company, Project, Category, Sub-Category | Category → Sub-Category. **Sub-cat sparse.** | Category → PO Register | CSV, XLSX, PDF | P2 |
| R13 | **Item Price Comparison / Trend** | Min/max/latest/avg rate per item by supplier. | Item, Supplier, First/Latest/Min/Max/Wtd-Avg Rate, Last Purchase, PO Count, Latest GST% | Item (required), Date, Supplier, Project, UOM | Item → Supplier | → Item Purchase History | CSV, XLSX | P2 |
| R14 | **MR-to-PO Fulfilment / Short-Supply** | Requested vs ordered vs received per line. | MR No., Item, Project, Requested, Ordered, Received, Pending-to-order, Pending-to-receive, %Ordered, Status | Date, Project, Category, short-only toggle, State | MR then lines; project subtotal | qty cells → linked POs/PRs | CSV, XLSX | P2 |
| R15 | **GST Purchase Summary** | Tax-wise reconciliation. | Supplier, Tax Type, Taxable Value, CGST, SGST, IGST, Total Tax, Grand Total, PO Count | Date, Company, Supplier, Tax Type (3 values) | Supplier/Tax Type/Month subtotals | Supplier → PO Register | CSV, XLSX, PDF | P2 |
| R16 | **Buyer Performance & Workload** | Per-buyer scorecard. | Buyer, POs created, Value, Open POs, Avg %received, Pending approval, Avg approval→PO (proxy), Avg PO→receipt (proxy) | Date, Company, Project | Buyer | Buyer → Open-PO report | CSV | P2 |
| R17 | **Project Material Consumption Register** | Item-level per-project. | Item, Name, Category, Sub-Cat, Ordered Qty/Value, Received Qty/Value, Pending, Avg/Latest Rate, #lines | Project (required), Category, Sub-Cat, Date, Item search | Item within project; category L2 | Item → PO/PR lines | CSV, XLSX | P2 |
| R18 | **Supplier Performance Scorecard (multi)** | Rank suppliers on delivery. | Supplier, PO Count, Spend, Avg Lead Time, Fill Rate%, On-Time%, Short-Supply Value, Avg Days to Pay, Outstanding, Composite | Date, Project, Company, Category, Min PO count | Supplier | Row → single-supplier scorecard | CSV, PDF | P2 |
| R19 | **Supplier Category Coverage Matrix** | Map suppliers↔categories; single-source risk. | Supplier, Category, Spend, PO Count, #Suppliers in category, Single-Source flag | Date, Category, Project, Company | Category → Supplier (pivot) | single-source → supplier scorecard | CSV | P2 |
| R20 | **Pending Approvals Report** | Approval SLA worklist. | Type, Doc No., Raised On, Days Pending (proxy), Project, Party, Amount, Priority, State | Type, Company, Project, Priority, Min days | Type then Priority; count+value | Doc → detail w/ approve/reject | CSV | P2 |
| R21 | **Project × Category Spend Matrix** | Cross-tab for cost coding. | Project, one col per Category, Row Total | Company, Date | project × category two-key sum | Cell → PO list project+category | CSV | P2 |
| R22 | **Project Store / Warehouse Spend** | Procurement ↔ physical store. | Store, Linked Projects, Committed, Received, #POs, Top Category | Company, Date | store (coarse via Project Master.store_name) | Store → projects | CSV | P2 |
| R23 | **Day Book / Activity Log** | Chronological union of MR/PO/PR/Payment. | Date, Time, Doc Type, Doc No., Party, Project, Amount, Status, User | Date, Doc Type (multi), Company, Project, User | by Date then doc-type; daily subtotal | Doc → type-aware detail | CSV | P3 |
| R24 | **Days-to-Pay / DPO Analysis** | Settlement speed per supplier. | Supplier, Receipts Settled, Avg Days to Pay, Min/Max, Total Paid, Outstanding. **Label receipt-based, not invoice DPO.** | Company, Project, Date, Supplier | Supplier | per-receipt rows | CSV | P3 |
| R25 | **Project Cost Ledger (Committed/Received/Paid)** | Single export of full money flow per project. | Project, Company, Store, Committed, #POs, Received, Received%, Paid, Paid%, Outstanding, Overdue>30d, Open MRs, Open POs | Project, Company, Date, Category | project; roll up to company | Project → Project tab pre-filtered | CSV, PDF | P3 |
| R26 | **Project Budget vs Actual** | Budget control. | Project, Category, Budget, Committed Actual, Variance, Utilisation%, RAG | Project, Company, Fiscal period | project → category | over-budget rows flagged | CSV, XLSX | P3 (**NEW-DATA**) |
| R27 | **New Supplier Onboarding & Repeat** | Vendor-base churn. | Supplier, First-Ever PO, New/Repeat, PO Count, Spend, Lifetime Spend, Categories | Date, Company, Category, new-only | new/repeat then supplier | Supplier → Ledger | CSV | P3 |

---

## 4. Global Filters & UX

- **Shared filter bar** (sticky, top of `/dashboard` and `/reports`): **Date range** (default trailing 6 months), **Company** (Company Master / `custom_test_company_`), **Project** (Project Master), **Supplier**, **Category**. Tabs hide irrelevant filters (e.g. Supplier tab adds an item/supplier picker). Filters map straight to `get_*_dashboard_data(company, project, supplier, from_date, to_date, ...)` and to each report endpoint.
- **Drill-through:** every chart segment / table row deep-links to the existing SPA list/detail routes with query params (e.g. `/purchase-orders?project=…&supplier=…`), then onward through `doc_links` (MR→PO→PR→Payment). Dashboard KPIs link to the matching report.
- **Export:** **CSV hand-rolled in JS (zero dependency)** for all P1; **XLSX** via a new whitelisted endpoint using `frappe.utils.xlsxutils` (subtotal rows, frozen header); **PDF** via Frappe print framework for letterhead docs (Supplier Statement, GST sheet, Project cost sheet) — P2/P3.
- **Saved views:** per-user named filter presets persisted in `localStorage` for v1; promote to a lightweight "ProcureFlow Saved View" doctype if cross-device sync is wanted (P2).
- **Role-based default view:** index/landing and default dashboard tab chosen by the user's primary role (§5).
- **Formatting:** reuse `fmtMoney` (₹ en-IN), `fmtDate`, `daysUntil`, `parseServerError`; **add** `fmtPercent` and a **compact-INR formatter (Cr/L/K)** to `frontend/src/lib/format.ts` (both currently missing). Add **KPI/stat-tile CSS** (`.statgrid`/`.kpi`) to `pages.css` (none exists). All charts hand-rolled in SVG read DUX CSS vars (`--iris`, `--cyan`, `--ok`, `--pending`, `--err`, `--font-mono` tabular-nums) so they auto-theme.

---

## 5. Role-Based Access Matrix

Roles (verified from brief): **Requester/Supervisor** (creates MR + does PR), **Approver** ("Material Request Approval"), **Purchase Officer** (creates PO + records Payment), **PO Approver** (POs >₹50k), **Finance/Accounts**, **Owner/Admin** (System Manager).

| Surface | Requester/Supervisor | Approver | Purchase Officer | PO Approver | Finance | Owner/Admin |
|---|---|---|---|---|---|---|
| **Default landing** | MR list | Approvals | Operations tab | Approvals | Finance tab | Executive tab |
| Executive tab | — | — | view | view | view | ✔ |
| Operations tab | partial (own MRs) | view | ✔ | view | — | ✔ |
| Finance (AP) tab | — | — | partial (payments) | — | ✔ | ✔ |
| Project tab | own project(s) | view | ✔ | view | view | ✔ |
| Suppliers tab | — | — | ✔ | view | view (outstanding) | ✔ |
| **Reports** | | | | | | |
| R1–R3, R8, R11–R14, R16–R22 (procurement) | own docs | view | ✔ | view | view | ✔ |
| R4, R5, R9, R10, R15, R24 (finance) | — | — | partial | — | ✔ | ✔ |
| R6, R7, R18, R19, R25, R27 (spend/supplier mgmt) | — | — | ✔ | view | view | ✔ |
| R26 budget | — | — | — | — | view | ✔ |

Enforcement piggybacks on existing Frappe role permissions; the SPA only **hides** tabs/reports the role shouldn't default to — the backend whitelisted methods remain the security boundary (already role-gated by doctype permissions).

---

## 6. Data & Feature Gaps

**Computable today (no new data) — the vast majority:** all spend/trend/mix/Pareto/concentration cuts, outstanding & ageing (buckets are new *logic*, not new data), open commitments, settlement %, supplier lead time / fill rate / on-time / days-to-pay / price trend / cross-supplier comparison / new-vs-repeat, GST input (from PO tax rows), item & project consumption, cycle-time proxies, all 25 non-budget reports.

**Requires NEW DATA / masters (flag to stakeholders):**
1. **Budget master** — no budget/target/forecast anywhere. Budget-vs-actual (Project tab gauge, R26) needs a new submittable **Project Budget** doctype + **Project Budget Detail** child (material_category, budget_amount). Actuals come from existing PO/PR sums. ~1 doctype + 1 child + a join. Until then, render budget widgets as "set up budgets" empty states.
2. **Supplier Quotation data** — wired (`make_supplier_quotation`, DATE_FIELDS) but the React front-door never creates SQs → **almost certainly empty**. **Verify row counts live** before scoping any quote-vs-awarded savings / quote price-comparison. The Item Price Comparison we ship uses **actual PO rates** instead.
3. **Supplier ratings / quality / defect log** — none stored. Composite Supplier Rating can be **computed from existing delivery/payment metrics**, but its **weights/thresholds are a new business-config decision**; a persisted manual rating needs a new **Supplier Rating** doctype.
4. **Confirmed delivery dates** — only `schedule_date` (required-by) exists, no supplier-confirmed ETA. On-time % is "met required-by", not true OTIF.

**Metrics that exist but are PROXIES — must be labelled in UI:**
- **Avg PO/MR approval time & all cycle times** = `modified − creation` (overstated; `modified` changes on any edit). Mark "approx / directional"; a true metric needs a custom approved-on timestamp or version history.
- **"Total PO Value → current_month"** in `get_kpis` is mislabeled (== total). **Never render as "this month"; use `overview.mom_growth` for deltas.**
- **Overdue** is computed (posting_date < today−30 & outstanding>0), not stored; differs from PR `custom_payment_status` (Not Paid/Partially/Fully). Reports must **compute** Overdue.
- **Ageing / forecast** key off posting_date (no payment-term/due_date master) → "days since receipt", not "days overdue". Provide an ageing-basis toggle + subtitle disclaimer.
- **Avg Payment Days / DPO** is receipt-to-payment, not invoice-based (no invoice exists). Label "avg days to pay".
- **GST figures** are GST on POs, not filed ITC. `custom_tax_type` can hold an off-options 3rd value "Unregistered / No GST" — grouping must expect 3 strings.
- **Sub-category** sparsely populated on transactions (front-door sets category only) → header-field sub-cat cuts mostly empty; for accurate cuts join `Item.custom_sub_category` via item_code.
- **Open-commitment weighting** by per_received assumes value ∝ qty across lines (approximation when line rates differ).
- **`per_billed` always 0** — never build any billing/invoice KPI.

---

## 7. Tech Approach

**Charts — hand-rolled SVG, no library.** SPA deps are only react / react-dom / react-router-dom / frappe-react-sdk. All datasets are **pre-aggregated and small** (one value per month/supplier/category). Hand-roll bar / line / donut / stacked / funnel / gauge / Pareto-cumulative / heatmap as SVG components reading DUX CSS vars (auto-theming, **zero bundle cost**). **Avoid recharts** (pulls d3 sub-packages, bloats the tiny bundle); only revisit if interactive zoom/tooltips over many series become a hard requirement.

**Backend — reuse-first, thin wrappers second.**
- **Reuse as-is:** `get_procurement_dashboard_data` and `get_payment_tracking_dashboard_data` (the only two whitelisted fns, verified). Add their dotted paths to `frontend/src/lib/api.ts` and call via `useFrappeGetCall` ({ message: T } shape).
- **Surface FREE payloads** already computed but unrendered: `project_wise`, `category_wise`, `priority_wise`, `supplier_wise`, `top_supplier_share`, `total_period_spend`, `status_summary`, `outstanding_by_supplier`, `outstanding_by_project`, `insights`.
- **New thin wrappers in `react_api.py`** (reshape for React, reuse safe helpers `get_sum`/`get_grouped_sum`/`get_grouped_count`/`get_sql_where_clause`/`build_filters`/`first_existing_field` — these auto-apply `docstatus<2` and per-doctype project/company fallback): `exec_open_commitments`, `get_grouped_sum(...,'custom_test_company_')` (Spend by Company), `ap_ageing_summary` (4 buckets), `cash_outflow_trend`, `cash_forecast`, `gst_input_summary/register`, supplier scorecard set (lead time / fill rate / on-time / monthly-by-supplier / new-vs-repeat / category-coverage), item price trend/comparison, two-key project×category, child-table consumption aggregators, register row-level methods + XLSX/PDF export endpoints. Add a `company`/`project`/`date` filter param to `pending_approvals`/`approved_material_requests`/`receivable_pos` (today global); add `per_received`+`schedule_date` to `receivable_pos`; add `custom_priority`+`per_ordered` to `approved_material_requests`.

**Performance.**
- Aggregated dashboard payloads are cheap; keep the existing single-round-trip-per-tab pattern.
- **DataTable is client-side (~100-row cap).** Registers (PO/MR/Payment/worklist) over thousands of rows need **server-side paging** — add `limit`/`offset`/`order_by` to the new register endpoints and a paged table variant. Don't dump multi-thousand-row item-price ledgers client-side.
- Grouped-sum helpers interpolate `group_field`/`amount_field` into SQL (not parameterized) — fine for fixed internal field names; never expose arbitrary user-supplied group-by through them.
- Cache filter-option lists (companies/projects/suppliers) per session.

---

## 8. Phased Build Plan

### Phase P1 — High-value quick wins (mostly reuse) — ~2–3 weeks
**Frontend scaffold**
- [ ] Add `/dashboard` (tabbed) + `/reports` routes in `App.tsx`; 2 NAV entries in `AppShell.tsx`; role-based default landing. *(S)*
- [ ] Shared filter bar (date/company/project/supplier/category). *(M)*
- [ ] `fmtPercent` + compact-INR (Cr/L/K) in `format.ts`; KPI-tile CSS in `pages.css`; SVG chart primitives (bar, line, donut, funnel). *(M)*
- [ ] CSV export util (hand-rolled JS). *(S)*

**Backend (reuse + tiny adds)**
- [ ] Register 2 existing endpoints in `api.ts`; surface all FREE payloads. *(S)*
- [ ] `exec_open_commitments`; `get_grouped_sum(...,'custom_test_company_')`; `ap_ageing_summary` (4 buckets). *(M)*
- [ ] Add filters + fields to `receivable_pos` / `approved_material_requests`. *(S)*
- [ ] Row-level register methods (PO/MR/GRN/Payment) with server-side paging. *(M)*

**Dashboards/Reports shipped P1**
- [ ] Executive tab (all P1 widgets). Operations tab (funnel, action strip, approvals, status donuts, receipts-due, MR→PO backlog). Finance tab (outstanding, settlement %, ageing, overdue, avg-pay, supplier/project outstanding, status mix). Project tab core KPIs + funnel + trend + category + open pipeline + leaderboard + outstanding exposure. Suppliers tab P1 (active/spend/concentration/outstanding/Pareto/top-N/avg-days-to-pay/price trend/comparison).
- [ ] Reports R1–R10 (registers, ageing, supplier/project spend, item history, worklist, statement).

### Phase P2 — Deeper analytics + new wrappers — ~2–3 weeks
- [ ] Backend wrappers: `cash_outflow_trend`, `cash_forecast`, `gst_input_summary/register`, supplier scorecard set (lead time/fill/on-time/monthly-by-supplier/new-vs-repeat/category-coverage), item price comparison, two-key project×category, child-table consumption aggregator, buyer workload, cycle-time proxies. *(L)*
- [ ] XLSX export endpoint (`xlsxutils`, subtotals/frozen header). *(M)*
- [ ] Heatmap + stacked-bar + gauge + Pareto-cumulative SVG components. *(M)*
- [ ] Widgets: P2 across all tabs (category/sub-cat, payables-by-supplier, partial tracker, cash outflow/forecast, GST input, project pipeline load, buyer workload, supplier scorecard widgets, price intelligence). 
- [ ] Reports R11–R22.
- [ ] Saved views (localStorage). *(S)*

### Phase P3 — New data + polish — effort gated by product decisions
- [ ] **NEW-DATA: Project Budget + Project Budget Detail doctypes**; budget gauges + R26. *(M, needs product sign-off)*
- [ ] **Verify Supplier Quotation row counts live**; if populated, quote-vs-awarded savings widgets/reports. *(gated)*
- [ ] Composite Supplier Rating (config weights) ± optional Supplier Rating doctype. *(M, needs config decision)*
- [ ] PDF export via Frappe print (Supplier Statement, GST sheet, Project Cost Sheet). *(M)*
- [ ] Reports R23–R25, R27; remaining P3 widgets (oldest-pending, concentration gauge, priority mix, aging heatmap, active-projects count).
- [ ] Replace approval/cycle-time proxies with a real approved-on timestamp or version-history reader (removes the "approx" caveat). *(M)*

**Effort key:** S = ≤1 day, M = 2–4 days, L = ~1 week. Phase P1 is overwhelmingly reuse and ships the executive + AP + operations value with minimal backend risk.

---

### Key files to touch
- Backend: `procureflow/dashboard_api.py` (helpers + 2 endpoints, reuse), `procureflow/react_api.py` (new wrappers + register methods + `doc_links`), `procureflow/purchase_tax.py` (GST tax-row source).
- Frontend: `frontend/src/App.tsx`, `frontend/src/components/AppShell.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/format.ts`, `frontend/src/components/DataTable.tsx`, `frontend/src/styles/*.css`, new `frontend/src/pages/Dashboard.tsx` + `Reports.tsx` + chart components.

---

# 9. Principal Review Addendum (corrections — authoritative over the above where they conflict)

I've verified the load-bearing facts. The critical findings:

1. **`get_sql_where_clause` (line 266) only enforces `docstatus < 2`** — it includes drafts (docstatus 0) in spend sums. The spec never flags this. Spend/PO-value KPIs include unsubmitted draft POs.
2. **All aggregation uses raw `frappe.db.sql` and `frappe.get_all`** (12 occurrences) — both bypass row-level/user-permission. The spec's §5 claim that "backend whitelisted methods remain the security boundary (already role-gated by doctype permissions)" is **false** for the dashboard layer.
3. **GST classification by `account_head`** is feasible — tax rows carry CGST/SGST/IGST account heads and `tax_amount` (confirmed react_api.py:644).
4. **`top_supplier_share` divides top-5-limited supplier total** — the Pareto/concentration math is sound but `total_period_spend` includes drafts.

Here is my review.

---

# ProcureFlow Dashboards & Reports — Principal Review Addendum

Verified against `procureflow/dashboard_api.py`, `react_api.py`, `purchase_tax.py`. The spec is unusually well-grounded; most reuse claims hold. But it has **one systemic correctness bug it never names** (drafts in spend), **one false security claim** (dashboards are not permission-gated), and **over-weights breadth in P1**. Prioritized lists below.

## FIX (correctness/security — do before shipping any P1 widget)

1. **Draft POs pollute every spend number.** `get_sql_where_clause` enforces only `docstatus < 2` (dashboard_api.py:266), so docstatus=0 drafts are summed into Total Spend, MoM trend, top suppliers, project/category/company cuts, Pareto, and concentration. The SPA *creates* POs as Draft (react_api.py:530). Every Executive/Supplier widget overstates spend. **Fix: add `docstatus = 1` (not `< 2`) for all value aggregations**, or expose a "committed (submitted) vs draft" toggle. This is not a labeling nuance — it is wrong numbers on the boardroom tab.
2. **Dashboards are NOT permission-gated — §5's security claim is false.** All aggregation is `frappe.db.sql` / `frappe.get_all` (no `ignore_permissions` needed — `get_all` already ignores *user* permissions and the SQL path has no perm check at all). A Supervisor hitting `get_procurement_dashboard_data` sees **all-company, all-project spend**. The spec says "the backend whitelisted methods remain the security boundary (already role-gated)" — they are not. **Fix: either (a) inject a mandatory project/company scope derived from the user's User-Permissions server-side, or (b) accept that any logged-in role sees group-wide totals and get explicit owner sign-off.** This is the single highest risk item and must be resolved before the Suppliers/Executive tabs ship.
3. **Outstanding math silently trusts PR `grand_total` with no cancelled-payment guard at the PR level.** Paid sums correctly filter `docstatus=1` (line 1041), but cancelled *PRs* (docstatus 2) — if any exist — are excluded by `build_filters`, good; however a PR whose linked PO was amended can double-count committed vs received. Low frequency, but **add a reconciliation note**: outstanding = PR grand_total − Σ(paid, docstatus=1), and PR cancellation must cascade. Verify no orphan payments exist against cancelled PRs.
4. **`total_po_value.current_month == total`** (line 306) is not just "mislabeled" as the spec says — it is **actively wrong data shipped in the payload**. Don't soften to "never render as this month"; **delete the field** so no future dev wires it.
5. **`top_supplier_share` uses a top-5-capped numerator over full-period denominator** (analytics: `get_top_suppliers` limit=5 → `top_supplier_share`). The #1 share is fine, but if reused for "top-N share" it breaks. Keep it strictly #1-only as written.

## ADD (missing widgets/reports — real construction-buying gaps)

1. **GRN-vs-PO price/qty variance** (NEW). You receive PR Item.rate and PO Item.rate; flag lines where received rate ≠ ordered rate, or received_qty > ordered_qty (over-receipt). Construction sites over-receive constantly. Feasible today (PR Item → PO Item join). Higher value than half the P2 supplier widgets.
2. **Rate escalation / same-item price drift over time** (NEW, P1). Cement/steel/rebar prices move monthly; a "this item is now X% above its 6-month-ago rate" alert is the single most-wanted construction-procurement metric. Data exists (PO Item.rate + transaction_date). The spec has "Item Price Trend" but buries it; **promote to a headline Executive alert tile.**
3. **Over-ordering vs MR** (NEW). MR Item.stock_qty vs Σ(PO Item.stock_qty) per line — ordered beyond requested. The spec has "MR→PO fulfilment / short-supply" (R14) but only frames *short*; add the *over* direction.
4. **Project cost-to-date vs same-period-last-project / run-rate** (FREE-ish). Even without a budget master, a "committed run-rate per month" and "% of total group spend" per project gives PMs a control number. Cheap.
5. **Duplicate / split-PO detection** (NEW, governance). Same supplier + same item + same week across multiple sub-50k POs = the classic approval-threshold-dodge (POs ≤50k auto-place per the role model). Worth a P2 audit report.
6. **GST reconciliation by tax-type completeness** (NEW). `custom_tax_type` can be the off-options 3rd value "Unregistered / No GST" (purchase_tax.py:26) and uniform-vs-mixed lines produce *either* "On Net Total" *or* "Actual" tax rows (purchase_tax.py:283). A GST report must sum `tax_amount` by account-head classification (CGST/SGST/IGST), **not** by `rate` — confirmed the data supports it (react_api.py:644). Add an explicit "POs missing tax_type" exception row.

## RESEQUENCE (P1 is too broad for the effort claim)

The spec's P1 ships ~40 widgets + 10 reports in "2–3 weeks." That is unrealistic given charts are hand-rolled SVG from zero. Re-tier P1 to **highest value-per-effort that is also correct after the FIX list**:

- **Promote to P1-core (week 1):** the FIX items (#1 draft filter, #2 scoping) — non-negotiable; Executive spend KPIs + MoM trend + monthly bar (pure reuse); Finance outstanding/ageing/settlement (reuse, and it's the metric with no draft-pollution risk since it keys off submitted PRs); Operations action-queue strip + approvals table (reuse, daily-driver value); **R1 PO Register + R9 Payment Run Worklist** (the two reports people will actually open).
- **Demote to P2:** Supplier Pareto/concentration/price-comparison/lead-time/fill-rate (all NEW joins, none reuse — the spec wrongly tags several as EXISTING when they need new endpoints), Project tab consumption aggregators, heatmaps, funnels.
- **Rationale:** dashboard_api.py already exists, so the *reuse* widgets are genuinely cheap — but they cluster in Executive + Finance + Operations. The Supplier and Project tabs are mostly NEW backend and should not be in P1.

## DROP (or hard-gate — don't build on sand)

1. **All cycle-time / approval-time widgets** (avg PO approval, MR approval lag, approval→PO). `get_avg_po_approval_time` uses `modified − creation` (dashboard_api.py:738); `modified` bumps on *any* edit, incl. post-approval receipt updates. This isn't "directional" — for submitted docs that later get received/amended it's **systematically inflated and uncorrelated with real approval time.** Drop until a real approved-on timestamp exists (Version doctype read or a custom field). Shipping it labeled "approx" still erodes trust.
2. **Quote-vs-awarded savings (R26-area, Suppliers tab)** — **verify Supplier Quotation row count live first** (the spec says so but still scopes widgets). The React front-door never creates SQs; near-certainly empty. Don't reserve UI for it; show "not in use."
3. **Composite Supplier Rating** — drop from any phase until weights are a signed business decision; a computed blend with invented weights is worse than no rating.
4. **Budget-vs-Actual (R26, Project gauge)** — correctly P3/NEW-DATA, but **don't render empty gauges**; hide the widget until a Project Budget master exists, else every project shows a broken 0%.
5. **"DPO" framing anywhere** — there is no invoice (`per_billed` always 0). It's days-from-receipt-to-payment. Keep the metric, **drop the DPO label** entirely (not just "label as proxy").

## One structural note
The spec's "85–90% reuse" is true **only for the Executive + Finance + Operations tabs.** Suppliers and Project tabs are ~60% NEW backend despite EXISTING/FREE tags in §2D/§2E (e.g. lead time, fill rate, on-time, price comparison, two-key heatmaps all need new endpoints). Re-tag those honestly before estimating, or the P2 effort will blow out.

**Files that must change for the two FIX blockers:** `procureflow/dashboard_api.py` (`get_sql_where_clause` docstatus filter; remove `current_month`; add user-permission scoping in `build_filters` or a new guard) before any `react_api.py` wrappers or frontend work begins.