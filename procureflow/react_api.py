"""Thin whitelisted endpoints for the procureflow React SPA (served at /procureflow).

These DO NOT change the existing desk UI or the buying-cycle backend. They read
the same doctypes the desk uses and create Material Requests through the normal
ERPNext document API, so workflow, MR->SQ->PO linkage and downstream payment all
keep working. Category filtering here is INCLUSIVE (category only, any/no
sub-category) — the React front-door's one deliberate difference from the desk
picker.
"""

import json

import frappe
from frappe import _
from frappe.utils import flt, nowdate

MR_TYPE = "Purchase"
MR_PENDING_STATE = "Pending Approval"
PRIORITIES = ["Low", "Medium", "High"]


def _company():
    return (
        frappe.defaults.get_user_default("company")
        or frappe.defaults.get_global_default("company")
        or frappe.db.get_value("Company", {}, "name")
    )


def _loads(payload):
    if isinstance(payload, str):
        return json.loads(payload)
    return payload or {}


# ---------------------------------------------------------------------------
# Context for the Material Request form (dropdowns)
# ---------------------------------------------------------------------------

@frappe.whitelist()
def mr_context():
    categories = [c.name for c in frappe.get_all("Material Category", fields=["name"], order_by="name")]
    # company_name is the Project's company (a Company Master) — shown read-only,
    # auto-filled from the picked project, like the desk does.
    projects = frappe.get_all(
        "Project Master",
        fields=["name", "project_name", "store_name", "company_name"],
        order_by="name",
    )
    return {
        "company": _company(),
        "categories": categories,
        "projects": projects,
        "priorities": PRIORITIES,
        "today": nowdate(),
    }


# ---------------------------------------------------------------------------
# Inclusive item search (THE category tweak): filter by category only —
# returns items of ANY sub-category and items with no sub-category.
# ---------------------------------------------------------------------------

@frappe.whitelist()
def item_search(category, query="", limit=50):
    if not category:
        return []
    filters = {"custom_category": category, "disabled": 0}
    or_filters = None
    query = (query or "").strip()
    if query:
        or_filters = {"item_code": ["like", f"%{query}%"], "item_name": ["like", f"%{query}%"]}
    items = frappe.get_all(
        "Item",
        filters=filters,
        or_filters=or_filters,
        fields=["name", "item_name", "stock_uom", "custom_sub_category"],
        order_by="item_name asc",
        limit_page_length=int(limit),
    )
    return [
        {
            "value": it.name,
            "label": it.item_name or it.name,
            "uom": it.stock_uom,
            "sub_category": it.custom_sub_category,
        }
        for it in items
    ]


# ---------------------------------------------------------------------------
# Create / update a Material Request (lands in "Pending Approval")
# ---------------------------------------------------------------------------

@frappe.whitelist()
def save_material_request(data):
    data = _loads(data)
    name = data.get("name")

    if name:
        doc = frappe.get_doc("Material Request", name)
        if doc.docstatus != 0:
            frappe.throw(_("This Material Request is already submitted and cannot be edited."))
    else:
        doc = frappe.new_doc("Material Request")

    project = data.get("project")
    set_warehouse = (
        frappe.db.get_value("Project Master", project, "store_name") if project else None
    )

    doc.material_request_type = MR_TYPE
    doc.company = _company()
    doc.transaction_date = nowdate()
    doc.schedule_date = data.get("schedule_date") or nowdate()
    doc.custom_category = data.get("category")
    doc.custom_select_project_ = project
    if set_warehouse:
        doc.set_warehouse = set_warehouse
    doc.custom_priority = data.get("priority") or "Medium"
    doc.custom_remark = data.get("remark")
    if not doc.get("custom_username"):
        doc.custom_username = frappe.session.user
    doc.workflow_state = MR_PENDING_STATE

    doc.set("items", [])
    for row in data.get("items", []):
        if not row.get("item_code"):
            continue
        item = frappe.get_cached_doc("Item", row["item_code"])
        uom = row.get("uom") or item.stock_uom
        doc.append(
            "items",
            {
                "item_code": item.name,
                "item_name": item.item_name,
                "description": item.description or item.item_name,
                "qty": flt(row.get("qty")) or 0,
                "uom": uom,
                "stock_uom": item.stock_uom,
                "conversion_factor": 1,
                "schedule_date": row.get("schedule_date") or doc.schedule_date,
                "warehouse": set_warehouse,
                "custom_specification": row.get("specification"),
                "custom_remark": row.get("remark"),
            },
        )

    if not doc.get("items"):
        frappe.throw(_("Add at least one item to the Material Request."))

    doc.save()
    return {"name": doc.name, "workflow_state": doc.workflow_state, "docstatus": doc.docstatus}


# ---------------------------------------------------------------------------
# List + detail
# ---------------------------------------------------------------------------

