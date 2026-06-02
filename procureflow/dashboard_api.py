import calendar
from collections import defaultdict

import frappe
from frappe.utils import add_days, flt, get_datetime, get_first_day, get_last_day, getdate, nowdate


DATE_FIELDS = {
    "Material Request": "transaction_date",
    "Supplier Quotation": "transaction_date",
    "Purchase Order": "transaction_date",
    "Purchase Receipt": "posting_date",
    "Procureflow Payment Entry": "payment_date",
}

PROJECT_FIELDS = {
    "Material Request": ("custom_project_name", "custom_select_project_", "project"),
    "Supplier Quotation": ("custom_project_name", "project"),
    "Purchase Order": ("custom_project_name", "project"),
    "Purchase Receipt": ("custom_project_name", "project"),
}

COMPANY_FIELDS = {
    "Material Request": ("company",),
    "Supplier Quotation": ("company",),
    "Purchase Order": ("company", "custom_test_company_"),
    "Purchase Receipt": ("company", "custom_test_company_"),
}


@frappe.whitelist()
def get_procurement_dashboard_data(company=None, project=None, month=None, from_date=None, to_date=None):
    filters = get_dashboard_filters(company=company, project=project, month=month, from_date=from_date, to_date=to_date)
    outstanding_breakdown = get_outstanding_breakdown(filters)

    return {
        "filters": filters,
        "filter_options": get_filter_options(),
        "kpis": get_kpis(filters, outstanding_breakdown),
        "overview": get_overview(filters),
        "operations": get_operations(filters),
        "payment_tracking": get_payment_tracking(filters),
        "outstanding_breakdown": outstanding_breakdown,
        "analytics": get_analytics(filters),
    }


@frappe.whitelist()
def ensure_procurement_dashboard_page():
    page_name = "procurement-dashboard"
    values = {
        "doctype": "Page",
        "name": page_name,
        "page_name": page_name,
        "title": "Procurement Dashboard",
        "module": "Procure Flow",
        "standard": "Yes",
        "system_page": 0,
    }

    if frappe.db.exists("Page", page_name):
        frappe.db.set_value("Page", page_name, {
            "title": values["title"],
            "module": values["module"],
            "standard": values["standard"],
            "system_page": values["system_page"],
        })
        action = "updated"
    else:
        frappe.get_doc(values).insert(ignore_permissions=True)
        action = "created"

    frappe.db.commit()
    return {"page": page_name, "action": action}


def get_dashboard_filters(company=None, project=None, month=None, from_date=None, to_date=None):
    if month:
        month_start = getdate(f"{month}-01")
        from_date = from_date or month_start
        to_date = to_date or get_last_day(month_start)

    if not from_date and not to_date:
        current = getdate(nowdate())
        from_date = get_first_day(add_months(current, -5))
        to_date = current
    elif not from_date or not to_date:
        current = getdate(nowdate())
        from_date = from_date or get_first_day(current)
        to_date = to_date or current

    return {
        "company": company or "",
        "project": project or "",
        "month": month or str(getdate(from_date))[:7],
        "from_date": str(getdate(from_date)),
        "to_date": str(getdate(to_date)),
    }


def doctype_exists(doctype):
    try:
        return bool(frappe.db.exists("DocType", doctype))
    except Exception:
        return False


def has_field(doctype, fieldname):
    try:
        return bool(frappe.get_meta(doctype).has_field(fieldname) or fieldname in ("name", "docstatus", "owner", "creation", "modified"))
    except Exception:
        return False


def first_existing_field(doctype, candidates):
    for fieldname in candidates:
        if has_field(doctype, fieldname):
            return fieldname
    return None


def get_amount_field(doctype):
    return first_existing_field(doctype, ("base_grand_total", "grand_total", "rounded_total", "total", "amount"))


def get_purchase_receipt_total(row):
    return flt(row.get("rounded_total")) or flt(row.get("grand_total")) or flt(row.get("base_grand_total"))


def get_dashboard_date_field(doctype, date_field=None):
    preferred = date_field or DATE_FIELDS.get(doctype)
    if preferred and has_field(doctype, preferred):
        return preferred
    return "creation" if has_field(doctype, "creation") else None


def get_date_range_values(fieldname, dashboard_filters):
    from_date = dashboard_filters["from_date"]
    to_date = dashboard_filters["to_date"]
    if fieldname in ("creation", "modified"):
        return [f"{from_date} 00:00:00", f"{to_date} 23:59:59"]
    return [from_date, to_date]


def build_filters(doctype, dashboard_filters, date_field=None, include_date=True):
    filters = {}
    resolved_date_field = get_dashboard_date_field(doctype, date_field)

    if include_date and resolved_date_field:
        filters[resolved_date_field] = ["between", get_date_range_values(resolved_date_field, dashboard_filters)]

    company = dashboard_filters.get("company")
    if company:
        company_field = first_existing_field(doctype, COMPANY_FIELDS.get(doctype, ("company",)))
        if company_field:
            filters[company_field] = company

    project = dashboard_filters.get("project")
    if project:
        project_field = first_existing_field(doctype, PROJECT_FIELDS.get(doctype, ("project",)))
        if project_field:
            filters[project_field] = project

    return filters


