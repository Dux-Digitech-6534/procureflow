import frappe
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt, nowdate

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
    filters = {
        "purchase_receipt": purchase_receipt,
        "docstatus": 1,
    }

    if exclude_name and not str(exclude_name).startswith("new-"):
        filters["name"] = ["!=", exclude_name]

    return flt(
        frappe.db.get_value(
            "Procureflow Payment Entry",
            filters,
            "sum(amount)",
        )
    )
