"""Thin whitelisted endpoints for the procureflow React SPA (served at /procureflow).

These DO NOT change the existing desk UI or the buying-cycle backend. They read
the same doctypes the desk uses and create Material Requests through the normal
ERPNext document API, so workflow, MR->SQ->PO linkage and downstream payment all
keep working. Category filtering here is INCLUSIVE (category only, any/no
sub-category) — the React front-door's one deliberate difference from the desk
picker.
"""

import hashlib
import hmac
import json
import re

import frappe
from frappe import _
from frappe.model.workflow import apply_workflow, get_transitions
from frappe.utils import cint, flt, now_datetime, nowdate

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


def _filter_project_approval_actions(doc, actions):
    """Keep the SPA's Approve/Reject buttons in sync with the project_wise_mr_approval
    app (if installed): only show them to a user actually allowed to approve THIS
    Material Request's project (its mapped approver, a Purchase Officer, or when the
    request has no project). Without this the SPA would offer Approve/Reject on every
    project's request (Frappe's core get_transitions is project-unaware) and the click
    would then be rejected server-side. No-op if the app isn't installed."""
    if getattr(doc, "doctype", None) != "Material Request":
        return actions
    try:
        from project_wise_mr_approval.api import can_user_approve_mr_doc
    except Exception:
        return actions
    try:
        if can_user_approve_mr_doc(doc):
            return actions
    except Exception:
        return actions
    return [a for a in actions if (a or "").lower() not in ("approve", "reject")]


def _doc_actions(doctype, name, state):
    if state not in ACTIONABLE_STATES.get(doctype, set()):
        return []
    try:
        doc = frappe.get_doc(doctype, name)
        acts = _filter_owner_only_actions(doc, _uniq(t.action for t in get_transitions(doc)))
        return _filter_project_approval_actions(doc, acts)
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
        transitions = _filter_project_approval_actions(doc, transitions)
    except Exception:
        transitions = []
    can_cancel = bool(doc.docstatus == 1 and frappe.has_permission(doc.doctype, "cancel", doc))
    already_amended = bool(frappe.db.exists(doc.doctype, {"amended_from": doc.name}))
    can_amend = bool(
        doc.docstatus == 2 and not already_amended and frappe.has_permission(doc.doctype, "amend", doc)
    )
    # A cancelled doc (docstatus 2) can be permanently deleted (with delete perm).
    can_delete = bool(doc.docstatus == 2 and frappe.has_permission(doc.doctype, "delete", doc))
    return {"transitions": transitions, "can_cancel": can_cancel, "can_amend": can_amend, "can_delete": can_delete}


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
                # Inherit the header Required-by so ERPNext's validate_schedule_date
                # (header = min(item dates)) recomputes to the SAME value — otherwise
                # a changed header gets reverted to the stale line dates on save.
                "schedule_date": doc.schedule_date,
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
            "per_ordered",
            "per_received",
            "custom_rejection_remark",
        ],
        order_by="modified desc",
        limit_page_length=int(limit),
    )
    rows = _hide_amended_originals("Material Request", rows)
    names = [r.name for r in rows]
    counts = {}
    cancelled_order = set()
    if names:
        for r in frappe.get_all(
            "Material Request Item",
            filters={"parent": ["in", names]},
            fields=["parent"],
            limit_page_length=0,
        ):
            counts[r.parent] = counts.get(r.parent, 0) + 1
        # MRs whose linked PO was cancelled (so the UI can show it distinctly,
        # not as a fresh green "Approved" after the order was reverted).
        for r in frappe.get_all(
            "Purchase Order Item",
            filters={"material_request": ["in", names], "docstatus": 2},
            fields=["material_request"],
            limit_page_length=0,
        ):
            cancelled_order.add(r.material_request)
    # MRs that STILL have a live (submitted) PO — so a cancelled order that was
    # re-ordered/amended shows as Ordered, while one with no live PO left shows
    # as Order cancelled even if ERPNext's status field is stale.
    active_order = set()
    if names:
        for r in frappe.get_all(
            "Purchase Order Item",
            filters={"material_request": ["in", names], "docstatus": 1},
            fields=["material_request"],
            limit_page_length=0,
        ):
            active_order.add(r.material_request)
    search = (search or "").strip().lower()
    out = []
    for r in rows:
        if search and search not in (r.name or "").lower() and search not in (
            r.custom_select_project_ or ""
        ).lower():
            continue
        r["items"] = counts.get(r.name, 0)
        r["had_cancelled_order"] = r.name in cancelled_order
        r["has_active_order"] = r.name in active_order
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
        "rejection_remark": doc.get("custom_rejection_remark"),
        "workflow_state": doc.workflow_state,
        "status": doc.status,
        "docstatus": doc.docstatus,
        "owner": doc.owner,
        "per_ordered": doc.get("per_ordered"),
        "per_received": doc.get("per_received"),
        "had_cancelled_order": bool(
            frappe.get_all(
                "Purchase Order Item",
                filters={"material_request": doc.name, "docstatus": 2},
                limit_page_length=1,
            )
        ),
        "has_active_order": bool(
            frappe.get_all(
                "Purchase Order Item",
                filters={"material_request": doc.name, "docstatus": 1},
                limit_page_length=1,
            )
        ),
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

# Editable default PO Terms & Conditions. Stored as a normal "Terms and Conditions"
# master record so it is a standard ERPNext template too. Edited from the Settings
# page, prefilled into each new PO (-> doc.terms), and the print format's fallback.
PO_TERMS_DOC = "Default PO Terms"
# Stored as one <div> per line (NOT an <ol>) so the print shows the text exactly as
# written — numbering is part of the text and fully user-controlled.
DEFAULT_PO_TERMS_HTML = (
    "<div>1. Please supply the materials as per the specifications, quality and quantity mentioned above.</div>"
    "<div>2. Delivery must be completed on or before the required by date.</div>"
    "<div>3. All invoices must be raised in the name of the company.</div>"
    "<div>4. Payment will be made as per the agreed payment terms.</div>"
    "<div>5. Goods once supplied will not be taken back.</div>"
)