def get_list_safe(doctype, **kwargs):
    if not doctype_exists(doctype):
        return []
    try:
        return frappe.get_list(doctype, **kwargs)
    except Exception:
        frappe.log_error(frappe.get_traceback(), f"ProcureFlow dashboard query failed: {doctype}")
        return []


def get_all_safe(doctype, **kwargs):
    if not doctype_exists(doctype):
        return []
    try:
        return frappe.get_all(doctype, **kwargs)
    except Exception:
        frappe.log_error(frappe.get_traceback(), f"ProcureFlow dashboard aggregate failed: {doctype}")
        return []


def get_count(doctype, filters):
    if not doctype_exists(doctype):
        return 0
    try:
        return frappe.db.count(doctype, filters=filters)
    except Exception:
        return len(get_list_safe(doctype, filters=filters, fields=["name"], limit_page_length=10000))


def normalize_status(row):
    status = row.get("workflow_state") or row.get("status")
    if status:
        return str(status)
    docstatus = row.get("docstatus")
    if docstatus == 1:
        return "Submitted"
    if docstatus == 2:
        return "Cancelled"
    return "Draft"


def status_bucket(status):
    value = (status or "").strip().lower()
    if "reject" in value or "cancel" in value:
        return "rejected"
    if value in ("approved", "submitted", "completed", "closed", "to bill", "to receive and bill", "to receive"):
        return "approved"
    if "complete" in value or "approved" in value:
        return "approved"
    if "pending" in value or "draft" in value or "open" in value or "approval" in value:
        return "pending"
    return "pending"


def get_status_counts(doctype, dashboard_filters):
    base_filters = build_filters(doctype, dashboard_filters)
    fields = ["name", "docstatus"]
    for candidate in ("status", "workflow_state"):
        if has_field(doctype, candidate):
            fields.append(candidate)

    rows = get_list_safe(doctype, filters=base_filters, fields=fields, limit_page_length=10000)
    counts = {"total": get_count(doctype, base_filters), "approved": 0, "pending": 0, "rejected": 0}

    for row in rows:
        bucket = status_bucket(normalize_status(row))
        if bucket == "approved":
            counts["approved"] += 1
        elif bucket == "rejected":
            counts["rejected"] += 1
        else:
            counts["pending"] += 1

    if counts["total"] and counts["total"] > len(rows):
        counts["pending"] += counts["total"] - len(rows)

    return counts


def get_sum(doctype, fieldname, filters):
    if not fieldname or not doctype_exists(doctype):
        return 0
    try:
        where_clause, values = get_sql_where_clause(doctype, filters)
        rows = frappe.db.sql(
            f"select coalesce(sum(`{fieldname}`), 0) as value from `tab{doctype}` where {where_clause}",
            values,
            as_dict=True,
        )
        return flt(rows[0].get("value")) if rows else 0
    except Exception:
        frappe.log_error(frappe.get_traceback(), f"ProcureFlow dashboard sum failed: {doctype}.{fieldname}")
        return 0


def get_sql_where_clause(doctype, filters):
    clauses = []
    values = {}

    if has_field(doctype, "docstatus"):
        clauses.append("`docstatus` < 2")

    for index, (fieldname, value) in enumerate((filters or {}).items()):
        if not has_field(doctype, fieldname):
            continue

        key = f"f{index}"
        if isinstance(value, (list, tuple)) and value:
            operator = str(value[0]).lower()
            if operator == "between" and len(value) > 1 and len(value[1]) == 2:
                clauses.append(f"`{fieldname}` between %({key}_from)s and %({key}_to)s")
                values[f"{key}_from"] = value[1][0]
                values[f"{key}_to"] = value[1][1]
            elif operator == "in" and len(value) > 1:
                clauses.append(f"`{fieldname}` in %({key})s")
                values[key] = tuple(value[1])
        else:
            clauses.append(f"`{fieldname}` = %({key})s")
            values[key] = value

    return " and ".join(clauses or ["1=1"]), values


def get_kpis(filters, outstanding_breakdown=None):
    mr_counts = get_status_counts("Material Request", filters)
    po_counts = get_status_counts("Purchase Order", filters)
    pr_counts = get_purchase_receipt_counts(filters)
    po_amount_field = get_amount_field("Purchase Order")
    po_filters = build_filters("Purchase Order", filters)
    total_po_value = get_sum("Purchase Order", po_amount_field, po_filters)

    payment_summary = get_payment_summary(filters, outstanding_breakdown)

    return {
        "material_requests": mr_counts,
        "purchase_orders": po_counts,
        "purchase_receipts": pr_counts,
        "total_po_value": {
            "total": total_po_value,
            "current_month": total_po_value,
        },
        "outstanding_amount": payment_summary,
    }


