# Copyright (c) 2026, Nandkishor Kochkar and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate, nowdate

from procureflow.api import populate_purchase_receipt_project_company_from_purchase_order


class ProcureflowPaymentEntry(Document):
    @property
    def is_advance(self):
        """An advance is paid against a Purchase Order (no receipt yet)."""
        return bool(self.get("purchase_order") and not self.get("purchase_receipt"))

    def validate(self):
        self.validate_required_values()
        if self.docstatus == 0:
            if self.is_advance:
                self.validate_and_set_purchase_order_values()
                self.set_advance_summary()
                self.validate_advance_amount()
            else:
                self.validate_and_set_purchase_receipt_values()
                self.set_payment_summary()
                self.validate_amount()

    def before_submit(self):
        self.validate_required_values()
        if self.is_advance:
            self.validate_and_set_purchase_order_values()
            self.set_advance_summary()
            self.validate_advance_amount()
        else:
            self.validate_and_set_purchase_receipt_values()
            self.set_payment_summary()
            self.validate_amount()

    def _recompute(self):
        from procureflow.advance import recompute_for_payment

        recompute_for_payment(self)

    def on_submit(self):
        self._recompute()

    def on_cancel(self):
        self._recompute()

    def on_trash(self):
        self._recompute()

    def validate_required_values(self):
        if not self.payment_date:
            self.payment_date = nowdate()

        if getdate(self.payment_date) > getdate(nowdate()):
            frappe.throw(_("Payment date cannot be in the future."))

        if not self.get("purchase_receipt") and not self.get("purchase_order"):
            frappe.throw(_("Link either a Purchase Receipt (payment) or a Purchase Order (advance)."))
        if self.get("purchase_receipt") and self.get("purchase_order"):
            frappe.throw(_("A payment entry links a Purchase Receipt OR a Purchase Order — not both."))

    # --- Advance (against a Purchase Order) -----------------------------------

    def validate_and_set_purchase_order_values(self):
        po = frappe.get_doc("Purchase Order", self.purchase_order)
        if po.docstatus != 1:
            frappe.throw(_("An advance can be paid only against an approved (submitted) Purchase Order."))

        if not self.supplier:
            self.supplier = po.supplier
        if not self.project:
            self.project = po.get("custom_project_name")
        if not self.company:
            self.company = po.get("custom_test_company_") or frappe.db.get_value(
                "Project Master", po.get("custom_project_name"), "company_name"
            )

        if self.supplier != po.supplier:
            frappe.throw(_("Supplier must match the Purchase Order supplier."))

    def set_advance_summary(self):
        from procureflow.advance import advance_cap_remaining, get_po_advance_total

        self.previous_paid_amount = get_po_advance_total(self.purchase_order, exclude_name=self.name)
        remaining = advance_cap_remaining(self.purchase_order, exclude_name=self.name)
        # outstanding_amount here means "advance capacity still available" (uncapped -> blank)
        self.outstanding_amount = remaining if remaining is not None else 0

    def validate_advance_amount(self):
        from procureflow.advance import advance_cap_remaining

        if flt(self.amount) <= 0:
            frappe.throw(_("Amount must be greater than 0."))

        remaining = advance_cap_remaining(self.purchase_order, exclude_name=self.name)
        if remaining is not None and flt(self.amount) > flt(remaining) + 0.01:
            frappe.throw(
                _(
                    "Advance would exceed the allowed limit for this Purchase Order. "
                    "Remaining advance capacity: {0}, this amount: {1}."
                ).format(frappe.bold(flt(remaining)), frappe.bold(flt(self.amount)))
            )

    # --- Payment (against a Purchase Receipt) ---------------------------------

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
        from procureflow.advance import po_advance_allocation
        from procureflow.api import get_purchase_receipt_purchase_order

        total = get_purchase_receipt_total(self.purchase_receipt)
        paid = get_submitted_paid_amount(self.purchase_receipt, exclude_name=self.name)
        # Advance already allocated to THIS receipt reduces what a direct payment
        # still needs to cover (advance + direct must never over-cover a receipt).
        po = get_purchase_receipt_purchase_order(frappe.get_doc("Purchase Receipt", self.purchase_receipt))
        adv = flt(po_advance_allocation(po)["per_pr"].get(self.purchase_receipt, 0.0)) if po else 0.0
        outstanding = max(total - paid - adv, 0)

        self.previous_paid_amount = paid + adv
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
        payment_status = "Not Paid"

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


# def update_purchase_receipt_payment_status(purchase_receipt):
#     if not purchase_receipt:
#         return

#     total = get_purchase_receipt_total(purchase_receipt)
#     paid = get_submitted_paid_amount(purchase_receipt)
#     outstanding = max(total - paid, 0)

#     if paid >= total and total > 0:
#         payment_status = "Fully Paid"
#     elif paid > 0:
#         payment_status = "Partially Paid"
#     else:
#         payment_status = ""

#     frappe.db.set_value(
#         "Purchase Receipt",
#         purchase_receipt,
#         {
#             "custom_total_paid_amount": paid,
#             "custom_outstanding_amount": outstanding,
#             "custom_payment_status": payment_status,
#         },
#         update_modified=False,
#     )