@frappe.whitelist()
def mr_list(search="", limit=100):
    rows = frappe.get_all(
        "Material Request",
        filters={"material_request_type": MR_TYPE},
        fields=[
            "name",
            "custom_category",
            "custom_select_project_",
            "custom_priority",
            "workflow_state",
            "status",
            "transaction_date",
            "schedule_date",
            "owner",
        ],
        order_by="modified desc",
        limit_page_length=int(limit),
    )
    names = [r.name for r in rows]
    counts = {}
    if names:
        for r in frappe.get_all(
            "Material Request Item",
            filters={"parent": ["in", names]},
            fields=["parent"],
            limit_page_length=0,
        ):
            counts[r.parent] = counts.get(r.parent, 0) + 1
    search = (search or "").strip().lower()
    out = []
    for r in rows:
        if search and search not in (r.name or "").lower() and search not in (
            r.custom_select_project_ or ""
        ).lower():
            continue
        r["items"] = counts.get(r.name, 0)
        out.append(r)
    return out


@frappe.whitelist()
def mr_detail(name):
    doc = frappe.get_doc("Material Request", name)
    doc.check_permission("read")
    items = []
    for it in doc.items:
        sub = frappe.db.get_value("Item", it.item_code, "custom_sub_category")
        items.append(
            {
                "item_code": it.item_code,
                "item_name": it.item_name,
                "qty": it.qty,
                "uom": it.uom,
                "schedule_date": it.schedule_date,
                "specification": it.get("custom_specification"),
                "remark": it.get("custom_remark"),
                "sub_category": sub,
            }
        )
    return {
        "name": doc.name,
        "category": doc.custom_category,
        "project": doc.custom_select_project_,
        "department": doc.custom_department,
        "priority": doc.custom_priority,
        "schedule_date": doc.schedule_date,
        "remark": doc.custom_remark,
        "workflow_state": doc.workflow_state,
        "docstatus": doc.docstatus,
        "owner": doc.owner,
        "attachment": doc.get("custom_add_receipt"),
        "items": items,
    }


# ===========================================================================
# Purchase Order
# ===========================================================================

PO_DRAFT_STATE = "Draft"
TAX_TYPES = ["Intra-State (CGST + SGST)", "Inter-State (IGST)"]


@frappe.whitelist()
def po_context():
    suppliers = frappe.get_all(
        "Supplier", filters={"disabled": 0}, fields=["name", "supplier_name"], order_by="supplier_name"
    )
    categories = [c.name for c in frappe.get_all("Material Category", fields=["name"], order_by="name")]
    projects = frappe.get_all(
        "Project Master",
        fields=["name", "project_name", "store_name", "company_name"],
        order_by="name",
    )
    return {
        "company": _company(),
        "suppliers": suppliers,
        "categories": categories,
        "projects": projects,
        "tax_types": TAX_TYPES,
        "today": nowdate(),
    }


@frappe.whitelist()
def party_tax_type(supplier):
    """Auto-detect Intra/Inter from supplier vs company state (or '' if unknown)."""
    from procureflow.purchase_tax import get_party_tax_type

    return get_party_tax_type(supplier, _company())


@frappe.whitelist()
def approved_material_requests():
    """Approved (submitted) Purchase MRs available to order against."""
    rows = frappe.get_all(
        "Material Request",
        filters={"material_request_type": MR_TYPE, "docstatus": 1, "status": ["!=", "Stopped"]},
        fields=["name", "custom_category", "custom_select_project_", "transaction_date", "schedule_date"],
        order_by="transaction_date desc",
        limit_page_length=100,
    )
    return rows


@frappe.whitelist()
def mr_items_for_po(material_request):
    """Item lines of an approved MR, to pull into a Purchase Order."""
    doc = frappe.get_doc("Material Request", material_request)
    doc.check_permission("read")
    out = []
    for it in doc.items:
        out.append(
            {
                "item_code": it.item_code,
                "item_name": it.item_name,
                "uom": it.uom,
                "qty": flt(it.qty) - flt(it.ordered_qty),
                "specification": it.get("custom_specification"),
                "remark": it.get("custom_remark"),
                "material_request": doc.name,
                "material_request_item": it.name,
                "sub_category": frappe.db.get_value("Item", it.item_code, "custom_sub_category"),
            }
        )
    return {
        "category": doc.custom_category,
        "project": doc.custom_select_project_,
        "items": [r for r in out if r["qty"] > 0],
    }