def get_purchase_receipt_counts(filters):
    base_filters = build_filters("Purchase Receipt", filters)
    fields = ["name", "docstatus"]
    if has_field("Purchase Receipt", "status"):
        fields.append("status")
    if has_field("Purchase Receipt", "posting_date"):
        fields.append("posting_date")
    if has_field("Purchase Receipt", "due_date"):
        fields.append("due_date")

    rows = get_list_safe("Purchase Receipt", filters=base_filters, fields=fields, limit_page_length=10000)
    today = getdate(nowdate())
    counts = {"total": get_count("Purchase Receipt", base_filters), "completed": 0, "pending": 0, "overdue": 0}

    for row in rows:
        status = normalize_status(row).lower()
        if row.get("docstatus") == 1 or "complete" in status or "closed" in status:
            counts["completed"] += 1
        else:
            counts["pending"] += 1
        due_date = row.get("due_date") or row.get("posting_date")
        if due_date and getdate(due_date) < add_days(today, -30) and row.get("docstatus") != 1:
            counts["overdue"] += 1

    if counts["total"] and counts["total"] > len(rows):
        counts["pending"] += counts["total"] - len(rows)

    return counts


def get_payment_summary(filters, breakdown=None):
    breakdown = breakdown or get_outstanding_breakdown(filters)
    return {
        "total": breakdown.get("total_outstanding"),
        "overdue": breakdown.get("over_30_days_outstanding"),
        "pending": breakdown.get("pending_outstanding"),
        "partial": breakdown.get("partial_outstanding"),
        "over_30_days": breakdown.get("over_30_days_outstanding"),
    }


def get_outstanding_breakdown(filters):
    rows = get_receipt_payment_rows(filters, limit=10000)
    supplier_totals = defaultdict(float)
    project_totals = defaultdict(float)
    today = getdate(nowdate())
    totals = {
        "total_outstanding": 0,
        "pending_outstanding": 0,
        "partial_outstanding": 0,
        "over_30_days_outstanding": 0,
        "top_supplier": "",
        "top_supplier_outstanding": 0,
        "top_project": "",
        "top_project_outstanding": 0,
        "receipt_count": 0,
        "pending_count": 0,
        "partial_count": 0,
    }

    for row in rows:
        outstanding = flt(row.get("outstanding_amount"))
        if outstanding <= 0:
            continue

        paid_amount = flt(row.get("paid_amount"))
        supplier = row.get("supplier") if row.get("supplier") not in ("", "-") else "Not Set"
        project = row.get("project") if row.get("project") not in ("", "-") else "Not Set"
        age_date = row.get("posting_date") or row.get("creation")

        totals["receipt_count"] += 1
        totals["total_outstanding"] += outstanding

        if paid_amount > 0:
            totals["partial_outstanding"] += outstanding
            totals["partial_count"] += 1
        else:
            totals["pending_outstanding"] += outstanding
            totals["pending_count"] += 1

        if age_date and getdate(age_date) < add_days(today, -30):
            totals["over_30_days_outstanding"] += outstanding

        supplier_totals[supplier] += outstanding
        project_totals[project] += outstanding

    if supplier_totals:
        top_supplier, supplier_outstanding = max(supplier_totals.items(), key=lambda item: item[1])
        totals["top_supplier"] = top_supplier
        totals["top_supplier_outstanding"] = supplier_outstanding

    if project_totals:
        top_project, project_outstanding = max(project_totals.items(), key=lambda item: item[1])
        totals["top_project"] = top_project
        totals["top_project_outstanding"] = project_outstanding

    return totals


def get_receipt_payment_rows(filters, limit=20):
    if not doctype_exists("Purchase Receipt"):
        return []

    pr_fields = ["name", "supplier", "docstatus"]
    for fieldname in ("posting_date", "due_date", "creation", "rounded_total", "grand_total", "base_grand_total", "custom_project_name", "project"):
        if has_field("Purchase Receipt", fieldname):
            pr_fields.append(fieldname)

    receipts = get_list_safe(
        "Purchase Receipt",
        filters=build_filters("Purchase Receipt", filters),
        fields=pr_fields,
        order_by="modified desc",
        limit_page_length=limit,
    )

    names = [row.name for row in receipts]
    paid_map = get_paid_amounts(names)
    today = getdate(nowdate())
    rows = []

    for row in receipts:
        total = get_purchase_receipt_total(row)
        paid = flt(paid_map.get(row.name, {}).get("paid_amount"))
        outstanding = max(total - paid, 0)
        due_date = row.get("due_date") or row.get("posting_date")
        is_overdue = bool(outstanding and due_date and getdate(due_date) < add_days(today, -30))
        if outstanding <= 0:
            payment_status = "Paid"
        elif paid > 0:
            payment_status = "Partial"
        else:
            payment_status = "Pending"

        rows.append({
            "purchase_receipt": row.name,
            "supplier": row.get("supplier") or "-",
            "project": row.get("custom_project_name") or row.get("project") or "-",
            "total_amount": total,
            "paid_amount": paid,
            "outstanding_amount": outstanding,
            "payment_status": payment_status,
            "payment_date": paid_map.get(row.name, {}).get("payment_date") or "",
            "posting_date": row.get("posting_date") or "",
            "creation": row.get("creation") or "",
            "is_overdue": is_overdue,
        })

    return rows


