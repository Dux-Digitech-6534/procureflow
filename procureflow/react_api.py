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
from frappe.model.workflow import apply_workflow, get_transitions
from frappe.utils import flt, nowdate

MR_TYPE = "Purchase"
MR_PENDING_STATE = "Pending Approval"
PRIORITIES = ["Low", "Medium", "High"]

# States where a workflow action MAY be available for the current user; others
# are terminal. We resolve the real actions via get_transitions(), which honours
# both the user's roles AND the transition conditions (e.g. the PO workflow's
# amount-based "<= 50000 place directly / > 50000 send for approval"). Computed
# only for these states to avoid loading every row's doc.
ACTIONABLE_STATES = {
    "Material Request": {"Pending Approval", "Rejected"},
    "Purchase Order": {"Draft", "Pending", "Rejected"},
}


def _doc_actions(doctype, name, state):
    if state not in ACTIONABLE_STATES.get(doctype, set()):
        return []
    try:
        return [t.action for t in get_transitions(frappe.get_doc(doctype, name))]
    except Exception:
        return []


def _default_workflow_state(doctype):
    """First state of the doctype's active workflow (the draft/initial state)."""
    from frappe.model.workflow import get_workflow_name

    wf_name = get_workflow_name(doctype)
    if not wf_name:
        return None
    wf = frappe.get_doc("Workflow", wf_name)
    return wf.states[0].state if wf.states else None


def _doc_action_state(doc):
    """Live, permission-checked actions for THIS user on a single doc:
    the available workflow transitions (resolved via get_transitions, which
    honours roles AND conditions) plus the cancel/amend lifecycle flags.

    Frappe lifecycle (verified live): a submitted doc (docstatus 1) can be
    Cancelled; only a Cancelled doc (docstatus 2) can be Amended — amend copies
    it into a fresh draft via amended_from. So Cancel surfaces on docstatus 1 and
    Amend on docstatus 2 (not yet amended). Everything is permission-gated.
    """
    transitions = []
    try:
        transitions = [t.action for t in get_transitions(doc)]
    except Exception:
        transitions = []
    can_cancel = bool(doc.docstatus == 1 and frappe.has_permission(doc.doctype, "cancel", doc))
    already_amended = bool(frappe.db.exists(doc.doctype, {"amended_from": doc.name}))
    can_amend = bool(
        doc.docstatus == 2 and not already_amended and frappe.has_permission(doc.doctype, "amend", doc)
    )
    return {"transitions": transitions, "can_cancel": can_cancel, "can_amend": can_amend}


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
            "docstatus",
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
        r["actions"] = _doc_actions("Material Request", r.name, r.workflow_state)
        out.append(r)
    return out


@frappe.whitelist()
def mr_detail(name):
    doc = frappe.get_doc("Material Request", name)
    doc.check_permission("read")
    # Whether the current user may raise a PO from this (approved, still-orderable)
    # request — surfaces the "Create purchase order" button on the MR detail page.
    can_create_po = bool(
        doc.docstatus == 1
        and doc.material_request_type == MR_TYPE
        and flt(doc.get("per_ordered")) < 100
        and frappe.has_permission("Purchase Order", "create")
    )
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
        "status": doc.status,
        "docstatus": doc.docstatus,
        "owner": doc.owner,
        "attachment": doc.get("custom_add_receipt"),
        "items": items,
        "can_create_po": can_create_po,
        **_doc_action_state(doc),
    }


# ===========================================================================
# Purchase Order
# ===========================================================================

