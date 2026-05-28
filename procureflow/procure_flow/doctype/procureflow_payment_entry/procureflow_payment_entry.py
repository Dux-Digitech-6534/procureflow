# Copyright (c) 2026, Nandkishor Kochkar and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, nowdate

from procureflow.api import populate_purchase_receipt_project_company_from_purchase_order


class ProcureflowPaymentEntry(Document):
    def validate(self):
        self.validate_required_values()
        self.validate_and_set_purchase_receipt_values()
        self.set_payment_summary()
        self.validate_amount()

    def before_submit(self):
        self.validate_amount()

    def on_submit(self):
        update_purchase_receipt_payment_status(self.purchase_receipt)

    def on_cancel(self):
        update_purchase_receipt_payment_status(self.purchase_receipt)

    def on_trash(self):
        if self.purchase_receipt:
            update_purchase_receipt_payment_status(self.purchase_receipt)

    def validate_required_values(self):
        if not self.payment_date:
            self.payment_date = nowdate()

        if not self.purchase_receipt:
            frappe.throw(_("Purchase Receipt is required."))

    def validate_and_set_purchase_receipt_values(self):
        purchase_receipt = frappe.get_doc("Purchase Receipt", self.purchase_receipt)
        populate_purchase_receipt_project_company_from_purchase_order(
            purchase_receipt,
            update_db=purchase_receipt.docstatus == 1,
        )

        if purchase_receipt.docstatus != 1:
            frappe.throw(_("Payment Entry can be submitted only against a submitted Purchase Receipt."))

        if not self.supplier:
            self.supplier = purchase_receipt.supplier

        if not self.project:
            self.project = purchase_receipt.get("custom_project_name")

        if not self.company:
            self.company = purchase_receipt.get("custom_test_company_")

        if self.project != purchase_receipt.get("custom_project_name"):
            frappe.throw(_("Project must match the linked Purchase Receipt Project Name."))

        if self.company != purchase_receipt.get("custom_test_company_"):
            frappe.throw(_("Company must match the linked Purchase Receipt Company."))

        if self.supplier != purchase_receipt.supplier:
            frappe.throw(_("Supplier must match the linked Purchase Receipt Supplier."))

        self.set_company_from_project()

    def set_company_from_project(self):
        if not self.project:
            frappe.throw(_("Project is required on the linked Purchase Receipt."))

        company = frappe.db.get_value("Project Master", self.project, "company_name")
        if not company:
            frappe.throw(_("Company is not set on Project Master {0}.").format(frappe.bold(self.project)))

        if self.company and self.company != company:
            frappe.throw(_("Company must match Project Master company."))

        self.company = company

    def set_payment_summary(self):
        total = get_purchase_receipt_total(self.purchase_receipt)
        paid = get_submitted_paid_amount(self.purchase_receipt, exclude_name=self.name)
        outstanding = max(total - paid, 0)

        self.previous_paid_amount = paid
        self.outstanding_amount = outstanding

        if not self.amount:
            self.amount = outstanding

    def validate_amount(self):
        if flt(self.amount) <= 0:
            frappe.throw(_("Amount must be greater than 0."))

        outstanding = flt(self.outstanding_amount)

        if flt(self.amount) > outstanding:
            frappe.throw(
                _(
                    "Payment amount cannot exceed outstanding amount. "
                    "Outstanding Amount: {0}, Current Amount: {1}."
                ).format(frappe.bold(outstanding), frappe.bold(flt(self.amount)))
            )


def get_purchase_receipt_total(purchase_receipt):
    values = frappe.db.get_value(
        "Purchase Receipt",
        purchase_receipt,
        ["rounded_total", "grand_total", "base_grand_total"],
        as_dict=True,
    )

    if not values:
        return 0

    return flt(values.rounded_total) or flt(values.grand_total) or flt(values.base_grand_total)


def get_submitted_paid_amount(purchase_receipt, exclude_name=None):
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



# def get_submitted_paid_amount(purchase_receipt, exclude_name=None):
#     filters = {
#         "purchase_receipt": purchase_receipt,
#         "docstatus": 1,
#     }

#     if exclude_name:
#         filters["name"] = ["!=", exclude_name]

#     return flt(
#         frappe.db.get_value(
#             "Procureflow Payment Entry",
#             filters,
#             "sum(amount)",
#         )
#     )


def update_purchase_receipt_payment_status(purchase_receipt):
    if not purchase_receipt:
        return

    total = get_purchase_receipt_total(purchase_receipt)
    paid = get_submitted_paid_amount(purchase_receipt)
    outstanding = max(total - paid, 0)

    if paid >= total and total > 0:
        payment_status = "Fully Paid"
    elif paid > 0:
        payment_status = "Partially Paid"
    else:
        payment_status = ""

    frappe.db.set_value(
        "Purchase Receipt",
        purchase_receipt,
        {
            "custom_total_paid_amount": paid,
            "custom_outstanding_amount": outstanding,
            "custom_payment_status": payment_status,
        },
        update_modified=False,
    )