def get_paid_amounts(receipt_names):
    if not receipt_names or not doctype_exists("Procureflow Payment Entry"):
        return {}
    if not has_field("Procureflow Payment Entry", "purchase_receipt") or not has_field("Procureflow Payment Entry", "amount"):
        return {}

    date_select = "null as payment_date"
    if has_field("Procureflow Payment Entry", "payment_date"):
        date_select = "max(`payment_date`) as payment_date"

    try:
        rows = frappe.db.sql(
            f"""
            select purchase_receipt,
                   coalesce(sum(amount), 0) as paid_amount,
                   {date_select}
            from `tabProcureflow Payment Entry`
            where purchase_receipt in %(receipt_names)s
              and docstatus = 1
            group by purchase_receipt
            """,
            {"receipt_names": tuple(receipt_names)},
            as_dict=True,
        )
    except Exception:
        frappe.log_error(frappe.get_traceback(), "ProcureFlow dashboard paid amount query failed")
        return {}

    return {row.purchase_receipt: row for row in rows}


def get_overview(filters):
    from_date = getdate(filters["from_date"])
    to_date = getdate(filters["to_date"])
    start_month = get_first_day(from_date)
    end_month = get_first_day(to_date)
    months = []
    po_amount_field = get_amount_field("Purchase Order")
    max_value = 0
    cursor = start_month

    while cursor <= end_month:
        month_start = cursor
        month_end = get_last_day(month_start)
        range_start = max(month_start, from_date)
        range_end = min(month_end, to_date)
        month_filters = build_filters("Purchase Order", filters)
        date_field = get_dashboard_date_field("Purchase Order")
        if date_field:
            month_filters[date_field] = ["between", get_date_range_values(date_field, {
                "from_date": str(range_start),
                "to_date": str(range_end),
            })]
        value = get_sum("Purchase Order", po_amount_field, month_filters)
        max_value = max(max_value, value)
        months.append({
            "label": f"{calendar.month_abbr[month_start.month]} - {month_start.year}",
            "month": str(month_start)[:7],
            "value": value,
            "is_current": month_start == end_month,
        })
        cursor = add_months(cursor, 1)

    for row in months:
        row["percent"] = 8 if not max_value else max(8, round((row["value"] / max_value) * 100, 1))

    current = months[-1]["value"] if months else 0
    previous = months[-2]["value"] if len(months) > 1 else 0
    growth = 0 if not previous else ((current - previous) / previous) * 100
    period_total = sum(row["value"] for row in months)

    return {
        "monthly_po_value": months,
        "total_ytd": period_total,
        "period_total": period_total,
        "mom_growth": growth,
        "growth": growth,
        "avg_monthly": period_total / len(months) if months else 0,
    }

def add_months(date_obj, months):
    month = date_obj.month - 1 + months
    year = date_obj.year + month // 12
    month = month % 12 + 1
    day = min(date_obj.day, calendar.monthrange(year, month)[1])
    return getdate(f"{year}-{month:02d}-{day:02d}")


def get_recent(doctype, filters, field_map, limit=5):
    fields = ["name", "docstatus"]
    for fieldname in field_map.values():
        if fieldname and fieldname not in fields and has_field(doctype, fieldname):
            fields.append(fieldname)
    for candidate in ("status", "workflow_state"):
        if has_field(doctype, candidate) and candidate not in fields:
            fields.append(candidate)

    rows = get_list_safe(
        doctype,
        filters=build_filters(doctype, filters),
        fields=fields,
        order_by="modified desc",
        limit_page_length=limit,
    )

    result = []
    for row in rows:
        item = {"name": row.name, "status": normalize_status(row)}
        for key, fieldname in field_map.items():
            item[key] = row.get(fieldname) if fieldname else None
        result.append(item)
    return result


def get_operations(filters):
    po_amount_field = get_amount_field("Purchase Order")
    return {
        "material_requests": get_recent(
            "Material Request",
            filters,
            {
                "project": first_existing_field("Material Request", PROJECT_FIELDS["Material Request"]),
                "priority": first_existing_field("Material Request", ("custom_priority", "priority")),
            },
        ),
        "purchase_orders": get_recent(
            "Purchase Order",
            filters,
            {
                "supplier": "supplier" if has_field("Purchase Order", "supplier") else None,
                "value": po_amount_field,
            },
        ),
        "top_suppliers": get_top_suppliers(filters),
    }


