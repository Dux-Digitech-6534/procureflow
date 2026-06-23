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
MR_DRAFT_STATE = "Draft"
PRIORITIES = ["Low", "Medium", "High"]

# States where a workflow action MAY be available for the current user; others
# are terminal. We resolve the real actions via get_transitions(), which honours
# both the user's roles AND the transition conditions (e.g. the PO workflow's
# amount-based "<= 50000 place directly / > 50000 send for approval"). Computed
# only for these states to avoid loading every row's doc.
ACTIONABLE_STATES = {
    "Material Request": {"Draft", "Pending Approval", "Rejected"},
    "Purchase Order": {"Draft", "Pending", "Rejected"},
}


def _uniq(seq):
    """Order-preserving de-dup. A state can have several transition rows for the
    same action (one per allowed role), which would otherwise render duplicate
    buttons (e.g. Draft -> 'Send for Approval' for Supervisor AND MR Creator)."""
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _filter_owner_only_actions(doc, actions):
    """'Send for Approval' is the request OWNER's submit step (the SPA exposes it
    as the create/submit button on the editable form). Never offer it to another
    user — e.g. an approver who also holds the Supervisor role — on a document
    they did not create. Approve / Reject / Reopen are unaffected."""
    if frappe.session.user != getattr(doc, "owner", None):
        return [a for a in actions if "send for approval" not in (a or "").lower()]
    return actions


def _doc_actions(doctype, name, state):
    if state not in ACTIONABLE_STATES.get(doctype, set()):
        return []
    try:
        doc = frappe.get_doc(doctype, name)
        return _filter_owner_only_actions(doc, _uniq(t.action for t in get_transitions(doc)))
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
        transitions = _filter_owner_only_actions(doc, _uniq(t.action for t in get_transitions(doc)))
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


def _item_uoms_map(item_names, stock_uoms=None):
    """{item: [{uom, conversion_factor}]} for the multi-UOM line picker. Always
    includes the stock UOM (factor 1) first. Uses get_all, which bypasses the
    UOM Conversion Detail docperm so every SPA role gets the list."""
    item_names = [n for n in (item_names or []) if n]
    out = {}
    if item_names:
        for r in frappe.get_all(
            "UOM Conversion Detail",
            filters={"parent": ["in", item_names]},
            fields=["parent", "uom", "conversion_factor"],
            order_by="idx asc",
            limit_page_length=0,
        ):
            out.setdefault(r.parent, []).append({"uom": r.uom, "conversion_factor": flt(r.conversion_factor) or 1})
    # guarantee at least the stock UOM
    for name in item_names:
        su = (stock_uoms or {}).get(name) or frappe.db.get_value("Item", name, "stock_uom")
        rows = out.get(name) or []
        if su and not any(u["uom"] == su for u in rows):
            rows.insert(0, {"uom": su, "conversion_factor": 1})
        out[name] = rows
    return out


def _conversion_factor(item_code, uom, stock_uom):
    """Resolve a line's UOM conversion factor (stock-qty = qty * factor)."""
    if not uom or uom == stock_uom:
        return 1
    cf = frappe.db.get_value("UOM Conversion Detail", {"parent": item_code, "uom": uom}, "conversion_factor")
    return flt(cf) or 1


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
    umap = _item_uoms_map([it.name for it in items], {it.name: it.stock_uom for it in items})
    return [
        {
            "value": it.name,
            "label": it.item_name or it.name,
            "uom": it.stock_uom,
            "uoms": umap.get(it.name) or [{"uom": it.stock_uom, "conversion_factor": 1}],
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
    submit = bool(data.get("submit_for_approval"))

    if name:
        doc = frappe.get_doc("Material Request", name)
        if doc.docstatus != 0:
            frappe.throw(_("This Material Request is already submitted and cannot be edited."))
    else:
        doc = frappe.new_doc("Material Request")

    # Mandatory fields (match the desk form). Category is always needed (it scopes
    # the item picker); Project + Required-by + per-line qty are enforced when
    # submitting for approval, so an incomplete request can still be parked as a Draft.
    if not data.get("category"):
        frappe.throw(_("Select a Category."))
    if submit:
        if not data.get("project"):
            frappe.throw(_("Select a Project before submitting for approval."))
        if not data.get("schedule_date"):
            frappe.throw(_("Set the Required-by date before submitting for approval."))

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
    # New requests start as Draft; an existing doc keeps its current state so
    # "Save changes" never silently re-submits (e.g. a Rejected MR stays Rejected).
    if not doc.get("workflow_state"):
        doc.workflow_state = MR_DRAFT_STATE

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
                "conversion_factor": _conversion_factor(item.name, uom, item.stock_uom),
                "schedule_date": row.get("schedule_date") or doc.schedule_date,
                "warehouse": set_warehouse,
                "custom_specification": row.get("specification"),
                "custom_remark": row.get("remark"),
            },
        )

    if not doc.get("items"):
        frappe.throw(_("Add at least one item to the Material Request."))
    if submit and any(flt(it.qty) <= 0 for it in doc.get("items")):
        frappe.throw(_("Every item needs a quantity greater than zero before submitting for approval."))

    doc.save()

    if submit:
        # Resolve the live "send for approval" transition (Draft -> Pending
        # Approval) honouring the user's roles. If the user cannot send for
        # approval (no forward transition), DO NOT throw — that would roll back
        # the whole request (the just-saved draft would be lost). Instead leave
        # it saved as a Draft; the caller reports the actual resulting state.
        forward = [t.action for t in get_transitions(doc) if "reject" not in (t.action or "").lower()]
        if forward:
            apply_workflow(doc, forward[0])

    doc.reload()
    return {"name": doc.name, "workflow_state": doc.workflow_state, "docstatus": doc.docstatus}