PO_DRAFT_STATE = "Draft"
TAX_TYPES = ["Intra-State (CGST + SGST)", "Inter-State (IGST)"]
# Custom ERPNext print format for the PO (carries the company-linked signature
# set by the before_submit hook in signature_api). Used by the SPA's Print button.
PO_PRINT_FORMAT = "Sanskruti PO Print Format"


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
    """Approved (submitted) Purchase MRs that still have quantity left to order.
    Excludes fully-ordered MRs (per_ordered >= 100, status "Ordered") so an MR
    whose every line has been put on a PO disappears from the picker."""
    rows = frappe.get_all(
        "Material Request",
        filters={
            "material_request_type": MR_TYPE,
            "docstatus": 1,
            "status": ["not in", ["Stopped", "Ordered"]],
            "per_ordered": ["<", 100],
        },
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
        # Resolve the real forward transition from the LIVE workflow rather than
        # hardcoding: the PO workflow is amount-gated, so from Draft a Purchase
        # Officer sees "Place Order" (grand_total <= 50000 -> submitted/Approved
        # directly) OR "Send for Approval" (> 50000 -> Pending). get_transitions
        # honours both the amount condition and the user's roles.
        forward = [t.action for t in get_transitions(doc) if "reject" not in (t.action or "").lower()]
        if not forward:
            frappe.throw(_("You do not have permission to place or submit this order."))
        apply_workflow(doc, forward[0])

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
            "docstatus",
            "per_received",
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
        r["actions"] = _doc_actions("Purchase Order", r.name, r.workflow_state)
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
        "status": doc.status,
        "per_received": doc.per_received,
        "docstatus": doc.docstatus,
        "attachment": doc.get("custom_add_receipt"),
        "net_total": doc.net_total,
        "total_taxes": doc.total_taxes_and_charges,
        "grand_total": doc.grand_total,
        "taxes": taxes,
        "items": items,
        "print_format": PO_PRINT_FORMAT,
        **_doc_action_state(doc),
    }


# ===========================================================================
# Approvals (workflow actions for MR + PO)
# ===========================================================================

@frappe.whitelist()
def apply_action(doctype, name, action, remark=""):
    if doctype not in ("Material Request", "Purchase Order"):
        frappe.throw(_("Unsupported document type for approvals."))
    doc = frappe.get_doc(doctype, name)
    remark = (remark or "").strip()
    if remark and doc.meta.has_field("custom_rejection_remark"):
        doc.custom_rejection_remark = remark
        doc.save()
    # apply_workflow enforces the transition + the user's role/permission.
    doc = apply_workflow(doc, action)
    return {
        "name": doc.name,
        "workflow_state": doc.get("workflow_state"),
        "docstatus": doc.docstatus,
    }


@frappe.whitelist()
def cancel_doc(doctype, name):
    """Cancel a submitted MR/PO (docstatus 1 -> 2). Respects frappe cancel perms."""
    if doctype not in ("Material Request", "Purchase Order"):
        frappe.throw(_("Unsupported document type."))
    doc = frappe.get_doc(doctype, name)
    if not frappe.has_permission(doctype, "cancel", doc):
        raise frappe.PermissionError(_("You are not permitted to cancel this document."))
    doc.cancel()
    return {"name": doc.name, "workflow_state": doc.get("workflow_state"), "docstatus": doc.docstatus}


@frappe.whitelist()
def amend_doc(doctype, name):
    """Amend a cancelled MR/PO: copy it into a fresh editable draft (amended_from),
    reset to the workflow's initial state. Respects frappe amend perms. Returns the
    new draft's name so the SPA can navigate to it."""
    if doctype not in ("Material Request", "Purchase Order"):
        frappe.throw(_("Unsupported document type."))
    src = frappe.get_doc(doctype, name)
    if src.docstatus != 2:
        frappe.throw(_("Only a cancelled document can be amended. Cancel it first."))
    if frappe.db.exists(doctype, {"amended_from": name}):
        frappe.throw(_("This document has already been amended."))
    if not frappe.has_permission(doctype, "amend", src):
        raise frappe.PermissionError(_("You are not permitted to amend this document."))

    amended = frappe.copy_doc(src)
    amended.docstatus = 0
    amended.amended_from = name
    init = _default_workflow_state(doctype)
    if init and amended.meta.has_field("workflow_state"):
        amended.workflow_state = init
    amended.insert()
    return {"name": amended.name, "workflow_state": amended.get("workflow_state"), "docstatus": amended.docstatus}


@frappe.whitelist()
def pending_approvals():
    """Docs awaiting THIS user's decision: MRs in Pending Approval, POs in Pending."""
    mrs = []
    for r in frappe.get_all(
        "Material Request",
        filters={"material_request_type": MR_TYPE, "workflow_state": MR_PENDING_STATE},
        fields=["name", "custom_category", "custom_select_project_", "custom_priority", "transaction_date", "owner"],
        order_by="transaction_date asc",
        limit_page_length=200,
    ):
        actions = _doc_actions("Material Request", r.name, MR_PENDING_STATE)
        if actions:
            r["actions"] = actions
            mrs.append(r)

    pos = []
    for r in frappe.get_all(
        "Purchase Order",
        filters={"workflow_state": "Pending"},
        fields=["name", "supplier", "supplier_name", "custom_category", "custom_project_name", "grand_total", "transaction_date", "owner"],
        order_by="transaction_date asc",
        limit_page_length=200,
    ):
        actions = _doc_actions("Purchase Order", r.name, "Pending")
        if actions:
            r["actions"] = actions
            pos.append(r)

    return {"material_requests": mrs, "purchase_orders": pos}