def get_top_suppliers(filters):
    amount_field = get_amount_field("Purchase Order")
    if not amount_field or not has_field("Purchase Order", "supplier"):
        return []
    rows = get_grouped_sum("Purchase Order", filters, "supplier", limit=5)
    max_value = max([flt(row.get("total")) for row in rows] or [0])
    return [
        {
            "supplier": row.get("label") or "Unknown Supplier",
            "total": flt(row.get("total")),
            "percent": 0 if not max_value else round((flt(row.get("total")) / max_value) * 100, 1),
        }
        for row in rows
    ]


def get_payment_tracking(filters):
    return get_receipt_payment_rows(filters, limit=10)


def get_analytics(filters):
    po_amount_field = get_amount_field("Purchase Order")
    po_filters = build_filters("Purchase Order", filters)
    period_spend = get_sum("Purchase Order", po_amount_field, po_filters)
    top_suppliers = get_top_suppliers(filters)
    top_supplier_total = flt(top_suppliers[0].get("total")) if top_suppliers else 0

    return {
        "mr_to_po_conversion": get_mr_to_po_conversion(filters),
        "avg_po_approval_time": get_avg_po_approval_time(filters),
        "outstanding_over_30_days": get_outstanding_over_30_days(filters),
        "total_period_spend": {"value": period_spend},
        "top_supplier_share": {
            "value": 0 if not period_spend else (top_supplier_total / period_spend) * 100,
            "supplier": top_suppliers[0].get("supplier") if top_suppliers else "",
            "total": top_supplier_total,
        },
        "project_wise": get_grouped_sum("Purchase Order", filters, first_existing_field("Purchase Order", PROJECT_FIELDS["Purchase Order"])),
        "category_wise": get_grouped_sum("Purchase Order", filters, first_existing_field("Purchase Order", ("custom_category", "category"))),
        "priority_wise": get_grouped_count("Material Request", filters, first_existing_field("Material Request", ("custom_priority", "priority"))),
        "supplier_wise": get_grouped_sum("Purchase Order", filters, "supplier" if has_field("Purchase Order", "supplier") else None),
    }


def get_mr_to_po_conversion(filters):
    mr_total = get_count("Material Request", build_filters("Material Request", filters))
    linked_po_count = get_linked_purchase_order_count(filters)
    po_total = get_count("Purchase Order", build_filters("Purchase Order", filters))
    converted = linked_po_count if linked_po_count is not None else po_total
    percentage = 0 if not mr_total else min(100, (converted / mr_total) * 100)
    return {"value": percentage, "converted": converted, "material_requests": mr_total, "fallback": linked_po_count is None}


def get_linked_purchase_order_count(filters):
    child_doctype = "Purchase Order Item"
    if not doctype_exists(child_doctype) or not has_field(child_doctype, "material_request") or not has_field(child_doctype, "parent"):
        return None

    purchase_orders = get_list_safe(
        "Purchase Order",
        filters=build_filters("Purchase Order", filters),
        fields=["name"],
        limit_page_length=5000,
    )
    names = [row.name for row in purchase_orders]
    if not names:
        return 0

    try:
        rows = frappe.db.sql(
            """
            select count(distinct parent) as value
            from `tabPurchase Order Item`
            where parent in %(names)s
              and material_request is not null
              and material_request != ''
            """,
            {"names": tuple(names)},
            as_dict=True,
        )
        value = int(rows[0].get("value") or 0) if rows else 0
        return value or None
    except Exception:
        frappe.log_error(frappe.get_traceback(), "ProcureFlow dashboard MR to PO conversion failed")
        return None

def get_avg_po_approval_time(filters):
    fields = ["name", "creation", "modified", "docstatus"]
    for candidate in ("status", "workflow_state"):
        if has_field("Purchase Order", candidate):
            fields.append(candidate)
    rows = get_list_safe(
        "Purchase Order",
        filters=build_filters("Purchase Order", filters),
        fields=fields,
        limit_page_length=5000,
    )
    durations = []
    for row in rows:
        if status_bucket(normalize_status(row)) != "approved":
            continue
        created = get_datetime(row.get("creation")) if row.get("creation") else None
        approved = get_datetime(row.get("modified")) if row.get("modified") else None
        if created and approved and approved >= created:
            durations.append((approved - created).total_seconds() / 86400)
    value = sum(durations) / len(durations) if durations else 0
    return {"value": value, "count": len(durations)}


def get_outstanding_over_30_days(filters):
    cutoff = getdate(add_days(nowdate(), -30))
    total = 0
    count = 0
    for row in get_receipt_payment_rows(filters, limit=5000):
        outstanding = flt(row.get("outstanding_amount"))
        receipt_date = row.get("posting_date") or row.get("creation")
        if outstanding > 0 and receipt_date and getdate(receipt_date) < cutoff:
            total += outstanding
            count += 1
    return {"value": total, "count": count}