def _po_terms_default():
    """Default PO Terms HTML. Seeds the 'Default PO Terms' master (with the
    original hardcoded list) on first access, so there is always an editable
    record and the print format's fallback resolves to it."""
    terms = frappe.db.get_value("Terms and Conditions", PO_TERMS_DOC, "terms")
    if terms is None:
        doc = frappe.new_doc("Terms and Conditions")
        doc.title = PO_TERMS_DOC
        if doc.meta.has_field("buying"):
            doc.buying = 1
        if doc.meta.has_field("selling"):
            doc.selling = 0
        doc.terms = DEFAULT_PO_TERMS_HTML
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        terms = DEFAULT_PO_TERMS_HTML
    return terms or ""


@frappe.whitelist()
def get_po_terms():
    """Default PO Terms & Conditions — for the Settings editor and the New PO
    prefill. can_edit gates the Settings save button."""
    return {
        "terms": _po_terms_default(),
        "can_edit": bool(frappe.has_permission("Terms and Conditions", "write")),
    }


@frappe.whitelist()
def save_po_terms(terms):
    """Update the editable default PO Terms & Conditions (Settings page)."""
    if not frappe.has_permission("Terms and Conditions", "write"):
        frappe.throw(_("You are not allowed to edit terms & conditions."))
    _po_terms_default()  # ensure the record exists
    doc = frappe.get_doc("Terms and Conditions", PO_TERMS_DOC)
    doc.terms = terms or ""
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"terms": doc.terms}


TOLERANCE_DOCTYPE = "Purchase Receipt Tolerance Settings"


def _is_platform_admin():
    return bool(set(frappe.get_roles()) & {"Administrator", "System Manager"})


# A delegated admin who may edit EVERYTHING in the ProcureFlow Settings area
# (all masters, PO terms, over-receipt tolerance and users) WITHOUT being a full
# ERPNext System Manager. Master + T&C editing is granted to this role via normal
# doctype permissions; the app-level toggles (tolerance, user management) are gated
# in code below so they recognise this role too.
SETTINGS_MANAGER_ROLE = "Settings Manager"


def _can_manage_settings():
    """May edit the app-level Settings toggles (over-receipt tolerance): a platform
    admin or a delegated Settings Manager."""
    return _is_platform_admin() or SETTINGS_MANAGER_ROLE in set(frappe.get_roles())


@frappe.whitelist()
def get_tolerance():
    """Over-receipt tolerance settings for the Settings panel."""
    return {
        "enabled": bool(frappe.db.get_single_value(TOLERANCE_DOCTYPE, "enable_global_tolerance")),
        "pct": flt(frappe.db.get_single_value(TOLERANCE_DOCTYPE, "global_tolerance_percentage")),
        "can_edit": _can_manage_settings(),
    }


@frappe.whitelist()
def save_tolerance(enabled, pct):
    """Set the global over-receipt allowance. System Manager or Settings Manager
    only (it loosens receipt validation)."""
    if not _can_manage_settings():
        frappe.throw(_("Only a System Manager or Settings Manager can change the over-receipt tolerance."), frappe.PermissionError)
    p = flt(pct)
    if p < 0 or p > 100:
        frappe.throw(_("Tolerance must be between 0 and 100%."))
    doc = frappe.get_single(TOLERANCE_DOCTYPE)
    doc.enable_global_tolerance = 1 if cint(enabled) else 0
    doc.global_tolerance_percentage = p
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"enabled": bool(doc.enable_global_tolerance), "pct": flt(doc.global_tolerance_percentage)}


# ===========================================================================
# Approval routing (project -> MR approver)
# ===========================================================================
# A Settings UI over the separate `project_wise_mr_approval` app's mappings:
# each row routes a project's Material Requests to a specific approver. If that
# app isn't installed (its doctype missing) every endpoint degrades gracefully so
# the Settings tab simply hides. Writes are code-gated (admins / Settings Manager
# / Purchase Officer) then done with ignore_permissions, matching our other
# settings endpoints.
PWMA_APPROVER_DOCTYPE = "Project Wise MR Approver"


def _approval_routing_available():
    return bool(frappe.db.exists("DocType", PWMA_APPROVER_DOCTYPE))


def _can_manage_approval_routing():
    roles = set(frappe.get_roles())
    return _is_platform_admin() or SETTINGS_MANAGER_ROLE in roles or "Purchase Officer" in roles


def _require_approval_routing():
    if not _approval_routing_available():
        frappe.throw(_("The project-wise approval feature is not installed."))
    if not _can_manage_approval_routing():
        frappe.throw(_("You are not allowed to manage approval routing."), frappe.PermissionError)


@frappe.whitelist()
def approval_routing_context():
    """Whether the project-wise MR approval feature is available and manageable —
    drives whether the Settings 'Approvals' tab shows."""
    return {
        "available": _approval_routing_available(),
        "can_manage": _can_manage_approval_routing(),
    }


@frappe.whitelist()
def approval_mappings():
    """All project -> approver mappings, with the approver's display name."""
    if not _approval_routing_available():
        return []
    rows = frappe.get_all(
        PWMA_APPROVER_DOCTYPE,
        fields=["name", "project", "approver_user", "enabled", "modified"],
        order_by="project asc",
        limit_page_length=0,
    )
    user_names = list({r.approver_user for r in rows if r.approver_user})
    names = {}
    if user_names:
        names = {
            u.name: u.full_name
            for u in frappe.get_all("User", filters={"name": ["in", user_names]}, fields=["name", "full_name"])
        }
    for r in rows:
        r["approver_name"] = names.get(r.approver_user) or r.approver_user
        r["enabled"] = bool(r.enabled)
    return rows


@frappe.whitelist()
def approval_mapping_options():
    """Projects + candidate approver users for the mapping pickers."""
    if not _approval_routing_available():
        return {"projects": [], "users": []}
    projects = [
        p.name for p in frappe.get_all("Project Master", fields=["name"], order_by="name asc", limit_page_length=0)
    ]
    users = [
        {"value": u.name, "label": u.full_name or u.name}
        for u in frappe.get_all(
            "User",
            filters={"enabled": 1, "user_type": "System User"},
            fields=["name", "full_name"],
            order_by="full_name asc",
            limit_page_length=0,
        )
        if u.name not in ("Administrator", "Guest")
    ]
    return {"projects": projects, "users": users}