# ===========================================================================
# Purchase Receipt (GRN) + Payment
# ===========================================================================

def _pr_pay_info(name):
    from procureflow.procure_flow.doctype.procureflow_payment_entry.procureflow_payment_entry import (
        get_purchase_receipt_total,
        get_submitted_paid_amount,
    )

    total = flt(get_purchase_receipt_total(name))
    paid = flt(get_submitted_paid_amount(name))
    return {"total": total, "paid": paid, "outstanding": max(total - paid, 0)}


@frappe.whitelist()
def receivable_pos():
    """Approved POs that still have quantity left to receive."""
    return frappe.get_all(
        "Purchase Order",
        filters={"docstatus": 1, "per_received": ["<", 100], "status": ["not in", ["Closed"]]},
        fields=["name", "supplier", "supplier_name", "custom_project_name", "grand_total", "transaction_date"],
        order_by="transaction_date desc",
        limit_page_length=100,
    )


@frappe.whitelist()
def po_receipt_items(purchase_order):
    doc = frappe.get_doc("Purchase Order", purchase_order)
    doc.check_permission("read")
    items = []
    for it in doc.items:
        pending = flt(it.qty) - flt(it.received_qty)
        if pending > 0:
            items.append(
                {
                    "po_item": it.name,
                    "item_code": it.item_code,
                    "item_name": it.item_name,
                    "uom": it.uom,
                    "ordered": it.qty,
                    "received": it.received_qty,
                    "pending": pending,
                }
            )
    return {"supplier": doc.supplier, "supplier_name": doc.supplier_name, "project": doc.custom_project_name, "items": items}


@frappe.whitelist()
def create_receipt(data):
    """Create + submit a Purchase Receipt from a PO with the entered received qtys."""
    from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_receipt

    data = _loads(data)
    po = data.get("purchase_order")
    if not po:
        frappe.throw(_("Select a purchase order."))

    qty_map = {r["po_item"]: flt(r.get("qty")) for r in data.get("items", []) if r.get("po_item")}
    pr = make_purchase_receipt(po)
    default_wh = pr.get("set_warehouse") or frappe.db.get_value("Purchase Order", po, "set_warehouse")

    # Receipt header fields from the form (posting/receipt date, supplier's
    # delivery-note ref, remark). posting_date drives the stock posting date.
    if data.get("posting_date"):
        pr.set_posting_time = 1
        pr.posting_date = data.get("posting_date")
    if data.get("supplier_delivery_note"):
        pr.supplier_delivery_note = data.get("supplier_delivery_note")
    if data.get("remark") and pr.meta.has_field("custom_remark"):
        pr.custom_remark = data.get("remark")
    # Receipt images (material / invoice) — uploaded private+unattached by the
    # SPA, set on the Attach fields before insert (they are NOT allow_on_submit,
    # so they must be set now), then attached to the PR after insert so the
    # private-file permission follows the receipt.
    material_image = data.get("material_image")
    invoice_image = data.get("invoice_image")
    if material_image and pr.meta.has_field("custom_add_material"):
        pr.custom_add_material = material_image
    if invoice_image and pr.meta.has_field("custom_add_invoice"):
        pr.custom_add_invoice = invoice_image

    keep = []
    for it in pr.items:
        q = qty_map.get(it.purchase_order_item, it.qty)
        if flt(q) > 0:
            it.qty = flt(q)
            if not it.warehouse:
                it.warehouse = default_wh
            keep.append(it)
    pr.set("items", keep)
    if not pr.get("items"):
        frappe.throw(_("Nothing to receive — enter a received quantity."))

    pr.insert()
    pr.submit()
    for url, field in ((material_image, "custom_add_material"), (invoice_image, "custom_add_invoice")):
        if url:
            _attach_file_to_doc(url, "Purchase Receipt", pr.name, field)
    return {"name": pr.name}


def _attach_file_to_doc(file_url, doctype, name, fieldname):
    """Link an already-uploaded (unattached) File to a document so its
    permission follows the doc and it shows in the attachments sidebar."""
    fname = frappe.db.get_value("File", {"file_url": file_url}, "name")
    if not fname:
        return
    f = frappe.get_doc("File", fname)
    if f.attached_to_doctype and f.attached_to_name:
        return
    f.attached_to_doctype = doctype
    f.attached_to_name = name
    f.attached_to_field = fieldname
    f.save(ignore_permissions=True)


