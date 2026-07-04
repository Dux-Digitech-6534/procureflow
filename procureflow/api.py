import frappe
from frappe.model.mapper import get_mapped_doc
from frappe.model.workflow import apply_workflow, get_workflow
from frappe.utils import flt, now_datetime, nowdate

@frappe.whitelist()
def make_supplier_quotation(source_name, target_doc=None):

    def set_missing_values(source, target):
        # 🔥 Direct assign (guaranteed working)
        target.custom_project_name = source.custom_select_project_
        target.custom_store_name = source.set_warehouse

    doc = get_mapped_doc(
        "Material Request",
        source_name,
        {
            "Material Request": {
                "doctype": "Supplier Quotation",
                "field_map": {
                    "name": "material_request"
                }
            },
            "Material Request Item": {
                "doctype": "Supplier Quotation Item",
                "field_map": {
                    "name": "material_request_item",
                    "parent": "material_request"
                }
            }
        },
        target_doc,
        set_missing_values
    )

    return doc





#    Fetch attachment for purchase order on material request 


def copy_receipt_from_material_request(doc, method=None):
    """
    Copy custom_add_receipt from linked Material Request to Purchase Order.

    Conditions:
    - Only set if Purchase Order custom_add_receipt is empty
    - If multiple Material Requests are linked, use the first one with attachment
    - Works when items are added using Get Items From Material Request
    """

    if doc.custom_add_receipt:
        return

    material_requests = []

    for item in doc.items:
        if item.material_request and item.material_request not in material_requests:
            material_requests.append(item.material_request)

    for mr in material_requests:
        receipt = frappe.db.get_value(
            "Material Request",
            mr,
            "custom_add_receipt"
        )

        if receipt:
            doc.custom_add_receipt = receipt
            break

    set_priority_from_material_requests(doc)


def set_priority_from_material_requests(doc, method=None):
    priorities = []

    for item in doc.get("items", []):
        material_request = item.get("material_request")

        if not material_request and item.get("material_request_item"):
            material_request = frappe.db.get_value(
                "Material Request Item",
                item.get("material_request_item"),
                "parent",
            )

        if material_request and material_request not in priorities:
            priority = frappe.db.get_value("Material Request", material_request, "custom_priority")
            if priority:
                priorities.append(priority)

    if priorities:
        doc.custom_priority = get_highest_priority(priorities)
    elif not doc.get("custom_priority"):
        doc.custom_priority = "Medium"


def get_highest_priority(priorities):
    priority_order = {
        "Low": 1,
        "Medium": 2,
        "High": 3,
    }

    return max(priorities, key=lambda priority: priority_order.get(priority, 2))


@frappe.whitelist()
def get_material_request_from_item(material_request_item):
    if not material_request_item:
        frappe.throw(
            frappe._("Material Request Item is required."),
            frappe.ValidationError,
        )

    material_request = frappe.db.get_value(
        "Material Request Item",
        material_request_item,
        "parent",
    )

    if not material_request:
        frappe.throw(
            frappe._("Material Request Item {0} was not found.").format(material_request_item),
            frappe.ValidationError,
        )

    material_request_doc = frappe.get_doc("Material Request", material_request)
    material_request_doc.check_permission("read")

    for item in material_request_doc.get("items", []):
        if item.name == material_request_item:
            return material_request

    frappe.throw(
        frappe._("Material Request Item {0} does not belong to Material Request {1}.").format(
            material_request_item, material_request
        ),
        frappe.ValidationError,
    )


@frappe.whitelist()
def get_material_request_item_remark(material_request, material_request_item):
    if not material_request or not material_request_item:
        frappe.throw(
            frappe._("Material Request and Material Request Item are required."),
            frappe.ValidationError,
        )

    material_request_doc = frappe.get_doc("Material Request", material_request)
    material_request_doc.check_permission("read")

    for item in material_request_doc.get("items", []):
        if item.name == material_request_item:
            return item.get("custom_remark")

    frappe.throw(
        frappe._("Material Request Item {0} does not belong to Material Request {1}.").format(
            material_request_item, material_request
        ),
        frappe.ValidationError,
    )


@frappe.whitelist()
def get_purchase_order_item_remark(purchase_order, purchase_order_item):
    if not purchase_order or not purchase_order_item:
        frappe.throw(
            frappe._("Purchase Order and Purchase Order Item are required."),
            frappe.ValidationError,
        )

    purchase_order_doc = frappe.get_doc("Purchase Order", purchase_order)
    purchase_order_doc.check_permission("read")

    for item in purchase_order_doc.get("items", []):
        if item.name == purchase_order_item:
            return item.get("custom_remark")

    frappe.throw(
        frappe._("Purchase Order Item {0} does not belong to Purchase Order {1}.").format(
            purchase_order_item, purchase_order
        ),
        frappe.ValidationError,
    )


@frappe.whitelist()
def make_procureflow_payment_entry(source_name):
    return get_procureflow_payment_entry_defaults(source_name)