def get_grouped_sum(doctype, filters, group_field, limit=5):
    amount_field = get_amount_field(doctype)
    if not group_field or not amount_field:
        return []
    try:
        where_clause, values = get_sql_where_clause(doctype, build_filters(doctype, filters))
        values["limit"] = int(limit)
        rows = frappe.db.sql(
            f"""
            select coalesce(`{group_field}`, 'Not Set') as label,
                   coalesce(sum(`{amount_field}`), 0) as value,
                   coalesce(sum(`{amount_field}`), 0) as total
            from `tab{doctype}`
            where {where_clause}
            group by `{group_field}`
            order by value desc
            limit %(limit)s
            """,
            values,
            as_dict=True,
        )
    except Exception:
        frappe.log_error(frappe.get_traceback(), f"ProcureFlow dashboard grouped sum failed: {doctype}.{group_field}")
        rows = []
    return [{"label": row.get("label") or "Not Set", "value": flt(row.get("value")), "total": flt(row.get("total"))} for row in rows]


def get_grouped_count(doctype, filters, group_field, limit=5):
    if not group_field:
        return []
    try:
        where_clause, values = get_sql_where_clause(doctype, build_filters(doctype, filters))
        values["limit"] = int(limit)
        rows = frappe.db.sql(
            f"""
            select coalesce(`{group_field}`, 'Not Set') as label,
                   count(name) as value
            from `tab{doctype}`
            where {where_clause}
            group by `{group_field}`
            order by value desc
            limit %(limit)s
            """,
            values,
            as_dict=True,
        )
    except Exception:
        frappe.log_error(frappe.get_traceback(), f"ProcureFlow dashboard grouped count failed: {doctype}.{group_field}")
        rows = []
    return [{"label": row.get("label") or "Not Set", "value": flt(row.get("value"))} for row in rows]


def get_filter_options():
    companies = []
    if doctype_exists("Company"):
        companies = [row.name for row in get_list_safe("Company", fields=["name"], order_by="name asc", limit_page_length=100)]

    project_doctype = "Project Master" if doctype_exists("Project Master") else "Project"
    projects = []
    if doctype_exists(project_doctype):
        projects = [row.name for row in get_list_safe(project_doctype, fields=["name"], order_by="name asc", limit_page_length=200)]

    return {"companies": companies, "projects": projects}


@frappe.whitelist()
def ensure_payment_tracking_dashboard_page():
    page_name = "payment-tracking-dashboard"
    truncated_page_name = page_name[:20]
    values = {
        "doctype": "Page",
        "name": page_name,
        "page_name": page_name,
        "title": "Payment Tracking Dashboard",
        "module": "Procure Flow",
        "standard": "Yes",
        "system_page": 0,
    }

    action = "updated"
    if not frappe.db.exists("Page", page_name) and frappe.db.exists("Page", truncated_page_name):
        frappe.rename_doc("Page", truncated_page_name, page_name, force=True, show_alert=False)
        action = "renamed"

    if frappe.db.exists("Page", page_name):
        frappe.db.set_value("Page", page_name, {
            "title": values["title"],
            "page_name": values["page_name"],
            "module": values["module"],
            "standard": values["standard"],
            "system_page": values["system_page"],
        })
    else:
        doc = frappe.get_doc(values)
        doc.flags.do_not_update_json = True
        doc.insert(ignore_permissions=True)
        if doc.name != page_name:
            frappe.rename_doc("Page", doc.name, page_name, force=True, show_alert=False)
        action = "created"

    frappe.db.commit()
    return {"page": page_name, "action": action}


@frappe.whitelist()
def get_payment_tracking_dashboard_data(
    company=None,
    project=None,
    supplier=None,
    status=None,
    payment_status=None,
    from_date=None,
    to_date=None,
    search=None,
    month=None,
    limit=50,
):
    filters = get_payment_dashboard_filters(
        company=company,
        project=project,
        supplier=supplier,
        status=status or payment_status,
        from_date=from_date,
        to_date=to_date,
        search=search,
        month=month,
        limit=limit,
    )
    rows = get_payment_dashboard_receipts(filters, limit=1000)
    view_rows = rows[:filters["limit"]]

    return {
        "filters": filters,
        "filter_options": get_payment_filter_options(),
        "kpis": get_payment_dashboard_kpis(rows),
        "status_summary": get_payment_status_summary(rows),
        "outstanding_by_supplier": get_payment_group_summary(rows, "supplier", limit=10),
        "outstanding_by_project": get_payment_group_summary(rows, "project", limit=10),
        "ledger_rows": view_rows,
        "receipt_overview": view_rows,
        "recent_receipts": view_rows,
        "insights": get_payment_dashboard_insights(rows),
    }


def get_payment_dashboard_filters(
    company=None,
    project=None,
    supplier=None,
    status=None,
    from_date=None,
    to_date=None,
    search=None,
    month=None,
    limit=50,
):
    filters = get_dashboard_filters(company=company, project=project, month=month, from_date=from_date, to_date=to_date)
    payment_status = (status or "").strip()
    if payment_status not in ("Paid", "Partial", "Pending", "Overdue", "Zero"):
        payment_status = ""

    try:
        limit = min(max(int(limit or 50), 1), 100)
    except Exception:
        limit = 50

    filters.update({
        "supplier": supplier or "",
        "status": payment_status,
        "payment_status": payment_status,
        "search": (search or "").strip(),
        "limit": limit,
    })
    return filters