@frappe.whitelist()
def save_approval_mapping(name=None, project=None, approver_user=None, enabled=1):
    """Create or update a project -> approver mapping."""
    _require_approval_routing()
    project = (project or "").strip()
    approver_user = (approver_user or "").strip()
    if not project:
        frappe.throw(_("Select a project."))
    if not approver_user:
        frappe.throw(_("Select an approver."))
    # One row per (project, approver) pair.
    dup = frappe.db.exists(
        PWMA_APPROVER_DOCTYPE,
        {"project": project, "approver_user": approver_user, "name": ["!=", name or ""]},
    )
    if dup:
        frappe.throw(_("That project and approver are already mapped."))
    doc = frappe.get_doc(PWMA_APPROVER_DOCTYPE, name) if name else frappe.new_doc(PWMA_APPROVER_DOCTYPE)
    doc.project = project
    doc.approver_user = approver_user
    doc.enabled = 1 if cint(enabled) else 0
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"name": doc.name}


@frappe.whitelist()
def save_approval_mappings(approver_user, projects, enabled=1):
    """Bulk-map ONE approver to MANY projects in a single step — one row per
    project. Skips (project, approver) pairs that already exist. Returns which
    were created vs already present."""
    _require_approval_routing()
    approver_user = (approver_user or "").strip()
    project_list = json.loads(projects) if isinstance(projects, str) else (projects or [])
    project_list = [p for p in project_list if p]
    if not approver_user:
        frappe.throw(_("Select an approver."))
    if not project_list:
        frappe.throw(_("Select at least one project."))
    created, skipped = [], []
    for p in project_list:
        if frappe.db.exists(PWMA_APPROVER_DOCTYPE, {"project": p, "approver_user": approver_user}):
            skipped.append(p)
            continue
        doc = frappe.new_doc(PWMA_APPROVER_DOCTYPE)
        doc.project = p
        doc.approver_user = approver_user
        doc.enabled = 1 if cint(enabled) else 0
        doc.save(ignore_permissions=True)
        created.append(p)
    frappe.db.commit()
    return {"created": created, "skipped": skipped}


@frappe.whitelist()
def delete_approval_mapping(name):
    """Remove a project -> approver mapping."""
    _require_approval_routing()
    if frappe.db.exists(PWMA_APPROVER_DOCTYPE, name):
        frappe.delete_doc(PWMA_APPROVER_DOCTYPE, name, ignore_permissions=True)
        frappe.db.commit()
    return {"deleted": True, "name": name}


# ===========================================================================
# Activity / change history (audit trail) — reads ERPNext's Version records
# ===========================================================================
_ACTIVITY_DOCTYPES = {"Material Request", "Purchase Order", "Purchase Receipt", "Procureflow Payment Entry"}
_ACTIVITY_SKIP = {
    "modified", "modified_by", "creation", "owner", "_seen", "_comments", "_assign",
    "_liked_by", "_user_tags", "naming_series", "idx", "lft", "rgt", "doctype",
}
# Derived / recomputed-on-save fields that add noise to the timeline.
_ACTIVITY_NOISE = {
    "in_words", "total_taxes_and_charges", "tax_amount", "tax_amount_after_discount_amount",
    "item_wise_tax_detail", "item_tax_rate", "price_list_rate", "total", "net_total",
    "rounding_adjustment", "outstanding_amount", "taxes_and_charges_added", "taxes_and_charges_deducted",
    "other_charges_calculation", "custom_approved_by_signature", "custom_authorized_signature",
    "custom_company_signature",
}
# Auto-managed child tables (rebuilt by the tax/payment engine on every save).
_ACTIVITY_NOISE_TABLES = {"taxes", "payment_schedule"}


def _skip_field(fn):
    return (not fn) or fn in _ACTIVITY_SKIP or fn.startswith("base_") or fn in _ACTIVITY_NOISE


def _skip_table(tbl):
    return (not tbl) or tbl in _ACTIVITY_NOISE_TABLES or "tax" in tbl.lower()


def _uname(user, cache):
    if not user:
        return ""
    if user not in cache:
        cache[user] = frappe.db.get_value("User", user, "full_name") or user
    return cache[user]


def _fmt_val(v):
    if v is None or v == "":
        return "—"
    s = re.sub(r"<[^>]+>", " ", str(v))
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        return "—"
    return (s[:80] + "…") if len(s) > 80 else s


@frappe.whitelist()
def doc_activity(doctype, name):
    """Created/edited audit trail for a document: who created it, who last changed
    it, and a timeline of field-level changes parsed from ERPNext's Version log."""
    if doctype not in _ACTIVITY_DOCTYPES:
        frappe.throw(_("Activity is not available for this document."))
    doc = frappe.get_doc(doctype, name)
    doc.check_permission("read")
    meta = frappe.get_meta(doctype)
    cache = {}

    def label(fn):
        f = meta.get_field(fn)
        return f.label if (f and f.label) else frappe.unscrub(fn or "")

    entries = []
    for v in frappe.get_all(
        "Version",
        filters={"ref_doctype": doctype, "docname": name},
        fields=["owner", "creation", "data"],
        order_by="creation asc",
    ):
        try:
            j = json.loads(v.data or "{}")
        except Exception:
            j = {}
        changes = []
        kind = "edit"
        for ch in j.get("changed", []) or []:
            if not ch:
                continue
            fn = ch[0]
            old = ch[1] if len(ch) > 1 else None
            new = ch[2] if len(ch) > 2 else None
            if _skip_field(fn):
                continue
            if fn == "docstatus":
                kind = "submitted" if str(new) == "1" else ("cancelled" if str(new) == "2" else kind)
                continue
            if fn == "workflow_state" and kind == "edit":
                kind = "workflow"
            changes.append({"label": label(fn), "from": _fmt_val(old), "to": _fmt_val(new)})
        for add in j.get("added", []) or []:
            if add and not _skip_table(add[0]):
                changes.append({"label": "Added a " + label(add[0]) + " row", "from": None, "to": None})
        for rem in j.get("removed", []) or []:
            if rem and not _skip_table(rem[0]):
                changes.append({"label": "Removed a " + label(rem[0]) + " row", "from": None, "to": None})
        for rc in j.get("row_changed", []) or []:
            if rc and len(rc) >= 4 and not _skip_table(rc[0]):
                for cf in rc[3] or []:
                    if cf and not _skip_field(cf[0]):
                        changes.append({
                            "label": label(rc[0]) + " · " + frappe.unscrub(cf[0]),
                            "from": _fmt_val(cf[1] if len(cf) > 1 else None),
                            "to": _fmt_val(cf[2] if len(cf) > 2 else None),
                        })
        if not changes and kind == "edit":
            continue  # version with only skipped/internal fields — not worth showing
        entries.append({"when": str(v.creation), "who": _uname(v.owner, cache), "kind": kind, "changes": changes})

    # Created event is the oldest — put it at the front so after reversing it ends
    # up last (newest change at the top of the timeline).
    entries.insert(0, {"when": str(doc.creation), "who": _uname(doc.owner, cache), "kind": "created", "changes": []})
    entries.reverse()  # newest first
    return {
        "created_on": str(doc.creation),
        "created_by": _uname(doc.owner, cache),
        "modified_on": str(doc.modified),
        "modified_by": _uname(doc.modified_by, cache),
        "entries": entries,
    }