@frappe.whitelist()
def pr_list(limit=100):
    rows = frappe.get_all(
        "Purchase Receipt",
        filters={"docstatus": 1},
        fields=[
            "name", "supplier", "supplier_name", "custom_project_name",
            "grand_total", "posting_date", "custom_payment_status",
        ],
        order_by="posting_date desc, modified desc",
        limit_page_length=int(limit),
    )
    for r in rows:
        info = _pr_pay_info(r.name)
        r["total"] = info["total"]
        r["paid"] = info["paid"]
        r["outstanding"] = info["outstanding"]
    return rows


@frappe.whitelist()
def pr_detail(name):
    doc = frappe.get_doc("Purchase Receipt", name)
    doc.check_permission("read")
    info = _pr_pay_info(name)
    return {
        "name": doc.name,
        "supplier": doc.supplier,
        "supplier_name": doc.supplier_name,
        "project": doc.get("custom_project_name"),
        "posting_date": doc.posting_date,
        "grand_total": doc.grand_total,
        "payment_status": doc.get("custom_payment_status"),
        "total": info["total"],
        "paid": info["paid"],
        "outstanding": info["outstanding"],
        "items": [
            {"item_code": it.item_code, "item_name": it.item_name, "qty": it.qty, "uom": it.uom, "rate": it.rate, "amount": it.amount}
            for it in doc.items
        ],
    }


@frappe.whitelist()
def payment_defaults(purchase_receipt):
    from procureflow.api import get_procureflow_payment_entry_defaults

    return get_procureflow_payment_entry_defaults(purchase_receipt)


@frappe.whitelist()
def save_payment(data):
    from procureflow.api import get_procureflow_payment_entry_defaults

    data = _loads(data)
    pr = data.get("purchase_receipt")
    if not pr:
        frappe.throw(_("Select a purchase receipt."))

    # Set supplier/project/company from the receipt so they match the payment
    # entry's own validation (which requires them to equal the PR's values).
    defaults = get_procureflow_payment_entry_defaults(pr)
    doc = frappe.new_doc("Procureflow Payment Entry")
    doc.purchase_receipt = pr
    doc.supplier = defaults.get("supplier")
    doc.project = defaults.get("project")
    doc.company = defaults.get("company")
    doc.payment_date = data.get("payment_date") or nowdate()
    doc.amount = flt(data.get("amount"))
    doc.remark = data.get("remark")
    doc.insert()
    doc.submit()  # stamps the PR payment status
    return {"name": doc.name}


@frappe.whitelist()
def payment_list(limit=100):
    return frappe.get_all(
        "Procureflow Payment Entry",
        filters={"docstatus": 1},
        fields=["name", "purchase_receipt", "supplier", "project", "amount", "payment_date"],
        order_by="payment_date desc, modified desc",
        limit_page_length=int(limit),
    )


@frappe.whitelist()
def payment_detail(name):
    doc = frappe.get_doc("Procureflow Payment Entry", name)
    doc.check_permission("read")
    return {
        "name": doc.name,
        "supplier": doc.supplier,
        "project": doc.get("project"),
        "company": doc.get("company"),
        "purchase_receipt": doc.purchase_receipt,
        "previous_paid_amount": doc.get("previous_paid_amount"),
        "outstanding_amount": doc.get("outstanding_amount"),
        "amount": doc.amount,
        "payment_date": doc.payment_date,
        "remark": doc.get("remark"),
        "docstatus": doc.docstatus,
    }


# ===========================================================================
# Linked documents (the MR -> PO -> Receipt -> Payment chain) for detail pages
# ===========================================================================

# doctype -> (frontend kind, group label, SPA route segment)
PROCURE_LINKS = {
    "Material Request": ("material_request", "Material requests", "material-requests"),
    "Purchase Order": ("purchase_order", "Purchase orders", "purchase-orders"),
    "Purchase Receipt": ("purchase_receipt", "Receipts", "receipts"),
    "Procureflow Payment Entry": ("payment", "Payments", "payments"),
}