def get_payment_filter_options():
    options = get_filter_options()
    suppliers = []
    if doctype_exists("Supplier"):
        suppliers = [row.name for row in get_list_safe("Supplier", fields=["name"], order_by="name asc", limit_page_length=300)]

    if not options.get("companies") and doctype_exists("Company Master"):
        options["companies"] = [
            row.name for row in get_list_safe("Company Master", fields=["name"], order_by="name asc", limit_page_length=100)
        ]

    options.update({
        "suppliers": suppliers,
        "payment_statuses": ["Paid", "Partial", "Pending", "Overdue", "Zero"],
        "statuses": ["Paid", "Partial", "Pending", "Overdue", "Zero"],
    })
    return options


def get_payment_dashboard_receipts(filters, limit=5000):
    if not doctype_exists("Purchase Receipt"):
        return []

    pr_fields = ["name", "supplier", "docstatus", "modified", "creation"]
    for fieldname in (
        "posting_date",
        "due_date",
        "company",
        "custom_test_company_",
        "project",
        "custom_project_name",
        "rounded_total",
        "grand_total",
        "base_grand_total",
    ):
        if has_field("Purchase Receipt", fieldname):
            pr_fields.append(fieldname)

    pr_filters = build_filters("Purchase Receipt", filters)
    if filters.get("supplier") and has_field("Purchase Receipt", "supplier"):
        pr_filters["supplier"] = filters["supplier"]

    receipts = get_list_safe(
        "Purchase Receipt",
        filters=pr_filters,
        fields=pr_fields,
        order_by="posting_date desc, modified desc" if has_field("Purchase Receipt", "posting_date") else "modified desc",
        limit_page_length=limit,
    )

    paid_map = get_payment_dashboard_paid_amounts([row.name for row in receipts])
    rows = []

    for receipt in receipts:
        total = get_purchase_receipt_total(receipt)
        paid_info = paid_map.get(receipt.name, {})
        paid = flt(paid_info.get("paid_amount"))
        outstanding = max(total - paid, 0)
        receipt_date = receipt.get("posting_date") or receipt.get("creation")
        status = get_receipt_payment_status(total, paid, outstanding, receipt_date)
        project = receipt.get("custom_project_name") or receipt.get("project") or "-"
        supplier = receipt.get("supplier") or "-"
        company = receipt.get("company") or receipt.get("custom_test_company_") or "-"

        if filters.get("payment_status") and status != filters["payment_status"]:
            continue

        search_text = (filters.get("search") or "").lower()
        if search_text:
            haystack = " ".join([receipt.name or "", supplier, project, company]).lower()
            if search_text not in haystack:
                continue

        rows.append({
            "purchase_receipt": receipt.name,
            "supplier": supplier,
            "project": project,
            "company": company,
            "receipt_date": str(receipt_date or ""),
            "total_amount": total,
            "previous_paid_amount": 0,
            "paid_amount": paid,
            "latest_payment_amount": flt(paid_info.get("latest_payment_amount")) or paid,
            "outstanding_amount": outstanding,
            "payment_status": status,
            "last_payment_date": str(paid_info.get("payment_date") or ""),
            "payment_entry": paid_info.get("payment_entry") or "",
            "progress_percent": get_payment_progress_percent(total, paid),
            "is_overdue": status == "Overdue",
        })

    return rows


def get_payment_dashboard_paid_amounts(receipt_names):
    if not receipt_names or not doctype_exists("Procureflow Payment Entry"):
        return {}
    if not has_field("Procureflow Payment Entry", "purchase_receipt") or not has_field("Procureflow Payment Entry", "amount"):
        return {}

    date_field = "payment_date" if has_field("Procureflow Payment Entry", "payment_date") else "creation"
    summary_rows = frappe.db.sql(
        f"""
        select purchase_receipt,
               coalesce(sum(amount), 0) as paid_amount,
               max(`{date_field}`) as payment_date
        from `tabProcureflow Payment Entry`
        where docstatus = 1
          and purchase_receipt in %(receipt_names)s
        group by purchase_receipt
        """,
        {"receipt_names": tuple(receipt_names)},
        as_dict=True,
    )
    paid_map = {row.purchase_receipt: row for row in summary_rows}

    latest_rows = frappe.db.sql(
        f"""
        select name,
               purchase_receipt,
               amount as latest_payment_amount,
               `{date_field}` as payment_date
        from `tabProcureflow Payment Entry`
        where docstatus = 1
          and purchase_receipt in %(receipt_names)s
        order by purchase_receipt asc, `{date_field}` desc, modified desc
        """,
        {"receipt_names": tuple(receipt_names)},
        as_dict=True,
    )
    for row in latest_rows:
        if row.purchase_receipt not in paid_map:
            paid_map[row.purchase_receipt] = {}
        if not paid_map[row.purchase_receipt].get("payment_entry"):
            paid_map[row.purchase_receipt]["payment_entry"] = row.name
            paid_map[row.purchase_receipt]["latest_payment_amount"] = row.latest_payment_amount
            paid_map[row.purchase_receipt]["payment_date"] = row.payment_date

    return paid_map


