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
    projects = frappe.get_all(
        "Project Master", fields=["name", "project_name", "store_name"], order_by="name"
    )
    departments = [
        d.name
        for d in frappe.get_all(
            "Department", filters={"is_group": 0}, fields=["name"], order_by="name"
        )
    ]
    return {
        "company": _company(),
        "categories": categories,
        "projects": projects,
        "departments": departments,
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
    doc.custom_department = data.get("department")
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