# Receiver = the mobile user assigned to receive a PO's material. The eligible pool
# is the "Mobile Access" cohort = users holding the Supervisor role. Purchase Receipt
# creation is restricted to a PO's assigned receiver (admin roles exempt).
RECEIVER_ROLE = "Supervisor"


def _is_receive_admin():
    """Admin roles bypass the receiver-only receipt rule (safety override)."""
    return bool(set(frappe.get_roles()) & _CAP_ADMIN_ROLES)


def _receivers():
    """Eligible PO receivers: enabled users holding the Supervisor (mobile-access)
    role, with display name + mobile — for the PO receiver picker and the print."""
    rows = frappe.get_all(
        "Has Role",
        filters={"role": RECEIVER_ROLE, "parenttype": "User"},
        fields=["parent"],
        limit_page_length=0,
    )
    out = []
    for u in sorted({r.parent for r in rows} - {"Administrator", "Guest"}):
        info = frappe.db.get_value("User", u, ["enabled", "full_name", "mobile_no"], as_dict=True)
        if info and info.enabled:
            out.append({"user": u, "full_name": info.full_name or u, "mobile_no": info.mobile_no or ""})
    out.sort(key=lambda x: (x["full_name"] or "").lower())
    return out


def _guard_receiver(po_name, receiver=None):
    """Reject a Purchase Receipt attempt by anyone who is not the PO's assigned
    receiver (admin roles exempt). Pass receiver to avoid a re-read."""
    if _is_receive_admin():
        return
    if receiver is None:
        receiver = frappe.db.get_value("Purchase Order", po_name, "custom_receiver")
    if receiver != frappe.session.user:
        frappe.throw(
            _("Only the assigned receiver can create the receipt for this purchase order."),
            frappe.PermissionError,
        )


def _po_pdf_token(name):
    """Stable, unguessable per-PO token (HMAC of the PO name with the site's
    encryption key) — lets a public 'view PO PDF' link be shared with a supplier
    without login, while staying impossible to forge or enumerate."""
    secret = frappe.local.conf.get("encryption_key") or frappe.local.conf.get("secret_key") or "procureflow"
    return hmac.new(secret.encode(), ("procureflow-po:" + (name or "")).encode(), hashlib.sha256).hexdigest()[:40]


def _po_pdf_url(name):
    """Absolute public URL to the PO PDF (for the WhatsApp message)."""
    from urllib.parse import quote
    from frappe.utils import get_url

    return get_url(
        "/api/method/procureflow.react_api.public_po_pdf?name=" + quote(name or "") + "&token=" + _po_pdf_token(name)
    )


@frappe.whitelist(allow_guest=True)
def public_po_pdf(name=None, token=None):
    """Serve a finalized PO as a PDF to anyone holding the correct token (the
    supplier, via the WhatsApp link). The token is the only credential; it proves
    authorization, so we render as a system user (the print pulls Company/Project/
    User docs that a guest couldn't read)."""
    if not name or not token or not hmac.compare_digest(str(token), _po_pdf_token(name)):
        frappe.throw(_("Invalid or expired link."), frappe.PermissionError)
    if frappe.db.get_value("Purchase Order", name, "docstatus") != 1:
        frappe.throw(_("This purchase order is not available."), frappe.PermissionError)
    orig = frappe.session.user
    try:
        frappe.set_user("Administrator")
        pdf = frappe.get_print("Purchase Order", name, PO_PRINT_FORMAT, as_pdf=True)
    finally:
        frappe.set_user(orig)
    frappe.local.response.filename = name + ".pdf"
    frappe.local.response.filecontent = pdf
    frappe.local.response.type = "download"


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
        "default_terms": _po_terms_default(),
        "receivers": _receivers(),
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
    from procureflow.purchase_tax import get_item_gst_rate

    doc = frappe.get_doc("Material Request", material_request)
    doc.check_permission("read")
    out = []
    umap = _item_uoms_map([it.item_code for it in doc.items])
    gst_cache = {}
    for it in doc.items:
        # Remaining qty in the line's transaction UOM. ordered_qty accumulates in
        # STOCK units (ERPNext maps PO Item.stock_qty -> MR Item.ordered_qty), so
        # subtract in stock units then convert back via conversion_factor.
        cf = flt(it.conversion_factor) or 1
        remaining_stock = flt(it.stock_qty) - flt(it.ordered_qty)
        remaining = (remaining_stock / cf) if remaining_stock > 0 else 0
        if it.item_code not in gst_cache:
            gst_cache[it.item_code] = flt(get_item_gst_rate(it.item_code))
        out.append(
            {
                "item_code": it.item_code,
                "item_name": it.item_name,
                "uom": it.uom,
                "uoms": umap.get(it.item_code) or [{"uom": it.uom, "conversion_factor": 1}],
                "qty": remaining,
                # Default GST % for the item (from its tax template) so the mobile PO
                # form can prefill it without a per-item round-trip.
                "gst_percent": gst_cache[it.item_code],
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
        "requester": (frappe.db.get_value("User", doc.owner, "full_name") or doc.owner) if doc.owner else None,
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
    # Per-PO Terms & Conditions (prefilled from the editable default on the New PO
    # screen, then overridable for that order). Standard ERPNext field doc.terms,
    # which the print format renders first.
    if "terms" in data:
        doc.terms = data.get("terms") or None
    # Receiver: the mobile user who will receive this material; required to PLACE
    # the order (a receipt can only be made by this person). Draft saves may omit it.
    if doc.meta.has_field("custom_receiver"):
        doc.custom_receiver = data.get("receiver") or None
    if data.get("submit_for_approval") and not data.get("receiver"):
        frappe.throw(_("Assign a receiver before placing the order."))
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
                # Inherit the header Required-by so ERPNext's validate_schedule_date
                # (header = min(item dates)) recomputes to the SAME value — otherwise
                # a changed header gets reverted to the stale line dates on save.
                "schedule_date": doc.schedule_date,
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
            "custom_rejection_remark",
        ],
        order_by="modified desc",
        limit_page_length=int(limit),
    )
    rows = _hide_amended_originals("Purchase Order", rows)
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
                # How much of this line has been received so far (for the
                # "received X of Y" / remaining display on a partially-received PO).
                "received_qty": flt(it.get("received_qty")),
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
    # Requester(s): distinct creators of the source material requests (display name).
    requester_names = []
    for mr in material_requests:
        owner = frappe.db.get_value("Material Request", mr, "owner")
        nm = (frappe.db.get_value("User", owner, "full_name") or owner) if owner else None
        if nm and nm not in requester_names:
            requester_names.append(nm)
    receiver = doc.get("custom_receiver")
    recv = frappe.db.get_value("User", receiver, ["full_name", "mobile_no"], as_dict=True) if receiver else None
    # WhatsApp share (only once finalized): supplier number + a tokenised public
    # PDF link the supplier can open without logging in.
    is_final = doc.docstatus == 1
    supplier_mobile = frappe.db.get_value("Supplier", doc.supplier, "mobile_no") if doc.supplier else None
    pdf_url = _po_pdf_url(doc.name) if is_final else None
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
        "rejection_remark": doc.get("custom_rejection_remark"),
        "terms": doc.get("terms"),
        "receiver": receiver,
        "receiver_name": recv.full_name if recv else None,
        "receiver_mobile": recv.mobile_no if recv else None,
        "requesters": requester_names,
        "supplier_mobile": supplier_mobile,
        "pdf_url": pdf_url,
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