def get_receipt_payment_status(total, paid, outstanding=None, receipt_date=None):
    total = flt(total)
    paid = flt(paid)
    outstanding = max(total - paid, 0) if outstanding is None else flt(outstanding)

    if total <= 0:
        return "Zero"
    if outstanding <= 0:
        return "Paid"
    if receipt_date and getdate(receipt_date) < add_days(getdate(nowdate()), -30):
        return "Overdue"
    if paid > 0:
        return "Partial"
    return "Pending"


def get_payment_progress_percent(total, paid):
    total = flt(total)
    if total <= 0:
        return 0
    return min(round((flt(paid) / total) * 100, 1), 100)


def get_payment_dashboard_kpis(rows):
    summary = get_payment_status_summary(rows)
    totals = {
        "total_receipt_amount": sum(flt(row.get("total_amount")) for row in rows),
        "total_paid_amount": sum(flt(row.get("paid_amount")) for row in rows),
        "total_outstanding_amount": sum(flt(row.get("outstanding_amount")) for row in rows),
        "pending_receipts": summary["Pending"]["count"],
        "partial_receipts": summary["Partial"]["count"],
        "paid_receipts": summary["Paid"]["count"],
        "overdue_receipts": summary["Overdue"]["count"],
        "receipt_count": len(rows),
        "paid_percent": 0,
        "avg_payment_days": get_average_payment_days(rows),
    }
    totals["paid_percent"] = 0 if not totals["total_receipt_amount"] else min(
        round((totals["total_paid_amount"] / totals["total_receipt_amount"]) * 100, 1),
        100,
    )
    return totals


def get_payment_status_summary(rows):
    summary = {
        "Paid": {"count": 0, "total_amount": 0, "paid_amount": 0, "outstanding_amount": 0},
        "Partial": {"count": 0, "total_amount": 0, "paid_amount": 0, "outstanding_amount": 0},
        "Pending": {"count": 0, "total_amount": 0, "paid_amount": 0, "outstanding_amount": 0},
        "Overdue": {"count": 0, "total_amount": 0, "paid_amount": 0, "outstanding_amount": 0},
        "Zero": {"count": 0, "total_amount": 0, "paid_amount": 0, "outstanding_amount": 0},
    }

    for row in rows:
        status = row.get("payment_status") or "Zero"
        if status not in summary:
            status = "Zero"
        summary[status]["count"] += 1
        summary[status]["total_amount"] += flt(row.get("total_amount"))
        summary[status]["paid_amount"] += flt(row.get("paid_amount"))
        summary[status]["outstanding_amount"] += flt(row.get("outstanding_amount"))

    return summary


def get_average_payment_days(rows):
    day_counts = []
    for row in rows:
        if not row.get("receipt_date") or not row.get("last_payment_date"):
            continue
        try:
            receipt_date = getdate(row.get("receipt_date"))
            payment_date = getdate(row.get("last_payment_date"))
            if payment_date >= receipt_date:
                day_counts.append((payment_date - receipt_date).days)
        except Exception:
            continue
    return 0 if not day_counts else round(sum(day_counts) / len(day_counts), 1)


def get_payment_group_summary(rows, group_field, limit=10):
    grouped = defaultdict(lambda: {
        "label": "Not Set",
        "receipt_count": 0,
        "total_amount": 0,
        "paid_amount": 0,
        "outstanding_amount": 0,
    })

    for row in rows:
        label = row.get(group_field) or "Not Set"
        if label == "-":
            label = "Not Set"
        grouped[label]["label"] = label
        grouped[label]["receipt_count"] += 1
        grouped[label]["total_amount"] += flt(row.get("total_amount"))
        grouped[label]["paid_amount"] += flt(row.get("paid_amount"))
        grouped[label]["outstanding_amount"] += flt(row.get("outstanding_amount"))

    return sorted(grouped.values(), key=lambda item: item["outstanding_amount"], reverse=True)[:limit]


def get_payment_dashboard_insights(rows):
    supplier_rows = get_payment_group_summary(rows, "supplier", limit=1)
    project_rows = get_payment_group_summary(rows, "project", limit=1)
    pending_rows = [row for row in rows if flt(row.get("outstanding_amount")) > 0 and row.get("receipt_date")]
    pending_rows.sort(key=lambda row: row.get("receipt_date") or "")

    total = sum(flt(row.get("total_amount")) for row in rows)
    paid = sum(flt(row.get("paid_amount")) for row in rows)

    return {
        "highest_outstanding_supplier": supplier_rows[0] if supplier_rows else {},
        "highest_outstanding_project": project_rows[0] if project_rows else {},
        "oldest_pending_receipt": pending_rows[0] if pending_rows else {},
        "completion_percent": 0 if not total else min(round((paid / total) * 100, 1), 100),
    }
