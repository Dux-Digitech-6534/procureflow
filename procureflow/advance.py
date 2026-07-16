"""PO advance payments + oldest-first auto-allocation to Purchase Receipts.

An advance is a Procureflow Payment Entry linked to a Purchase Order (with no
Purchase Receipt). It forms a PO-level credit that is auto-allocated to that
PO's submitted receipts OLDEST-FIRST whenever anything relevant changes — so a
receipt shows as (partly) paid by the advance with no manual linking.

The allocation is NOT stored per-advance-per-receipt: it is recomputed each time
from the current set of submitted advances / receipts / direct payments. That
keeps it self-healing — cancel a receipt and its share of advance flows to the
next receipt; cancel an advance and the receipts it covered revert to due.

The advance cap ("max advance vs PO value") is a global-default key/value pair
(no doctype, no migrate). Default: capped at 100% of the PO value.
"""

import frappe
from frappe.utils import cint, flt

from procureflow.api import (
    get_procureflow_paid_amount,
    get_purchase_receipt_purchase_order,
)

ADVANCE_CAP_ENABLED_KEY = "procureflow_advance_cap_enabled"
ADVANCE_CAP_PCT_KEY = "procureflow_advance_cap_pct"


# --- cap setting (global defaults; no doctype / no migrate) -------------------

def get_advance_cap_settings():
    enabled = frappe.db.get_global(ADVANCE_CAP_ENABLED_KEY)
    pct = frappe.db.get_global(ADVANCE_CAP_PCT_KEY)
    return {
        "enabled": True if enabled is None else bool(cint(enabled)),  # default ON
        "pct": 100.0 if pct in (None, "") else flt(pct),              # default 100%
    }


def set_advance_cap_settings(enabled, pct):
    frappe.db.set_global(ADVANCE_CAP_ENABLED_KEY, 1 if cint(enabled) else 0)
    frappe.db.set_global(ADVANCE_CAP_PCT_KEY, flt(pct))


# --- PO totals / advances -----------------------------------------------------

def get_po_grand_total(po):
    v = frappe.db.get_value(
        "Purchase Order", po, ["rounded_total", "grand_total", "base_grand_total"], as_dict=True
    )
    if not v:
        return 0.0
    return flt(v.rounded_total) or flt(v.grand_total) or flt(v.base_grand_total)


def _pr_total(pr):
    v = frappe.db.get_value(
        "Purchase Receipt", pr, ["rounded_total", "grand_total", "base_grand_total"], as_dict=True
    )
    if not v:
        return 0.0
    return flt(v.rounded_total) or flt(v.grand_total) or flt(v.base_grand_total)


def get_po_advance_total(po, exclude_name=None):
    """Sum of SUBMITTED advance payments (PO-linked, no receipt) for this PO."""
    if not po:
        return 0.0
    conds = ["purchase_order = %s", "docstatus = 1", "coalesce(purchase_receipt, '') = ''"]
    vals = [po]
    if exclude_name and not str(exclude_name).startswith("new-"):
        conds.append("name != %s")
        vals.append(exclude_name)
    return flt(
        frappe.db.sql(
            "select coalesce(sum(amount), 0) from `tabProcureflow Payment Entry` where "
            + " and ".join(conds),
            tuple(vals),
        )[0][0]
    )


def advance_cap_remaining(po, exclude_name=None):
    """How much more advance may still be paid on this PO. None == uncapped."""
    s = get_advance_cap_settings()
    already = get_po_advance_total(po, exclude_name=exclude_name)
    if not s["enabled"]:
        return None
    cap = get_po_grand_total(po) * s["pct"] / 100.0
    return max(cap - already, 0.0)


# --- allocation ---------------------------------------------------------------

def _po_submitted_receipts(po):
    """Submitted Purchase Receipts of this PO, oldest first."""
    if not po:
        return []
    return frappe.db.sql_list(
        """
        select distinct pr.name
        from `tabPurchase Receipt` pr
        join `tabPurchase Receipt Item` pri on pri.parent = pr.name
        where pri.purchase_order = %s and pr.docstatus = 1
        order by pr.posting_date asc, pr.posting_time asc, pr.creation asc
        """,
        po,
    )


def po_advance_allocation(po):
    """Oldest-first allocation of the PO's advance credit across its receipts.
    Returns {advance_total, applied, unapplied, per_pr: {pr: amount}}."""
    advance_total = get_po_advance_total(po)
    pool = advance_total
    per_pr = {}
    for pr in _po_submitted_receipts(po):
        total = _pr_total(pr)
        direct = get_procureflow_paid_amount(pr)
        need = max(total - direct, 0.0)
        a = min(pool, need)
        pool -= a
        per_pr[pr] = a
    return {
        "advance_total": advance_total,
        "applied": advance_total - pool,
        "unapplied": pool,
        "per_pr": per_pr,
    }


def _write_pr_status(pr, direct, advance):
    total = _pr_total(pr)
    applied = direct + advance
    outstanding = max(total - applied, 0.0)
    if applied >= total and total > 0:
        status = "Fully Paid"
    elif applied > 0:
        status = "Partially Paid"
    else:
        status = "Not Paid"
    frappe.db.set_value(
        "Purchase Receipt",
        pr,
        {
            "custom_total_paid_amount": applied,
            "custom_outstanding_amount": outstanding,
            "custom_payment_status": status,
        },
        update_modified=False,
    )


def recompute_po_payments(po):
    """Recompute + persist paid / outstanding / status for EVERY submitted receipt
    of this PO, counting direct receipt payments PLUS allocated advance."""
    if not po:
        return
    alloc = po_advance_allocation(po)
    for pr, adv in alloc["per_pr"].items():
        _write_pr_status(pr, get_procureflow_paid_amount(pr), adv)


def update_single_pr_status(pr):
    """Fallback for a receipt with NO source PO (standalone): direct payments only."""
    if not pr:
        return
    _write_pr_status(pr, get_procureflow_paid_amount(pr), 0.0)


def recompute_for_payment(doc):
    """Route a Procureflow Payment Entry (advance OR receipt) to the right recompute."""
    po = doc.get("purchase_order")
    if not po and doc.get("purchase_receipt"):
        po = get_purchase_receipt_purchase_order(frappe.get_doc("Purchase Receipt", doc.purchase_receipt))
    if po:
        recompute_po_payments(po)
    elif doc.get("purchase_receipt"):
        update_single_pr_status(doc.purchase_receipt)


def recompute_on_pr_change(doc, method=None):
    """Purchase Receipt on_submit / on_cancel hook — an arriving or cancelled
    receipt changes how the PO's advance credit is allocated."""
    if doc.doctype != "Purchase Receipt":
        return
    po = get_purchase_receipt_purchase_order(doc)
    if po:
        recompute_po_payments(po)
    else:
        update_single_pr_status(doc.name)