@frappe.whitelist()
def save_purchase_order(data):
    data = _loads(data)
    name = data.get("name")

    if name:
        doc = frappe.get_doc("Purchase Order", name)
        if doc.docstatus != 0:
            frappe.throw(_("This Purchase Order is already submitted and cannot be edited."))
    else:
        doc = frappe.new_doc("Purchase Order")

    supplier = data.get("supplier")
    if not supplier:
        frappe.throw(_("Select a supplier."))

    project = data.get("project")
    set_warehouse = frappe.db.get_value("Project Master", project, "store_name") if project else None
    company_master = frappe.db.get_value("Project Master", project, "company_name") if project else None

    doc.supplier = supplier
    doc.company = _company()
    doc.transaction_date = nowdate()
    doc.schedule_date = data.get("schedule_date") or nowdate()
    doc.custom_category = data.get("category")
    doc.custom_project_name = project
    if set_warehouse:
        doc.set_warehouse = set_warehouse
    if company_master:
        doc.custom_test_company_ = company_master
    doc.custom_remark = data.get("remark")
    if data.get("tax_type"):
        doc.custom_tax_type = data.get("tax_type")
    if not doc.get("workflow_state"):
        doc.workflow_state = PO_DRAFT_STATE

    doc.set("items", [])
    for row in data.get("items", []):
        if not row.get("item_code"):
            continue
        item = frappe.get_cached_doc("Item", row["item_code"])
        doc.append(
            "items",
            {
                "item_code": item.name,
                "item_name": item.item_name,
                "description": item.description or item.item_name,
                "qty": flt(row.get("qty")) or 0,
                "uom": row.get("uom") or item.stock_uom,
                "stock_uom": item.stock_uom,
                "conversion_factor": 1,
                "rate": flt(row.get("rate")),
                "custom_gst_percent": flt(row.get("gst_percent")),
                "custom_rate_with_tax": flt(row.get("rate_with_tax")),
                "schedule_date": row.get("schedule_date") or doc.schedule_date,
                "warehouse": set_warehouse,
                "custom_specification": row.get("specification"),
                "custom_remark": row.get("remark"),
                "material_request": row.get("material_request"),
                "material_request_item": row.get("material_request_item"),
            },
        )

    if not doc.get("items"):
        frappe.throw(_("Add at least one item to the Purchase Order."))

    # doc.save() runs procureflow.purchase_tax.purchase_order_validate which builds
    # the CGST/SGST or IGST rows and the tax-inclusive grand total.
    doc.save()

    if data.get("submit_for_approval"):
        try:
            from frappe.model.workflow import apply_workflow

            apply_workflow(doc, "Send for Approval")
        except Exception:
            frappe.log_error(frappe.get_traceback(), "procureflow: PO send-for-approval")

    doc.reload()
    return {"name": doc.name, "workflow_state": doc.workflow_state, "docstatus": doc.docstatus}


@frappe.whitelist()
def po_list(limit=100):
    rows = frappe.get_all(
        "Purchase Order",
        fields=[
            "name",
            "supplier",
            "supplier_name",
            "custom_category",
            "custom_project_name",
            "workflow_state",
            "status",
            "grand_total",
            "transaction_date",
            "schedule_date",
        ],
        order_by="modified desc",
        limit_page_length=int(limit),
    )
    names = [r.name for r in rows]
    counts = {}
    if names:
        for r in frappe.get_all(
            "Purchase Order Item", filters={"parent": ["in", names]}, fields=["parent"], limit_page_length=0
        ):
            counts[r.parent] = counts.get(r.parent, 0) + 1
    for r in rows:
        r["items"] = counts.get(r.name, 0)
    return rows


@frappe.whitelist()
def po_detail(name):
    doc = frappe.get_doc("Purchase Order", name)
    doc.check_permission("read")
    items = []
    for it in doc.items:
        items.append(
            {
                "item_code": it.item_code,
                "item_name": it.item_name,
                "qty": it.qty,
                "uom": it.uom,
                "rate": it.rate,
                "gst_percent": it.get("custom_gst_percent"),
                "rate_with_tax": it.get("custom_rate_with_tax"),
                "amount": it.amount,
                "specification": it.get("custom_specification"),
                "remark": it.get("custom_remark"),
                "schedule_date": it.schedule_date,
                "material_request": it.get("material_request"),
                "sub_category": frappe.db.get_value("Item", it.item_code, "custom_sub_category"),
            }
        )
    taxes = [
        {"description": t.description or t.account_head, "amount": t.tax_amount}
        for t in doc.get("taxes", [])
        if flt(t.tax_amount)
    ]
    return {
        "name": doc.name,
        "supplier": doc.supplier,
        "supplier_name": doc.supplier_name,
        "category": doc.custom_category,
        "project": doc.custom_project_name,
        "company": doc.get("custom_test_company_"),
        "tax_type": doc.get("custom_tax_type"),
        "remark": doc.custom_remark,
        "schedule_date": doc.schedule_date,
        "workflow_state": doc.workflow_state,
        "docstatus": doc.docstatus,
        "attachment": doc.get("custom_add_receipt"),
        "net_total": doc.net_total,
        "total_taxes": doc.total_taxes_and_charges,
        "grand_total": doc.grand_total,
        "taxes": taxes,
        "items": items,
    }