# ---------------------------------------------------------------------------
# List + detail
# ---------------------------------------------------------------------------

@frappe.whitelist()
def mr_list(search="", limit=100):
    if not frappe.has_permission("Material Request", "read"):
        return []
    rows = frappe.get_list(
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
    umap = _item_uoms_map([it.item_code for it in doc.items])
    for it in doc.items:
        sub = frappe.db.get_value("Item", it.item_code, "custom_sub_category")
        items.append(
            {
                "item_code": it.item_code,
                "item_name": it.item_name,
                "qty": it.qty,
                "uom": it.uom,
                "uoms": umap.get(it.item_code) or [{"uom": it.uom, "conversion_factor": 1}],
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
TAX_TYPES = ["Intra-State (CGST + SGST)", "Inter-State (IGST)", "Unregistered / No GST"]
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
    umap = _item_uoms_map([it.item_code for it in doc.items])
    for it in doc.items:
        # Remaining qty in the line's transaction UOM. ordered_qty accumulates in
        # STOCK units (ERPNext maps PO Item.stock_qty -> MR Item.ordered_qty), so
        # subtract in stock units then convert back via conversion_factor.
        cf = flt(it.conversion_factor) or 1
        remaining_stock = flt(it.stock_qty) - flt(it.ordered_qty)
        remaining = (remaining_stock / cf) if remaining_stock > 0 else 0
        out.append(
            {
                "item_code": it.item_code,
                "item_name": it.item_name,
                "uom": it.uom,
                "uoms": umap.get(it.item_code) or [{"uom": it.uom, "conversion_factor": 1}],
                "qty": remaining,
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

    # One project per PO: every source material request must belong to the same
    # project (and therefore the same company). Mixing material requests from
    # different projects on one Purchase Order is not allowed.
    src_mrs = {row.get("material_request") for row in data.get("items", []) if row.get("material_request")}
    if src_mrs:
        mr_proj = {mr: frappe.db.get_value("Material Request", mr, "custom_select_project_") for mr in src_mrs}
        distinct = {p for p in mr_proj.values() if p}
        if len(distinct) > 1:
            frappe.throw(_(
                "A Purchase Order can include material requests from only one project. "
                "These requests belong to different projects: {0}."
            ).format(", ".join(f"{mr} → {proj or '—'}" for mr, proj in sorted(mr_proj.items()))))
        if distinct and project and next(iter(distinct)) != project:
            frappe.throw(_(
                "The Purchase Order project ({0}) does not match the project of its "
                "material requests ({1})."
            ).format(project, next(iter(distinct))))

    doc.supplier = supplier
    doc.company = _company()
    # Order date is user-settable so a PO can be back-dated; default to today.
    doc.transaction_date = data.get("transaction_date") or nowdate()
    doc.schedule_date = data.get("schedule_date") or doc.transaction_date
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
                "conversion_factor": _conversion_factor(item.name, row.get("uom") or item.stock_uom, item.stock_uom),
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
        # If the user cannot place/submit (no forward transition), leave the PO
        # as a saved Draft rather than throwing — throwing would roll back the
        # just-saved draft and lose the user's work. The caller reports the state.
        forward = [t.action for t in get_transitions(doc) if "reject" not in (t.action or "").lower()]
        if forward:
            apply_workflow(doc, forward[0])

    doc.reload()
    return {"name": doc.name, "workflow_state": doc.workflow_state, "docstatus": doc.docstatus}


@frappe.whitelist()
def po_list(limit=100):
    if not frappe.has_permission("Purchase Order", "read"):
        return []
    rows = frappe.get_list(
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
    umap = _item_uoms_map([it.item_code for it in doc.items])
    for it in doc.items:
        items.append(
            {
                "item_code": it.item_code,
                "item_name": it.item_name,
                "qty": it.qty,
                "uom": it.uom,
                "uoms": umap.get(it.item_code) or [{"uom": it.uom, "conversion_factor": 1}],
                "rate": it.rate,
                "gst_percent": it.get("custom_gst_percent"),
                "rate_with_tax": it.get("custom_rate_with_tax"),
                "amount": it.amount,
                "specification": it.get("custom_specification"),
                "remark": it.get("custom_remark"),
                "schedule_date": it.schedule_date,
                "material_request": it.get("material_request"),
                "material_request_item": it.get("material_request_item"),
                "sub_category": frappe.db.get_value("Item", it.item_code, "custom_sub_category"),
                "category": frappe.db.get_value("Item", it.item_code, "custom_category"),
            }
        )
    taxes = [
        {"description": t.description or t.account_head, "amount": t.tax_amount}
        for t in doc.get("taxes", [])
        if flt(t.tax_amount)
    ]
    material_requests = sorted({it.get("material_request") for it in doc.items if it.get("material_request")})
    can_change_status = bool(doc.docstatus == 1 and frappe.has_permission("Purchase Order", "submit", doc))
    return {
        "name": doc.name,
        "supplier": doc.supplier,
        "supplier_name": doc.supplier_name,
        "category": doc.custom_category,
        "project": doc.custom_project_name,
        "company": doc.get("custom_test_company_"),
        "tax_type": doc.get("custom_tax_type"),
        "remark": doc.custom_remark,
        "transaction_date": doc.transaction_date,
        "schedule_date": doc.schedule_date,
        "workflow_state": doc.workflow_state,
        "status": doc.status,
        "per_received": doc.per_received,
        "docstatus": doc.docstatus,
        "attachment": doc.get("custom_add_receipt"),
        "net_total": doc.net_total,
        "total_taxes": doc.total_taxes_and_charges,
        "grand_total": doc.grand_total,
        "rounding_adjustment": doc.get("rounding_adjustment"),
        "rounded_total": doc.get("rounded_total"),
        "material_requests": material_requests,
        "can_close": bool(can_change_status and doc.status != "Closed"),
        "can_reopen": bool(can_change_status and doc.status == "Closed"),
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
def set_po_status(name, action):
    """Manually Close / Re-open a submitted Purchase Order (ERPNext update_status,
    which re-derives downstream state safely). Respects submit permission."""
    doc = frappe.get_doc("Purchase Order", name)
    if not frappe.has_permission("Purchase Order", "submit", doc):
        raise frappe.PermissionError(_("You are not permitted to change this order's status."))
    if action == "close":
        doc.update_status("Closed")
    elif action == "reopen":
        doc.update_status("Draft")
    else:
        frappe.throw(_("Unsupported status action."))
    return {"name": doc.name, "status": doc.status, "docstatus": doc.docstatus}


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
        fields=["name", "supplier", "supplier_name", "custom_project_name", "grand_total", "transaction_date", "per_received"],
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
    if not frappe.has_permission("Purchase Receipt", "read"):
        return []
    rows = frappe.get_list(
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
        "docstatus": doc.docstatus,
        "total": info["total"],
        "paid": info["paid"],
        "outstanding": info["outstanding"],
        "material_image": doc.get("custom_add_material"),
        "invoice_image": doc.get("custom_add_invoice"),
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
def settings_can_create():
    """Which master doctypes the current user may CREATE — so the Settings page
    can hide the 'New' action (read-only) where the user lacks permission."""
    dts = [
        "Supplier", "Item", "Company Master", "Project Master",
        "Material Category", "Material Sub Category", "Warehouse", "UOM",
    ]
    return {dt: bool(frappe.has_permission(dt, "create")) for dt in dts}


@frappe.whitelist()
def rename_master(doctype, old_name, new_name, field=None):
    """Rename a master record — cascading the rename to every document that
    links to it — and sync its display field. Lets the Settings page edit a
    master's NAME safely (a plain field update would desync name vs links)."""
    allowed = {
        "Supplier", "Item", "Company Master", "Project Master",
        "Material Category", "Material Sub Category", "Warehouse", "UOM",
    }
    if doctype not in allowed:
        frappe.throw(_("Cannot rename {0}.").format(doctype))
    if not frappe.has_permission(doctype, "write"):
        frappe.throw(_("You are not allowed to edit {0}.").format(doctype))
    new_name = (new_name or "").strip()
    if not new_name:
        frappe.throw(_("Name is required."))
    if new_name != old_name:
        if frappe.db.exists(doctype, new_name):
            frappe.throw(_("{0} '{1}' already exists.").format(doctype, new_name))
        frappe.rename_doc(doctype, old_name, new_name, force=True, merge=False)
    if field and frappe.get_meta(doctype).has_field(field):
        frappe.db.set_value(doctype, new_name, field, new_name)
    frappe.db.commit()
    return new_name


@frappe.whitelist()
def update_master(doctype, name, values):
    """Update non-identity fields of a master record from the Settings page.
    Permission-checked; only the whitelisted master doctypes are editable."""
    allowed = {
        "Supplier", "Item", "Company Master", "Project Master",
        "Material Category", "Material Sub Category", "Warehouse", "UOM",
    }
    if doctype not in allowed:
        frappe.throw(_("Cannot edit {0}.").format(doctype))
    doc = frappe.get_doc(doctype, name)
    doc.check_permission("write")
    values = _loads(values) or {}
    meta = frappe.get_meta(doctype)
    for k, v in values.items():
        if meta.has_field(k):
            doc.set(k, v)
    doc.save()
    return doc.name


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


# ===========================================================================
# Profile, Notifications, Stock — mobile-app screens
# ===========================================================================

# Procurement roles surfaced first on the profile screen (most meaningful here).
_PROCURE_ROLES = [
    "PO Approver", "Purchase Officer", "Material Request Approval",
    "Purchase Manager", "Purchase User", "Supervisor", "Stock Manager", "Stock User",
]


@frappe.whitelist()
def user_info():
    """Identity for the mobile Profile screen: name/email/photo, company, roles."""
    user = frappe.session.user
    u = frappe.db.get_value("User", user, ["full_name", "email", "user_image"], as_dict=True) or {}
    roles = [r for r in frappe.get_roles(user) if r not in ("All", "Guest")]
    roles.sort(key=lambda r: (_PROCURE_ROLES.index(r) if r in _PROCURE_ROLES else 99, r))
    company = (
        frappe.defaults.get_user_default("company")
        or frappe.db.get_single_value("Global Defaults", "default_company")
    )
    return {
        "user": user,
        "full_name": u.get("full_name") or user,
        "email": u.get("email") or user,
        "user_image": u.get("user_image"),
        "company": company,
        "roles": roles,
    }


# --- Mobile screen-access policy: which ROLES unlock which screens ------------
# Explicit, app-level mapping (intentionally narrower than the broad Frappe read
# perms that Supervisor/Purchase User happen to grant). Edit these sets to retune
# who sees what on the mobile app. ADMIN roles unlock everything. The backend
# data endpoints remain Frappe-permission-gated regardless (security floor).
_CAP_ADMIN_ROLES = {"Administrator", "System Manager", "Purchase Manager"}
_CAP_CREATE_MR_ROLES = {"Material Request Creator", "Purchase User", "Supervisor", "Purchase Officer"}
_CAP_RECEIVE_ROLES = {"Supervisor", "Purchase User", "Purchase Officer"}
_CAP_APPROVE_ROLES = {"Material Request Approval", "PO Approver"}
_CAP_PO_BROWSE_ROLES = {"Purchase Officer", "PO Approver"}
_CAP_PR_BROWSE_ROLES = {"Purchase Officer", "PO Approver", "Supervisor"}
_CAP_STOCK_ROLES = {"Stock User", "Stock Manager"}


@frappe.whitelist()
def capabilities():
    """Per-user capability flags that drive which mobile screens/actions are shown,
    based on an EXPLICIT role→screen map (above). Admin roles unlock everything.
    UI gating only; the backend stays the source of truth (lists are
    permission-scoped, detail/save are permission-checked)."""
    roles = set(frappe.get_roles())
    is_admin = bool(roles & _CAP_ADMIN_ROLES)

    def has(role_set):
        return is_admin or bool(roles & role_set)

    return {
        "create_mr": has(_CAP_CREATE_MR_ROLES),
        "receive": has(_CAP_RECEIVE_ROLES),
        "read_po": has(_CAP_PO_BROWSE_ROLES),
        "read_pr": has(_CAP_PR_BROWSE_ROLES),
        "read_stock": has(_CAP_STOCK_ROLES),
        "approve": has(_CAP_APPROVE_ROLES),
    }


@frappe.whitelist()
def notifications(limit=20):
    """The current user's latest Frappe Notification Log entries + unread count."""
    user = frappe.session.user
    items = frappe.get_all(
        "Notification Log",
        filters={"for_user": user},
        fields=["name", "subject", "type", "document_type", "document_name", "read", "creation"],
        order_by="creation desc",
        limit_page_length=int(limit),
    )
    unread = frappe.db.count("Notification Log", {"for_user": user, "read": 0})
    return {"items": items, "unread": unread}


@frappe.whitelist()
def mark_notifications_read():
    """Mark all of the current user's notifications as read; returns new unread count."""
    user = frappe.session.user
    frappe.db.set_value("Notification Log", {"for_user": user, "read": 0}, "read", 1, update_modified=False)
    frappe.db.commit()
    return frappe.db.count("Notification Log", {"for_user": user, "read": 0})


@frappe.whitelist()
def stock_balances(search="", limit=500):
    """On-hand stock from Bin (item / warehouse / actual_qty) for the Stock screen.
    Only non-zero balances; item names attached; client-style search across
    item code, item name and warehouse over the fetched window."""
    if not frappe.has_permission("Bin", "read"):
        return []
    rows = frappe.get_list(
        "Bin",
        filters={"actual_qty": ["!=", 0]},
        fields=["item_code", "warehouse", "actual_qty", "stock_uom"],
        order_by="item_code asc",
        limit_page_length=int(limit),
    )
    codes = list({r.item_code for r in rows})
    names = {}
    if codes:
        for it in frappe.get_all("Item", filters={"name": ["in", codes]}, fields=["name", "item_name"], limit_page_length=0):
            names[it.name] = it.item_name
    s = (search or "").strip().lower()
    out = []
    for r in rows:
        r["item_name"] = names.get(r.item_code, r.item_code)
        if s and s not in (r.item_code or "").lower() and s not in (r.item_name or "").lower() and s not in (r.warehouse or "").lower():
            continue
        out.append(r)
    return out


# ============================================================
# REPORTS — one dispatcher (report_data) + XLSX export, sharing row builders.
# All scope-aware (a non-privileged user only sees their permitted projects).
# ============================================================
from collections import defaultdict
from procureflow import dashboard_api as _D
from frappe.utils import getdate


def _report_scope_projects():
    scope = _D.get_dashboard_scope()
    return None if scope.get("see_all") else (scope.get("projects") or [])


def _norm(kwargs):
    g = kwargs.get
    return {"from_date": g("from_date") or None, "to_date": g("to_date") or None,
            "project": g("project") or None, "supplier": g("supplier") or None,
            "category": g("category") or None, "state": g("state") or None,
            "item": g("item") or None, "bucket": g("bucket") or None,
            "search": (g("search") or "").strip() or None}


def _date_between(filters, field, fd, td):
    if fd and td:
        filters[field] = ["between", [fd, td]]
    elif fd:
        filters[field] = [">=", fd]
    elif td:
        filters[field] = ["<=", td]


def _scope_project(filters, project_field, requested):
    allowed = _report_scope_projects()
    if allowed is not None:
        if requested and requested in allowed:
            filters[project_field] = requested
        elif allowed:
            filters[project_field] = ["in", allowed]
        else:
            filters[project_field] = "__no_access__"
    elif requested:
        filters[project_field] = requested


# ---- builders: each takes the normalised filter dict, returns the FULL row list ----

def _rb_po_register(f):
    filters = {"docstatus": ["<", 2]}
    _date_between(filters, "transaction_date", f["from_date"], f["to_date"])
    if f["supplier"]:
        filters["supplier"] = f["supplier"]
    if f["category"]:
        filters["custom_category"] = f["category"]
    if f["state"]:
        filters["workflow_state"] = f["state"]
    _scope_project(filters, "custom_project_name", f["project"])
    or_filters = None
    if f["search"]:
        s = "%" + f["search"] + "%"
        or_filters = {"name": ["like", s], "supplier": ["like", s], "custom_project_name": ["like", s]}
    rows = frappe.get_all("Purchase Order", filters=filters, or_filters=or_filters,
                          fields=["name", "transaction_date", "supplier", "custom_project_name",
                                  "custom_test_company_", "custom_category", "custom_priority",
                                  "total", "total_taxes_and_charges", "grand_total", "rounded_total",
                                  "custom_tax_type", "per_received", "workflow_state", "status", "owner"],
                          order_by="transaction_date desc, creation desc", limit_page_length=0)
    for r in rows:
        r["grand_total"] = flt(r.get("rounded_total")) or flt(r.get("grand_total"))
    return rows


def _rb_mr_register(f):
    filters = {"material_request_type": "Purchase", "docstatus": ["<", 2]}
    _date_between(filters, "transaction_date", f["from_date"], f["to_date"])
    if f["category"]:
        filters["custom_category"] = f["category"]
    if f["state"]:
        filters["workflow_state"] = f["state"]
    _scope_project(filters, "custom_select_project_", f["project"])
    or_filters = None
    if f["search"]:
        s = "%" + f["search"] + "%"
        or_filters = {"name": ["like", s], "custom_select_project_": ["like", s]}
    return frappe.get_all("Material Request", filters=filters, or_filters=or_filters,
                          fields=["name", "transaction_date", "schedule_date", "custom_select_project_",
                                  "custom_category", "custom_priority", "owner", "per_ordered",
                                  "workflow_state", "status"],
                          order_by="transaction_date desc, creation desc", limit_page_length=0)


def _rb_grn_register(f):
    pf = _D.get_payment_dashboard_filters(project=f["project"], supplier=f["supplier"],
                                          from_date=f["from_date"], to_date=f["to_date"],
                                          search=f["search"], limit=1000)
    return _D.get_payment_dashboard_receipts(pf, limit=10000)


def _rb_payment_worklist(f):
    rows = [r for r in _rb_grn_register(f) if flt(r.get("outstanding_amount")) > 0]
    rows.sort(key=lambda r: (r.get("receipt_date") or ""))
    return rows


def _rb_outstanding_ageing(f):
    today = getdate(nowdate())
    out = []
    for r in _rb_grn_register(f):
        o = flt(r.get("outstanding_amount"))
        if o <= 0:
            continue
        rd = r.get("receipt_date")
        days = (today - getdate(rd)).days if rd else 0
        bucket = "0-30" if days <= 30 else "31-60" if days <= 60 else "61-90" if days <= 90 else "90+"
        out.append({**r, "days_outstanding": days, "bucket": bucket})
    want = f.get("bucket")
    if want and want != "all":
        out = [r for r in out if r["bucket"] == want]
    out.sort(key=lambda r: -r["days_outstanding"])
    # Attach the items bought on each receipt, so it's clear what each pending
    # payment is against (one batched query for all receipts in the result).
    pr_names = list({r.get("purchase_receipt") for r in out if r.get("purchase_receipt")})
    if pr_names:
        imap = defaultdict(list)
        for it in frappe.get_all(
            "Purchase Receipt Item",
            filters={"parent": ["in", pr_names]},
            fields=["parent", "item_name", "item_code"],
            order_by="idx asc",
            limit_page_length=0,
        ):
            imap[it["parent"]].append(it.get("item_name") or it.get("item_code"))
        for r in out:
            r["items"] = ", ".join(imap.get(r.get("purchase_receipt"), []))
    return out


def _rb_payment_register(f):
    filters = _D.get_dashboard_filters(project=f["project"], from_date=f["from_date"], to_date=f["to_date"])
    cond = ["pe.docstatus = 1"]
    vals = {}
    if f["from_date"] and f["to_date"]:
        cond.append("pe.payment_date between %(fd)s and %(td)s")
        vals["fd"] = f["from_date"]
        vals["td"] = f["to_date"]
    if f["supplier"]:
        cond.append("pr.supplier = %(sup)s")
        vals["sup"] = f["supplier"]
    scope = filters.get("scope") or {}
    if not scope.get("see_all", True):
        allowed = scope.get("projects") or ["__no_access__"]
        if f["project"] and f["project"] in allowed:
            cond.append("pr.custom_project_name = %(pj)s")
            vals["pj"] = f["project"]
        else:
            cond.append("pr.custom_project_name in %(pjs)s")
            vals["pjs"] = tuple(allowed)
    elif f["project"]:
        cond.append("pr.custom_project_name = %(pj)s")
        vals["pj"] = f["project"]
    where = " and ".join(cond)
    return frappe.db.sql(
        "select pe.name, pe.payment_date, pr.supplier, pr.custom_project_name project, "
        "pe.purchase_receipt, pe.amount "
        "from `tabProcureflow Payment Entry` pe "
        "join `tabPurchase Receipt` pr on pr.name = pe.purchase_receipt "
        "where " + where + " order by pe.payment_date desc, pe.creation desc limit 5000",
        vals, as_dict=True)


def _rb_supplier_spend(f):
    filters = _D.get_dashboard_filters(project=f["project"], from_date=f["from_date"], to_date=f["to_date"])
    spend = _D.get_grouped_sum("Purchase Order", filters, "supplier", limit=300)
    counts = {r["label"]: r["value"] for r in _D.get_grouped_count("Purchase Order", filters, "supplier", limit=300)}
    pf = _D.get_payment_dashboard_filters(project=f["project"], from_date=f["from_date"], to_date=f["to_date"], limit=1000)
    outm = defaultdict(float)
    for r in _D.get_payment_dashboard_receipts(pf, limit=10000):
        outm[r.get("supplier") or "Not Set"] += flt(r.get("outstanding_amount"))
    total = sum(flt(r["value"]) for r in spend)
    cum = 0.0
    rows = []
    for r in spend:
        s = r["label"]
        sp = flt(r["value"])
        cum += sp
        rows.append({"supplier": s, "po_count": int(counts.get(s, 0)), "total_spend": sp,
                     "pct": round(sp / total * 100, 1) if total else 0,
                     "cumulative_pct": round(cum / total * 100, 1) if total else 0,
                     "outstanding": flt(outm.get(s, 0))})
    return rows


def _rb_project_spend(f):
    pp = _D.project_portfolio(from_date=f["from_date"], to_date=f["to_date"])
    rows = pp["projects"]
    if f["project"]:
        rows = [r for r in rows if r["project"] == f["project"]]
    return rows


def _rb_item_history(f):
    filters = _D.get_dashboard_filters(project=f["project"], from_date=f["from_date"], to_date=f["to_date"])
    cond, vals = _D._po_conditions(filters, "po")
    if f["supplier"]:
        cond += " and po.supplier = %(sup)s"
        vals["sup"] = f["supplier"]
    if f["search"]:
        cond += " and (poi.item_code like %(it)s or poi.item_name like %(it)s)"
        vals["it"] = "%" + f["search"] + "%"
    return frappe.db.sql(
        "select poi.item_code, poi.item_name, poi.parent po_no, po.transaction_date, "
        "po.supplier, po.custom_project_name project, poi.qty, poi.uom, poi.rate, "
        "poi.custom_gst_percent gst_percent, poi.custom_rate_with_tax rate_with_tax, poi.amount "
        "from `tabPurchase Order Item` poi join `tabPurchase Order` po on po.name = poi.parent "
        "where " + cond + " order by po.transaction_date desc, poi.parent limit 5000",
        vals, as_dict=True)


def _rb_gst_summary(f):
    filters = _D.get_dashboard_filters(project=f["project"], from_date=f["from_date"], to_date=f["to_date"])
    cond, vals = _D._po_conditions(filters, "po")
    if f["supplier"]:
        cond += " and po.supplier = %(sup)s"
        vals["sup"] = f["supplier"]
    base = frappe.db.sql(
        "select po.supplier, coalesce(po.custom_tax_type,'') tax_type, "
        "sum(po.total) net, sum(po.grand_total) grand, count(*) n "
        "from `tabPurchase Order` po where " + cond +
        " group by po.supplier, po.custom_tax_type", vals, as_dict=True)
    tax = frappe.db.sql(
        "select po.supplier, coalesce(po.custom_tax_type,'') tax_type, ptc.account_head, sum(ptc.tax_amount) amt "
        "from `tabPurchase Order` po join `tabPurchase Taxes and Charges` ptc on ptc.parent = po.name "
        "where " + cond + " group by po.supplier, po.custom_tax_type, ptc.account_head", vals, as_dict=True)
    cg, sg, ig = defaultdict(float), defaultdict(float), defaultdict(float)
    for r in tax:
        h = (r["account_head"] or "").upper()
        a = flt(r["amt"])
        k = (r["supplier"], r["tax_type"])
        if "IGST" in h:
            ig[k] += a
        elif "SGST" in h or "UTGST" in h:
            sg[k] += a
        elif "CGST" in h:
            cg[k] += a
    rows = []
    for r in base:
        k = (r["supplier"], r["tax_type"])
        rows.append({"supplier": r["supplier"], "tax_type": r["tax_type"] or "—",
                     "taxable": flt(r["net"]), "cgst": cg.get(k, 0), "sgst": sg.get(k, 0), "igst": ig.get(k, 0),
                     "total_tax": cg.get(k, 0) + sg.get(k, 0) + ig.get(k, 0),
                     "grand_total": flt(r["grand"]), "po_count": int(r["n"])})
    rows.sort(key=lambda r: -r["grand_total"])
    return rows


_REPORTS = {
    "po-register": (_rb_po_register, [
        ("name", "PO No.", "text"), ("transaction_date", "Date", "date"), ("supplier", "Supplier", "text"),
        ("custom_project_name", "Project", "text"), ("custom_test_company_", "Company", "text"),
        ("custom_category", "Category", "text"), ("total", "Net", "money"),
        ("total_taxes_and_charges", "Tax", "money"), ("grand_total", "Grand Total", "money"),
        ("custom_tax_type", "Tax Type", "text"), ("per_received", "% Received", "pct"),
        ("workflow_state", "Status", "text")]),
    "mr-register": (_rb_mr_register, [
        ("name", "MR No.", "text"), ("transaction_date", "Date", "date"), ("schedule_date", "Required By", "date"),
        ("custom_select_project_", "Project", "text"), ("custom_category", "Category", "text"),
        ("custom_priority", "Priority", "text"), ("owner", "Requester", "text"),
        ("per_ordered", "% Ordered", "pct"), ("workflow_state", "Status", "text")]),
    "grn-register": (_rb_grn_register, [
        ("purchase_receipt", "Receipt", "text"), ("receipt_date", "Posting Date", "date"),
        ("supplier", "Supplier", "text"), ("project", "Project", "text"), ("company", "Company", "text"),
        ("total_amount", "Grand Total", "money"), ("paid_amount", "Paid", "money"),
        ("outstanding_amount", "Outstanding", "money"), ("payment_status", "Payment", "text")]),
    "payment-worklist": (_rb_payment_worklist, [
        ("purchase_receipt", "Receipt", "text"), ("supplier", "Supplier", "text"), ("project", "Project", "text"),
        ("receipt_date", "Receipt Date", "date"), ("total_amount", "Total", "money"),
        ("paid_amount", "Paid", "money"), ("outstanding_amount", "Outstanding", "money"),
        ("progress_percent", "Progress", "pct"), ("payment_status", "Status", "text")]),
    "payment-register": (_rb_payment_register, [
        ("name", "Payment No.", "text"), ("payment_date", "Date", "date"), ("supplier", "Supplier", "text"),
        ("project", "Project", "text"), ("purchase_receipt", "Receipt", "text"), ("amount", "Amount", "money")]),
    "outstanding-ageing": (_rb_outstanding_ageing, [
        ("purchase_receipt", "Receipt", "text"), ("supplier", "Supplier", "text"), ("project", "Project", "text"),
        ("items", "Items", "text"),
        ("receipt_date", "Posting Date", "date"), ("days_outstanding", "Days", "num"),
        ("total_amount", "Total", "money"), ("paid_amount", "Paid", "money"),
        ("outstanding_amount", "Outstanding", "money"), ("bucket", "Ageing", "text")]),
    "supplier-spend": (_rb_supplier_spend, [
        ("supplier", "Supplier", "text"), ("po_count", "POs", "num"), ("total_spend", "Spend", "money"),
        ("pct", "% Spend", "pct"), ("cumulative_pct", "Cumulative %", "pct"), ("outstanding", "Outstanding", "money")]),
    "project-spend": (_rb_project_spend, [
        ("project", "Project", "text"), ("committed", "Committed", "money"), ("received", "Received", "money"),
        ("paid", "Paid", "money"), ("outstanding", "Outstanding", "money"), ("receipts", "Receipts", "num")]),
    "item-history": (_rb_item_history, [
        ("item_code", "Item", "text"), ("item_name", "Name", "text"), ("po_no", "PO No.", "text"),
        ("transaction_date", "Date", "date"), ("supplier", "Supplier", "text"), ("project", "Project", "text"),
        ("qty", "Qty", "num"), ("uom", "UOM", "text"), ("rate", "Rate", "money"),
        ("gst_percent", "GST %", "pct"), ("rate_with_tax", "Rate w/ tax", "money"), ("amount", "Amount", "money")]),
    "gst-summary": (_rb_gst_summary, [
        ("supplier", "Supplier", "text"), ("tax_type", "Tax Type", "text"), ("taxable", "Taxable", "money"),
        ("cgst", "CGST", "money"), ("sgst", "SGST", "money"), ("igst", "IGST", "money"),
        ("total_tax", "Total Tax", "money"), ("grand_total", "Grand Total", "money"), ("po_count", "POs", "num")]),
}


def _rb_item_comparison(f):
    item = f.get("item")
    if not item:
        return []
    filters = _D.get_dashboard_filters(project=f["project"], from_date=f["from_date"], to_date=f["to_date"])
    cond, vals = _D._po_conditions(filters, "po")
    vals["item"] = item
    extra = " and poi.item_code = %(item)s"
    if f["supplier"]:
        extra += " and po.supplier = %(sup)s"
        vals["sup"] = f["supplier"]
    raw = frappe.db.sql(
        "select po.supplier sup, po.transaction_date d, poi.rate rate, poi.uom uom "
        "from `tabPurchase Order Item` poi join `tabPurchase Order` po on po.name = poi.parent "
        "where " + cond + extra + " order by po.transaction_date", vals, as_dict=True)
    bysup = {}
    for r in raw:
        bysup.setdefault(r["sup"], []).append(r)
    rows = []
    for sup, lst in bysup.items():
        rates = [flt(x["rate"]) for x in lst]
        rows.append({"supplier": sup, "uom": lst[-1].get("uom"), "po_count": len(lst),
                     "first_rate": flt(lst[0]["rate"]), "latest_rate": flt(lst[-1]["rate"]),
                     "min_rate": min(rates), "max_rate": max(rates),
                     "avg_rate": round(sum(rates) / len(rates), 2), "last_purchase": str(lst[-1]["d"])})
    if rows:
        gmin = min(r["latest_rate"] for r in rows)
        for r in rows:
            r["pct_above_min"] = round((r["latest_rate"] - gmin) / gmin * 100, 1) if gmin else 0
    rows.sort(key=lambda r: r["latest_rate"])
    return rows


def _rb_supplier_statement(f):
    sup = f.get("supplier")
    if not sup:
        return []
    filters = _D.get_dashboard_filters(project=f["project"], from_date=f["from_date"], to_date=f["to_date"])
    scope = filters.get("scope") or {}
    scoped = None if scope.get("see_all", True) else (scope.get("projects") or ["__no_access__"])

    pr_filters = {"supplier": sup, "docstatus": 1}
    _date_between(pr_filters, "posting_date", f["from_date"], f["to_date"])
    _scope_project(pr_filters, "custom_project_name", f["project"])
    prs = frappe.get_all("Purchase Receipt", filters=pr_filters,
                         fields=["name", "posting_date", "custom_project_name", "rounded_total", "grand_total"],
                         limit_page_length=0)
    entries = []
    for pr in prs:
        amt = flt(pr.rounded_total) or flt(pr.grand_total)
        entries.append({"date": str(pr.posting_date), "type": "Receipt", "document": pr.name,
                        "project": pr.custom_project_name, "debit": amt, "credit": 0})

    cond = ["pe.docstatus = 1", "pr.supplier = %(sup)s"]
    vals = {"sup": sup}
    if f["from_date"] and f["to_date"]:
        cond.append("pe.payment_date between %(fd)s and %(td)s")
        vals["fd"] = f["from_date"]
        vals["td"] = f["to_date"]
    if scoped is not None:
        cond.append("pr.custom_project_name in %(pjs)s")
        vals["pjs"] = tuple(scoped)
    elif f["project"]:
        cond.append("pr.custom_project_name = %(pj)s")
        vals["pj"] = f["project"]
    pays = frappe.db.sql(
        "select pe.name, pe.payment_date d, pr.custom_project_name proj, pe.amount "
        "from `tabProcureflow Payment Entry` pe join `tabPurchase Receipt` pr on pr.name = pe.purchase_receipt "
        "where " + " and ".join(cond) + " order by pe.payment_date", vals, as_dict=True)
    for p in pays:
        entries.append({"date": str(p["d"]), "type": "Payment", "document": p["name"],
                        "project": p["proj"], "debit": 0, "credit": flt(p["amount"])})

    entries.sort(key=lambda e: (e["date"], 0 if e["type"] == "Receipt" else 1))
    bal = 0.0
    for e in entries:
        bal += e["debit"] - e["credit"]
        e["balance"] = bal
    return entries


_REPORTS["item-comparison"] = (_rb_item_comparison, [
    ("supplier", "Supplier", "text"), ("uom", "UOM", "text"), ("po_count", "POs", "num"),
    ("first_rate", "First Rate", "money"), ("latest_rate", "Latest Rate", "money"),
    ("min_rate", "Min", "money"), ("max_rate", "Max", "money"), ("avg_rate", "Avg", "money"),
    ("pct_above_min", "% Above Min", "pct"), ("last_purchase", "Last Purchase", "date")])

_REPORTS["supplier-statement"] = (_rb_supplier_statement, [
    ("date", "Date", "date"), ("type", "Type", "text"), ("document", "Document", "text"),
    ("project", "Project", "text"), ("debit", "Debit (received)", "money"),
    ("credit", "Credit (paid)", "money"), ("balance", "Balance", "money")])


@frappe.whitelist()
def report_items():
    """Item options for report pickers (Item Price Comparison)."""
    return frappe.get_all("Item", filters={"disabled": 0}, fields=["name", "item_name"],
                          order_by="item_name", limit_page_length=0)


@frappe.whitelist()
def report_data(report, limit=500, start=0, **kwargs):
    if report not in _REPORTS:
        frappe.throw(_("Unknown report: {0}").format(report))
    builder, cols = _REPORTS[report]
    rows = builder(_norm(kwargs))
    total = len(rows)
    start, limit = int(start), int(limit)
    return {"rows": rows[start:start + limit], "total": total, "start": start, "limit": limit,
            "columns": [{"key": k, "label": l, "type": t} for (k, l, t) in cols]}


@frappe.whitelist()
def export_report_xlsx(report, **kwargs):
    if report not in _REPORTS:
        frappe.throw(_("Unknown report: {0}").format(report))
    from frappe.utils.xlsxutils import make_xlsx
    builder, cols = _REPORTS[report]
    rows = builder(_norm(kwargs))
    data = [[l for (k, l, t) in cols]]
    for r in rows:
        line = []
        for (k, l, t) in cols:
            v = r.get(k)
            if t in ("money", "num", "pct"):
                line.append(flt(v) if v is not None else 0)
            elif t == "date":
                line.append(str(v) if v else "")
            else:
                line.append("" if v is None else str(v))
        data.append(line)
    xlsx = make_xlsx(data, report[:30])
    frappe.response["filename"] = report + ".xlsx"
    frappe.response["filecontent"] = xlsx.getvalue()
    frappe.response["type"] = "binary"


@frappe.whitelist()
def export_report_pdf(report, **kwargs):
    if report not in _REPORTS:
        frappe.throw(_("Unknown report: {0}").format(report))
    from frappe.utils.pdf import get_pdf
    from frappe.utils import fmt_money, escape_html
    builder, cols = _REPORTS[report]
    rows = builder(_norm(kwargs))
    title = report.replace("-", " ").title()

    def fmt(v, t):
        if v is None or v == "":
            return ""
        if t == "money":
            return fmt_money(flt(v), currency="INR")
        if t == "pct":
            return f"{flt(v):g}%"
        return escape_html(str(v))

    head = "".join(f"<th class='{'r' if t in ('money','num','pct') else ''}'>{escape_html(l)}</th>" for (k, l, t) in cols)
    body = ""
    for r in rows:
        tds = "".join(f"<td class='{'r' if t in ('money','num','pct') else ''}'>{fmt(r.get(k), t)}</td>" for (k, l, t) in cols)
        body += f"<tr>{tds}</tr>"
    html = f"""
    <style>
      body {{ font-family: Helvetica, Arial, sans-serif; color: #1A2030; }}
      h2 {{ margin: 0 0 2px; font-size: 16px; }}
      .meta {{ color: #8A93A3; font-size: 10px; margin-bottom: 10px; }}
      table {{ width: 100%; border-collapse: collapse; font-size: 9px; }}
      th, td {{ border: 1px solid #DCDFE6; padding: 4px 6px; text-align: left; }}
      th {{ background: #F0F1F5; text-transform: uppercase; font-size: 8px; letter-spacing: .03em; }}
      td.r, th.r {{ text-align: right; }}
    </style>
    <h2>{escape_html(title)}</h2>
    <div class="meta">Sanskruti Group · {len(rows)} rows · generated {nowdate()}</div>
    <table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>
    """
    frappe.response["filename"] = report + ".pdf"
    frappe.response["filecontent"] = get_pdf(html, {"orientation": "Landscape" if len(cols) > 6 else "Portrait"})
    frappe.response["type"] = "pdf"


# Back-compat thin wrappers (older frontend bundles call these directly).
@frappe.whitelist()
def po_register(**kwargs):
    return report_data("po-register", **kwargs)


@frappe.whitelist()
def payment_worklist(**kwargs):
    return report_data("payment-worklist", **kwargs)