@frappe.whitelist()
def get_procureflow_payment_entry_defaults(purchase_receipt, payment_entry=None):
    purchase_receipt_doc = frappe.get_doc("Purchase Receipt", purchase_receipt)
    populate_purchase_receipt_project_company_from_purchase_order(
        purchase_receipt_doc,
        update_db=purchase_receipt_doc.docstatus == 1,
    )

    total = get_purchase_receipt_total(purchase_receipt_doc)
    paid = get_procureflow_paid_amount(purchase_receipt_doc.name, exclude_name=payment_entry)
    outstanding = max(total - paid, 0)

    return {
        "purchase_receipt": purchase_receipt_doc.name,
        "supplier": purchase_receipt_doc.supplier,
        "project": purchase_receipt_doc.get("custom_project_name"),
        "company": purchase_receipt_doc.get("custom_test_company_"),
        "previous_paid_amount": paid,
        "outstanding_amount": outstanding,
        "amount": outstanding,
        "payment_date": nowdate(),
    }


def populate_purchase_receipt_project_company_from_purchase_order(doc, method=None, update_db=False):
    if doc.get("custom_project_name") and doc.get("custom_test_company_"):
        return

    purchase_order = get_purchase_receipt_purchase_order(doc)
    if not purchase_order:
        company = get_company_from_project_master(doc.get("custom_project_name"))
        if company and not doc.get("custom_test_company_"):
            doc.custom_test_company_ = company
            if update_db:
                frappe.db.set_value(
                    "Purchase Receipt",
                    doc.name,
                    "custom_test_company_",
                    company,
                    update_modified=False,
                )
        return

    values = frappe.db.get_value(
        "Purchase Order",
        purchase_order,
        ["custom_project_name", "custom_test_company_"],
        as_dict=True,
    )

    if not values:
        return

    changed_values = {}

    if values.custom_project_name and not doc.get("custom_project_name"):
        doc.custom_project_name = values.custom_project_name
        changed_values["custom_project_name"] = values.custom_project_name

    company = values.custom_test_company_ or get_company_from_project_master(values.custom_project_name)
    if company and not doc.get("custom_test_company_"):
        doc.custom_test_company_ = company
        changed_values["custom_test_company_"] = company

    if update_db and changed_values:
        frappe.db.set_value("Purchase Receipt", doc.name, changed_values, update_modified=False)


def stamp_purchase_receipt_attachment_datetimes(doc, method=None):
    """Record WHEN a receipt attachment was added in the (hidden) datetime fields —
    server-side so it is captured for both the SPA and the desk, not just when the
    desk client script's change-event happens to fire. On a SUBMITTED receipt
    (attach during update-after-submit) the datetime fields aren't allow_on_submit,
    so write them straight to the DB instead of only on the doc."""
    submitted = doc.docstatus == 1
    for attach_field, dt_field in (
        ("custom_add_material", "custom_material_receipt_datetime"),
        ("custom_add_invoice", "custom_material_invoice_datetime"),
    ):
        if not (doc.get(attach_field) and not doc.get(dt_field)):
            continue
        stamp = now_datetime()
        if submitted and doc.name:
            frappe.db.set_value("Purchase Receipt", doc.name, dt_field, stamp, update_modified=False)
        doc.set(dt_field, stamp)


def stamp_pr_datetime_from_file(doc, method=None):
    """File→Purchase Receipt attach hook. The desk's SIDEBAR attach (the only way
    to attach on a submitted receipt, since the Attach fields aren't
    allow_on_submit) just inserts a File — no receipt save, so the before_save
    stamp never fires. Stamp the hidden datetime here instead."""
    if doc.get("attached_to_doctype") != "Purchase Receipt":
        return
    name = doc.get("attached_to_name")
    if not name or str(name).startswith("new-") or not frappe.db.exists("Purchase Receipt", name):
        return
    # Attached straight to a photo field? stamp that field's datetime; a plain
    # sidebar attachment counts as the material-receipt photo by default.
    field = doc.get("attached_to_field")
    dt_field = (
        "custom_material_invoice_datetime"
        if field == "custom_add_invoice"
        else "custom_material_receipt_datetime"
    )
    if not frappe.db.get_value("Purchase Receipt", name, dt_field):
        frappe.db.set_value("Purchase Receipt", name, dt_field, now_datetime(), update_modified=False)


# ---------------------------------------------------------------------------
# Purchase Order visibility: a site supervisor sees ONLY the POs they are the
# assigned receiver of (custom_receiver). Enforced at the PERMISSION layer so it
# holds everywhere — ProcureFlow lists, desk, standard REST — not just the UI.
# Purchasing/admin roles keep full visibility.
# ---------------------------------------------------------------------------
PO_FULL_VISIBILITY_ROLES = {
    "Administrator", "System Manager", "Purchase Manager", "Purchase Officer",
    "PO Approver", "Purchase User", "Accounts User", "Settings Manager",
}


def _po_restricted_user(user):
    """True for users whose PO visibility is limited to their assigned POs:
    they hold Supervisor and NONE of the purchasing/admin roles."""
    if not user or user == "Administrator":
        return False
    roles = set(frappe.get_roles(user))
    if roles & PO_FULL_VISIBILITY_ROLES:
        return False
    return "Supervisor" in roles