@frappe.whitelist()
def doc_links(doctype, name):
    """Every document connected to `name` across the MR -> PO -> Purchase Receipt
    -> Payment chain, grouped by type, for the detail-page "Linked documents"
    panel. Links: PO Item.material_request, PR Item.purchase_order /
    material_request, Procureflow Payment Entry.purchase_receipt."""
    if doctype not in PROCURE_LINKS:
        frappe.throw(_("Unsupported document type."))
    frappe.get_doc(doctype, name).check_permission("read")

    mrs, pos, prs, pays = set(), set(), set(), set()

    def _collect(child_dt, filters, field, into):
        for r in frappe.get_all(child_dt, filters=filters, fields=[field], limit_page_length=0):
            if r.get(field):
                into.add(r.get(field))

    # Direct neighbours only (not a transitive cluster): each anchor shows the
    # documents it is itself linked to, plus the payments on its receipt(s). You
    # can still walk the whole chain by hopping between linked docs.
    def _pays_for(pr_names):
        if pr_names:
            _collect("Procureflow Payment Entry", {"purchase_receipt": ["in", list(pr_names)]}, "name", pays)

    if doctype == "Material Request":
        _collect("Purchase Order Item", {"material_request": name}, "parent", pos)        # POs raised from this MR
        _collect("Purchase Receipt Item", {"material_request": name}, "parent", prs)      # receipts of this MR's items
        _pays_for(prs)
    elif doctype == "Purchase Order":
        _collect("Purchase Order Item", {"parent": name, "material_request": ["is", "set"]}, "material_request", mrs)
        _collect("Purchase Receipt Item", {"purchase_order": name}, "parent", prs)
        _pays_for(prs)
    elif doctype == "Purchase Receipt":
        _collect("Purchase Receipt Item", {"parent": name, "purchase_order": ["is", "set"]}, "purchase_order", pos)
        _collect("Purchase Receipt Item", {"parent": name, "material_request": ["is", "set"]}, "material_request", mrs)
        _collect("Procureflow Payment Entry", {"purchase_receipt": name}, "name", pays)
    else:  # Procureflow Payment Entry
        pr = frappe.db.get_value("Procureflow Payment Entry", name, "purchase_receipt")
        if pr:
            prs.add(pr)
            _collect("Purchase Receipt Item", {"parent": pr, "purchase_order": ["is", "set"]}, "purchase_order", pos)
            _collect("Purchase Receipt Item", {"parent": pr, "material_request": ["is", "set"]}, "material_request", mrs)
            _collect("Procureflow Payment Entry", {"purchase_receipt": pr}, "name", pays)  # sibling payments

    # Drop the anchor doc from its own group.
    {"Material Request": mrs, "Purchase Order": pos, "Purchase Receipt": prs, "Procureflow Payment Entry": pays}[doctype].discard(name)

    def mr_item(n):
        d = frappe.db.get_value("Material Request", n, ["custom_select_project_", "workflow_state", "status", "docstatus"], as_dict=True) or {}
        return {"name": n, "project": d.get("custom_select_project_"), "workflow_state": d.get("workflow_state"), "status": d.get("status"), "docstatus": d.get("docstatus")}

    def po_item(n):
        d = frappe.db.get_value("Purchase Order", n, ["supplier_name", "grand_total", "workflow_state", "status", "docstatus", "per_received"], as_dict=True) or {}
        return {"name": n, "supplier_name": d.get("supplier_name"), "grand_total": d.get("grand_total"), "workflow_state": d.get("workflow_state"), "status": d.get("status"), "docstatus": d.get("docstatus"), "per_received": d.get("per_received")}

    def pr_item(n):
        d = frappe.db.get_value("Purchase Receipt", n, ["supplier_name", "posting_date", "custom_payment_status"], as_dict=True) or {}
        return {"name": n, "supplier_name": d.get("supplier_name"), "posting_date": d.get("posting_date"), "payment_status": d.get("custom_payment_status")}

    def pay_item(n):
        d = frappe.db.get_value("Procureflow Payment Entry", n, ["amount", "payment_date", "supplier"], as_dict=True) or {}
        return {"name": n, "amount": d.get("amount"), "payment_date": d.get("payment_date"), "supplier": d.get("supplier")}

    plan = [
        ("Material Request", sorted(mrs), mr_item),
        ("Purchase Order", sorted(pos), po_item),
        ("Purchase Receipt", sorted(prs), pr_item),
        ("Procureflow Payment Entry", sorted(pays), pay_item),
    ]
    groups = []
    for dt, names, build in plan:
        if not names:
            continue
        kind, label, route = PROCURE_LINKS[dt]
        groups.append({"kind": kind, "label": label, "route": route, "items": [build(n) for n in names]})

    return {"groups": groups}