def _hide_amended_originals(doctype, rows):
    """Drop CANCELLED rows that have been amended — the amended copy is the live
    document, and showing both the dead original and its replacement clutters the
    list. The original is still reachable from the amended doc's audit trail."""
    cancelled = [r.get("name") for r in rows if r.get("docstatus") == 2]
    if not cancelled:
        return rows
    superseded = {
        r.amended_from
        for r in frappe.get_all(
            doctype, filters={"amended_from": ["in", cancelled]}, fields=["amended_from"], limit_page_length=0
        )
    }
    return [r for r in rows if r.get("name") not in superseded]


@frappe.whitelist()
def delete_doc(doctype, name):
    """Permanently delete a CANCELLED MR/PO/PR (docstatus 2). Respects frappe delete
    perms. Only a cancelled doc may be deleted — a submitted one must be cancelled
    first (matching ERPNext's own rule)."""
    if doctype not in ("Material Request", "Purchase Order", "Purchase Receipt"):
        frappe.throw(_("Unsupported document type."))
    doc = frappe.get_doc(doctype, name)
    if doc.docstatus != 2:
        frappe.throw(_("Only a cancelled document can be deleted. Cancel it first."))
    if not frappe.has_permission(doctype, "delete", doc):
        raise frappe.PermissionError(_("You are not permitted to delete this document."))
    frappe.delete_doc(doctype, name)
    return {"deleted": True, "name": name}


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
    """Approved POs that still have quantity left to receive. Scoped to the POs the
    current user is the assigned receiver of (admin roles see all)."""
    filters = {"docstatus": 1, "per_received": ["<", 100], "status": ["not in", ["Closed"]]}
    if not _is_receive_admin():
        filters["custom_receiver"] = frappe.session.user
    return frappe.get_all(
        "Purchase Order",
        filters=filters,
        fields=["name", "supplier", "supplier_name", "custom_project_name", "grand_total", "transaction_date", "per_received"],
        order_by="transaction_date desc",
        limit_page_length=100,
    )


def _receipt_tolerance_pct():
    """Pre-decided over-receipt allowance (%) from Purchase Receipt Tolerance
    Settings — 0 when global tolerance is disabled. Lets a receipt accept a bit
    more than ordered (matches the purchase_receipt_tolerance app's enforcement)."""
    try:
        if frappe.db.get_single_value("Purchase Receipt Tolerance Settings", "enable_global_tolerance"):
            return flt(frappe.db.get_single_value("Purchase Receipt Tolerance Settings", "global_tolerance_percentage"))
    except Exception:
        pass
    return 0.0


@frappe.whitelist()
def po_receipt_items(purchase_order):
    doc = frappe.get_doc("Purchase Order", purchase_order)
    doc.check_permission("read")
    _guard_receiver(doc.name, doc.get("custom_receiver"))
    pct = _receipt_tolerance_pct()
    items = []
    for it in doc.items:
        pending = flt(it.qty) - flt(it.received_qty)
        if pending > 0:
            # Max this receipt may take = (ordered * (1 + tolerance%)) - already received.
            max_qty = round(flt(it.qty) * (1 + pct / 100.0) - flt(it.received_qty), 3)
            items.append(
                {
                    "po_item": it.name,
                    "item_code": it.item_code,
                    "item_name": it.item_name,
                    "uom": it.uom,
                    "ordered": it.qty,
                    "received": it.received_qty,
                    "pending": pending,
                    "max_qty": max_qty,
                }
            )
    return {
        "supplier": doc.supplier,
        "supplier_name": doc.supplier_name,
        "project": doc.custom_project_name,
        "tolerance_pct": pct,
        "items": items,
    }