def purchase_order_query_conditions(user=None, doctype=None):
    """List views / get_list: restricted users only match POs assigned to them."""
    user = user or frappe.session.user
    if not _po_restricted_user(user):
        return ""
    return "`tabPurchase Order`.`custom_receiver` = {}".format(frappe.db.escape(user))


def purchase_order_has_permission(doc, ptype=None, user=None, debug=False):
    """Single-doc access: a restricted user may only touch a PO they receive.
    NOTE: in this Frappe version a has_permission hook can only DENY — any falsy
    return (including None) blocks the doc, so 'defer' must be returned as True
    (True does not grant anything beyond what role permissions already allow)."""
    user = user or frappe.session.user
    if not _po_restricted_user(user):
        return True  # defer to normal role permissions
    if doc.get("custom_receiver") == user:
        return True
    return False


def adopt_orphan_purchase_receipt_files(doc, method=None):
    """Desk users attach photos BEFORE the receipt's first save; those Files stay
    pointed at the temp 'new-purchase-receipt-…' name, so they vanish from the
    saved receipt (and never get a datetime). On first save, adopt the user's
    recent orphaned uploads onto the just-saved receipt and stamp the datetime."""
    from frappe.utils import add_to_date

    orphans = frappe.get_all(
        "File",
        filters={
            "attached_to_doctype": "Purchase Receipt",
            "attached_to_name": ["like", "new-%"],
            "owner": frappe.session.user,
            "creation": [">", add_to_date(now_datetime(), hours=-2)],
        },
        pluck="name",
    )
    for fn in orphans:
        frappe.db.set_value("File", fn, "attached_to_name", doc.name, update_modified=False)
    if orphans and not frappe.db.get_value("Purchase Receipt", doc.name, "custom_material_receipt_datetime"):
        frappe.db.set_value(
            "Purchase Receipt", doc.name, "custom_material_receipt_datetime", now_datetime(), update_modified=False
        )


def get_purchase_receipt_purchase_order(doc):
    if doc.get("custom_purchase_order"):
        return doc.get("custom_purchase_order")

    for item in doc.get("items", []):
        if item.get("purchase_order"):
            return item.get("purchase_order")

    return None


def get_company_from_project_master(project):
    if not project:
        return None

    return frappe.db.get_value("Project Master", project, "company_name")


def get_purchase_receipt_total(purchase_receipt):
    return (
        flt(purchase_receipt.get("rounded_total"))
        or flt(purchase_receipt.get("grand_total"))
        or flt(purchase_receipt.get("base_grand_total"))
    )


def get_procureflow_paid_amount(purchase_receipt, exclude_name=None):
    conditions = [
        "purchase_receipt = %s",
        "docstatus = 1",
    ]
    values = [purchase_receipt]

    if exclude_name and not str(exclude_name).startswith("new-"):
        conditions.append("name != %s")
        values.append(exclude_name)

    total_paid = frappe.db.sql(
        """
        select coalesce(sum(amount), 0)
        from `tabProcureflow Payment Entry`
        where {conditions}
        """.format(conditions=" and ".join(conditions)),
        tuple(values),
    )[0][0]

    return flt(total_paid)





# def get_procureflow_paid_amount(purchase_receipt, exclude_name=None):
#     filters = {
#         "purchase_receipt": purchase_receipt,
#         "docstatus": 1,
#     }

#     if exclude_name and not str(exclude_name).startswith("new-"):
#         filters["name"] = ["!=", exclude_name]

#     return flt(
#         frappe.db.get_value(
#             "Procureflow Payment Entry",
#             filters,
#             "sum(amount)",
#         )
#     )


@frappe.whitelist()
def reject_with_remark(doctype, name, remark):
    if doctype not in ("Purchase Order", "Material Request"):
        frappe.throw("Reject with remark is not allowed for this document type.")

    remark = (remark or "").strip()
    if not remark:
        frappe.throw("Rejection remark is required.")

    doc = frappe.get_doc(doctype, name)

    if doctype == "Purchase Order":
        workflow = get_workflow(doc.doctype)
        current_state = doc.get(workflow.workflow_state_field)
        reject_transition = next(
            (
                transition
                for transition in workflow.transitions
                if transition.state == current_state and transition.action == "Reject"
            ),
            None,
        )

        if reject_transition and reject_transition.next_state != "Rejected":
            frappe.throw(
                "Purchase Order Reject workflow is configured to move to {0}. "
                "Please migrate the updated workflow fixture so Reject moves to Rejected.".format(
                    reject_transition.next_state
                )
            )

    doc.custom_rejection_remark = remark
    doc.save(ignore_permissions=True)

    doc = apply_workflow(doc, "Reject")

    return {
        "doctype": doc.doctype,
        "name": doc.name,
        "workflow_state": doc.get("workflow_state"),
        "docstatus": doc.docstatus,
        "custom_rejection_remark": doc.get("custom_rejection_remark"),
    }