@frappe.whitelist()
def create_receipt(data):
    """Create + submit a Purchase Receipt from a PO with the entered received qtys."""
    from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_receipt

    data = _loads(data)
    po = data.get("purchase_order")
    if not po:
        frappe.throw(_("Select a purchase order."))
    # Only the PO's assigned receiver (or an admin) may create its receipt.
    _guard_receiver(po)

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
        if pr.meta.has_field("custom_material_receipt_datetime"):
            pr.custom_material_receipt_datetime = now_datetime()
    if invoice_image and pr.meta.has_field("custom_add_invoice"):
        pr.custom_add_invoice = invoice_image
        if pr.meta.has_field("custom_material_invoice_datetime"):
            pr.custom_material_invoice_datetime = now_datetime()

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
    # ALL of the receipt's attachments: the two dedicated photo fields plus any
    # plain File attachments (e.g. receipts made in the desk attach files instead
    # of filling the custom fields — those were invisible in the app before).
    attachments = []
    for u in (doc.get("custom_add_material"), doc.get("custom_add_invoice")):
        if u and u not in attachments:
            attachments.append(u)
    for f in frappe.get_all(
        "File",
        filters={"attached_to_doctype": "Purchase Receipt", "attached_to_name": name},
        fields=["file_url"],
        order_by="creation asc",
        limit_page_length=0,
    ):
        if f.file_url and f.file_url not in attachments:
            attachments.append(f.file_url)
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
        "attachments": attachments,
        "can_delete": bool(doc.docstatus == 2 and frappe.has_permission("Purchase Receipt", "delete", doc)),
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


# Master doctypes the Settings page + inline pickers may create/edit/rename.
MASTER_DOCTYPES = {
    "Supplier", "Item", "Company Master", "Project Master",
    "Material Category", "Material Sub Category", "Warehouse", "UOM",
}

# GST rate (%) -> Item Tax Template. 0 / unmapped => no template (resolves to 0%).
GST_RATE_TEMPLATE = {5: "GST 5% - SG", 12: "GST 12% - SG", 18: "GST 18 % - SG", 28: "GST 28% - SG"}


@frappe.whitelist()
def settings_can_create():
    """Which master doctypes the current user may CREATE — so the Settings page
    can hide the 'New' action (read-only) where the user lacks permission."""
    return {dt: bool(frappe.has_permission(dt, "create")) for dt in sorted(MASTER_DOCTYPES)}


@frappe.whitelist()
def rename_master(doctype, old_name, new_name, field=None):
    """Rename a master record — cascading the rename to every document that
    links to it — and sync its display field. Lets the Settings page edit a
    master's NAME safely (a plain field update would desync name vs links)."""
    if doctype not in MASTER_DOCTYPES:
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
    if doctype not in MASTER_DOCTYPES:
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
def create_master(doctype, values):
    """Create a master from the Settings page or an inline picker. Item is routed
    through save_item (so its flags/group/HSN/GST/UOM stay correct); the other
    masters are created generically with a create-permission check."""
    if doctype not in MASTER_DOCTYPES:
        frappe.throw(_("Cannot create {0}.").format(doctype))
    if doctype == "Item":
        return save_item(values)
    if not frappe.has_permission(doctype, "create"):
        frappe.throw(_("You are not allowed to create {0}.").format(doctype))
    values = _loads(values) or {}
    doc = frappe.new_doc(doctype)
    meta = frappe.get_meta(doctype)
    for k, v in values.items():
        if meta.has_field(k):
            doc.set(k, v)
    doc.insert()
    frappe.db.commit()
    return doc.name


@frappe.whitelist()
def delete_master(doctype, name):
    """Delete a master record from the Settings page. Permission-checked; only the
    whitelisted master doctypes. Blocked with a clear message if the record is still
    linked to other documents (so you can't orphan transactions)."""
    if doctype not in MASTER_DOCTYPES:
        frappe.throw(_("Cannot delete {0}.").format(doctype))
    if not frappe.has_permission(doctype, "delete"):
        frappe.throw(_("You are not allowed to delete {0}.").format(doctype))
    if not frappe.db.exists(doctype, name):
        return {"deleted": True, "name": name}
    try:
        frappe.delete_doc(doctype, name)
    except frappe.LinkExistsError:
        frappe.throw(
            _("Can't delete '{0}' — it's still used by other records. Remove or reassign those first.").format(name)
        )
    frappe.db.commit()
    return {"deleted": True, "name": name}


@frappe.whitelist()
def delete_masters(doctype, names):
    """Bulk-delete master records from the Settings page. Deletes what it can and
    reports what it couldn't (e.g. still linked to transactions) instead of failing
    the whole batch on the first in-use record."""
    if doctype not in MASTER_DOCTYPES:
        frappe.throw(_("Cannot delete {0}.").format(doctype))
    if not frappe.has_permission(doctype, "delete"):
        frappe.throw(_("You are not allowed to delete {0}.").format(doctype))
    names = _loads(names) or []
    deleted, failed = [], {}
    for n in names:
        if not frappe.db.exists(doctype, n):
            deleted.append(n)
            continue
        try:
            frappe.delete_doc(doctype, n)
            deleted.append(n)
        except frappe.LinkExistsError:
            frappe.db.rollback()
            failed[n] = _("still in use")
        except Exception as e:
            frappe.db.rollback()
            failed[n] = str(e)[:120]
    frappe.db.commit()
    return {"deleted": deleted, "failed": failed}


@frappe.whitelist()
def save_item(data):
    """Create or update an Item with the procurement-correct setup — one path for
    BOTH the Settings item form and the inline 'New item' modal so they can't
    drift. Keyed on item_code (new code = create). Forces is_sales_item=0 /
    include_item_in_manufacturing=0, item_group default 'Products', and writes
    category/sub-category, HSN (custom_hsn_code), GST (via Item Tax Template) and
    UOM conversions."""
    data = _loads(data)
    code = (data.get("item_code") or "").strip()
    if not code:
        frappe.throw(_("Item code is required."))
    creating = not frappe.db.exists("Item", code)
    if creating:
        if not frappe.has_permission("Item", "create"):
            frappe.throw(_("You are not allowed to create items."))
        doc = frappe.new_doc("Item")
        doc.item_code = code
        doc.item_group = data.get("item_group") or "Products"
        doc.is_stock_item = 1
        doc.is_purchase_item = 1
        doc.is_sales_item = 0
        doc.include_item_in_manufacturing = 0
    else:
        doc = frappe.get_doc("Item", code)
        doc.check_permission("write")

    if data.get("item_name"):
        doc.item_name = data.get("item_name")
    if data.get("stock_uom"):
        doc.stock_uom = data.get("stock_uom")
    if doc.meta.has_field("custom_category"):
        doc.custom_category = data.get("custom_category") or None
    if doc.meta.has_field("custom_sub_category"):
        doc.custom_sub_category = data.get("custom_sub_category") or None
    if doc.meta.has_field("custom_hsn_code"):
        doc.custom_hsn_code = data.get("hsn") or data.get("custom_hsn_code") or ""

    uoms = data.get("uoms")
    if uoms is not None:
        su = doc.stock_uom
        doc.set("uoms", [])
        seen = {su}
        doc.append("uoms", {"uom": su, "conversion_factor": 1})
        for r in uoms:
            u = r.get("uom")
            cf = flt(r.get("conversion_factor"))
            if u and u not in seen and cf > 0:
                doc.append("uoms", {"uom": u, "conversion_factor": cf})
                seen.add(u)

    gst = data.get("gst")
    if gst is not None and gst != "":
        doc.set("taxes", [])
        tpl = GST_RATE_TEMPLATE.get(int(flt(gst)))
        if tpl and frappe.db.exists("Item Tax Template", tpl):
            doc.append("taxes", {"item_tax_template": tpl})

    doc.insert() if creating else doc.save()
    frappe.db.commit()
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
# Supervisors may browse POs too — the permission layer scopes them to ONLY the
# POs they are the assigned receiver of (procureflow.api.purchase_order_*).
_CAP_PO_BROWSE_ROLES = {"Purchase Officer", "PO Approver", "Supervisor"}
# Creating a Purchase Order (mobile + web) — Purchase Officers (+ admins).
_CAP_CREATE_PO_ROLES = {"Purchase Officer"}
_CAP_PR_BROWSE_ROLES = {"Purchase Officer", "PO Approver", "Supervisor"}
_CAP_STOCK_ROLES = {"Stock User", "Stock Manager"}
# Payments — recording/viewing Procureflow Payment Entries (finance).
_CAP_PAY_ROLES = {"Accounts User"}
# Reports (web-only) — gated to this role plus admins. Holders also see full
# report/dashboard data (Report Viewer is privileged in get_dashboard_scope).
_CAP_REPORTS_ROLES = {"Report Viewer"}


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
        "create_po": has(_CAP_CREATE_PO_ROLES),
        "pay": has(_CAP_PAY_ROLES),
        "reports": has(_CAP_REPORTS_ROLES),
        "manage_users": bool(roles & _USER_ADMIN_ROLES) or bool(roles & {USER_MANAGER_ROLE, SETTINGS_MANAGER_ROLE}),
        # Settings nav — admins, or a delegated User/Settings Manager.
        "settings": is_admin or bool(roles & _USER_ADMIN_ROLES) or bool(roles & {USER_MANAGER_ROLE, SETTINGS_MANAGER_ROLE}),
        "email_configured": _email_configured(),
    }


def _require_reports():
    """Backend gate for the Reports endpoints — admins or Report Viewer only."""
    roles = set(frappe.get_roles())
    if not (roles & _CAP_ADMIN_ROLES or roles & _CAP_REPORTS_ROLES):
        frappe.throw(_("You do not have access to reports."), frappe.PermissionError)


# ===========================================================================
# Users & Roles management (Settings → Users tab)
# ===========================================================================
# Account administration is kept separate from business roles: only true platform
# admins OR a delegated "User Manager" may manage users. The set of roles this
# screen can grant is a fixed allowlist — it can NEVER hand out System Manager /
# Administrator. The full-access "Purchase Manager" role is grantable by platform
# admins only (a delegated User Manager cannot escalate someone to full access).
_USER_ADMIN_ROLES = {"Administrator", "System Manager"}
USER_MANAGER_ROLE = "User Manager"

# (raw role name, friendly label, plain-words description) — also the display order.
_MANAGEABLE_ROLES = [
    ("Material Request Creator", "Request Creator", "Raise material / purchase requests."),
    ("Material Request Approval", "Request Approver", "Approve material requests."),
    ("Purchase User", "Purchase User", "Raise requests and make goods receipts."),
    ("Purchase Officer", "Purchase Officer", "Requests, browse POs & receipts, make receipts."),
    ("PO Approver", "PO Approver", "Approve purchase orders; browse POs & receipts."),
    ("Supervisor", "Site Supervisor", "Mobile app; can be a PO receiver and receive material."),
    ("Report Viewer", "Report Viewer", "Access reports & dashboards (full data)."),
    ("Accounts User", "Accounts / Payments User", "Record and view payments."),
    ("Settings Manager", "Settings Manager — full settings access", "Edit ALL settings: catalog, suppliers & projects, documents, tolerance, and users. Grant sparingly."),
    ("Purchase Manager", "Purchase Manager — full access", "FULL access to everything in the app. Grant sparingly."),
]
_MANAGEABLE_ROLE_NAMES = {r[0] for r in _MANAGEABLE_ROLES}
# Powerful roles only a platform admin may grant (delegated User/Settings Managers cannot).
_ELEVATED_ROLES = {"Purchase Manager", "Settings Manager"}


def _is_user_admin():
    return bool(set(frappe.get_roles()) & _USER_ADMIN_ROLES)


def _can_manage_users():
    roles = set(frappe.get_roles())
    return bool(roles & _USER_ADMIN_ROLES) or bool(roles & {USER_MANAGER_ROLE, SETTINGS_MANAGER_ROLE})


def _require_user_manager():
    if not _can_manage_users():
        frappe.throw(_("You do not have access to manage users."), frappe.PermissionError)


def _email_configured():
    """True only if a working default-outgoing email account exists (enabled, not
    awaiting a password, and with auth credentials present) — so the UI offers the
    'email a set-password link' option ONLY when it can actually send."""
    try:
        acc = frappe.get_all(
            "Email Account",
            filters={"enable_outgoing": 1, "default_outgoing": 1, "awaiting_password": 0},
            fields=["name", "no_smtp_authentication", "login_id", "email_id"],
            limit_page_length=1,
        )
        if not acc:
            return False
        a = acc[0]
        if a.get("no_smtp_authentication"):
            return True
        return bool(frappe.db.get_value("Email Account", a["name"], "password")) and bool(a.get("login_id") or a.get("email_id"))
    except Exception:
        return False


def _grantable_roles():
    """Roles the CURRENT caller may grant: the full allowlist for platform admins,
    minus the elevated (full-access) roles for delegated User Managers."""
    names = set(_MANAGEABLE_ROLE_NAMES)
    return names if _is_user_admin() else (names - _ELEVATED_ROLES)


def _validate_roles(roles):
    roles = [r for r in (roles or []) if r]
    bad = set(roles) - _grantable_roles()
    if bad:
        frappe.throw(_("You cannot assign these roles: {0}").format(", ".join(sorted(bad))))
    return roles


@frappe.whitelist()
def assignable_roles():
    """Roles the current caller may assign (label + description), for the Users UI."""
    _require_user_manager()
    grantable = _grantable_roles()
    return [
        {"role": name, "label": label, "description": desc}
        for (name, label, desc) in _MANAGEABLE_ROLES
        if name in grantable
    ]


@frappe.whitelist()
def users_list():
    """Staff users with their manageable roles + status, for the Users & Roles table."""
    _require_user_manager()
    out = []
    for u in frappe.get_all(
        "User",
        filters={"user_type": "System User"},
        fields=["name", "full_name", "email", "mobile_no", "enabled"],
        order_by="full_name",
        limit_page_length=0,
    ):
        if u.name in ("Administrator", "Guest"):
            continue
        roles = set(frappe.get_roles(u.name))
        u["roles"] = [name for (name, _l, _d) in _MANAGEABLE_ROLES if name in roles]
        u["is_admin"] = bool(roles & _USER_ADMIN_ROLES)
        out.append(u)
    return out


@frappe.whitelist()
def create_user(data):
    """Create a System User with the chosen manageable roles. Password is handled
    either by a welcome email (self-service set-password link) or an admin-set
    temporary password — the caller chooses."""
    _require_user_manager()
    data = _loads(data)
    email = (data.get("email") or "").strip().lower()
    first_name = (data.get("full_name") or "").strip()
    if not email:
        frappe.throw(_("Email is required."))
    if not first_name:
        frappe.throw(_("Name is required."))
    if frappe.db.exists("User", email):
        frappe.throw(_("A user with this email already exists."))
    roles = _validate_roles(data.get("roles"))
    welcome = bool(data.get("send_welcome_email"))
    temp_password = data.get("password") or None

    doc = frappe.new_doc("User")
    doc.email = email
    doc.first_name = first_name
    doc.mobile_no = (data.get("mobile_no") or "").strip() or None
    doc.enabled = 1
    doc.user_type = "System User"
    doc.send_welcome_email = 1 if welcome else 0
    doc.flags.no_welcome_mail = not welcome
    if not welcome and temp_password:
        doc.new_password = temp_password
    try:
        doc.insert(ignore_permissions=True)
    except frappe.OutgoingEmailError:
        # User row is created; only the welcome email failed — don't fail the call.
        frappe.clear_last_message()
    if roles:
        doc.add_roles(*roles)
    frappe.db.commit()
    return {"name": doc.name}


@frappe.whitelist()
def update_user(data):
    """Update a user's manageable roles and/or enabled state. A caller cannot edit
    their own account, and only a platform admin may manage an admin account."""
    _require_user_manager()
    data = _loads(data)
    user = (data.get("user") or "").strip().lower()
    if not user or not frappe.db.exists("User", user):
        frappe.throw(_("User not found."))
    if user in ("administrator", "guest"):
        frappe.throw(_("This account cannot be managed here."))
    if user == frappe.session.user:
        frappe.throw(_("You cannot change your own account."))
    if (set(frappe.get_roles(user)) & _USER_ADMIN_ROLES) and not _is_user_admin():
        frappe.throw(_("Only a platform admin can manage an administrator account."))

    simple = {}
    if "enabled" in data:
        simple["enabled"] = 1 if data.get("enabled") else 0
    if "mobile_no" in data:
        simple["mobile_no"] = (data.get("mobile_no") or "").strip() or None
    if simple:
        frappe.db.set_value("User", user, simple)

    if "roles" in data:
        want = set(_validate_roles(data.get("roles")))
        grantable = _grantable_roles()
        # Only touch roles within the caller's grant set; leave others untouched.
        current_managed = set(frappe.get_roles(user)) & grantable
        doc = frappe.get_doc("User", user)
        to_add = want - current_managed
        to_remove = current_managed - want
        if to_add:
            doc.add_roles(*to_add)
        if to_remove:
            doc.remove_roles(*to_remove)
    frappe.db.commit()
    return {"name": user}


@frappe.whitelist()
def reset_user_password(data):
    """Reset a user's password: set a new temporary password to share, or (only if
    email is configured) email them a set-password link. Admin / User Manager only;
    cannot reset an admin account unless you are a platform admin."""
    _require_user_manager()
    data = _loads(data)
    user = (data.get("user") or "").strip().lower()
    if not user or not frappe.db.exists("User", user):
        frappe.throw(_("User not found."))
    if user in ("administrator", "guest"):
        frappe.throw(_("This account cannot be managed here."))
    if (set(frappe.get_roles(user)) & _USER_ADMIN_ROLES) and not _is_user_admin():
        frappe.throw(_("Only a platform admin can reset an administrator's password."))

    if data.get("send_email"):
        if not _email_configured():
            frappe.throw(_("Email is not configured on this site."))
        frappe.get_doc("User", user).reset_password(send_email=True)
        return {"ok": True, "emailed": True}

    pwd = (data.get("password") or "").strip()
    if not pwd:
        frappe.throw(_("Enter a new temporary password."))
    from frappe.utils.password import update_password

    update_password(user, pwd)
    frappe.db.commit()
    return {"ok": True}


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
    _require_reports()
    return frappe.get_all("Item", filters={"disabled": 0}, fields=["name", "item_name"],
                          order_by="item_name", limit_page_length=0)


@frappe.whitelist()
def report_data(report, limit=500, start=0, **kwargs):
    _require_reports()
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
    _require_reports()
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
    _require_reports()
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
