"""Procureflow: simplified in-child-table GST for Purchase Orders.

The team does NOT do accounting from these documents, and `india_compliance`
is not installed, so GST is handled here in a lightweight, procurement-only way:

* Each Purchase Order Item carries:
    - `rate`                 -> rate WITHOUT tax (standard field, drives `amount`)
    - `custom_gst_percent`   -> GST %
    - `custom_rate_with_tax` -> rate WITH tax (two-way synced on the client)
* On save, this module rebuilds the standard "Purchase Taxes and Charges"
  table with CGST+SGST (intra-state) or IGST (inter-state) rows so that
  `grand_total` is tax-inclusive natively. That keeps Purchase Receipt and the
  downstream Procureflow Payment Entry working with zero changes (they read
  `grand_total`), and the existing print format renders the breakdown.

The CGST/SGST/IGST split is decided from the Purchase Order's `custom_tax_type`
(auto-detected from supplier vs company Address state, with manual override).
"""

import frappe
from frappe import _
from frappe.utils import flt

TAX_TYPE_INTRA = "Intra-State (CGST + SGST)"
TAX_TYPE_INTER = "Inter-State (IGST)"
TAX_TYPE_NONE = "Unregistered / No GST"

# (key, account_name) -> account name gets the " - <abbr>" company suffix appended.
GST_ACCOUNT_DEFS = (
    ("cgst", "Procureflow CGST"),
    ("sgst", "Procureflow SGST"),
    ("igst", "Procureflow IGST"),
)


# ---------------------------------------------------------------------------
# Tax accounts (labels for the auto-filled tax rows; no accounting is posted)
# ---------------------------------------------------------------------------

def _company_abbr(company):
    return frappe.get_cached_value("Company", company, "abbr")


@frappe.whitelist()
def get_gst_accounts(company):
    """Ensure the procureflow GST tax accounts exist and return them by key."""
    if not company:
        return {}
    ensure_gst_accounts(company)
    abbr = _company_abbr(company)
    return {key: "{0} - {1}".format(name, abbr) for key, name in GST_ACCOUNT_DEFS}


def ensure_gst_accounts(company):
    if not company:
        return
    abbr = _company_abbr(company)
    parent = _get_tax_parent_account(company, abbr)
    if not parent:
        frappe.throw(_("Could not find a Liability parent account to create GST accounts under for {0}.").format(company))

    for _key, name in GST_ACCOUNT_DEFS:
        acc_name = "{0} - {1}".format(name, abbr)
        if frappe.db.exists("Account", acc_name):
            continue
        acc = frappe.get_doc(
            {
                "doctype": "Account",
                "account_name": name,
                "company": company,
                "parent_account": parent,
                "account_type": "Tax",
                "is_group": 0,
                "root_type": "Liability",
                "report_type": "Balance Sheet",
            }
        )
        acc.flags.ignore_permissions = True
        acc.insert(ignore_if_duplicate=True)


def _get_tax_parent_account(company, abbr):
    candidate = "Duties and Taxes - {0}".format(abbr)
    if frappe.db.exists("Account", candidate):
        return candidate

    grp = frappe.db.get_value(
        "Account",
        {
            "company": company,
            "is_group": 1,
            "root_type": "Liability",
            "account_name": ["like", "%Duties%"],
        },
        "name",
    )
    if grp:
        return grp

    # Last resort: the Liability root group.
    return frappe.db.get_value(
        "Account",
        {"company": company, "is_group": 1, "root_type": "Liability", "parent_account": ["in", ["", None]]},
        "name",
    )


# ---------------------------------------------------------------------------
# State -> Intra/Inter resolution
# ---------------------------------------------------------------------------

def _get_address_state(party_type, party):
    if not party:
        return None
    try:
        from frappe.contacts.doctype.address.address import get_default_address

        addr = get_default_address(party_type, party)
        if not addr:
            link = frappe.get_all(
                "Dynamic Link",
                filters={"link_doctype": party_type, "link_name": party, "parenttype": "Address"},
                fields=["parent"],
                limit=1,
            )
            addr = link[0].parent if link else None
        if addr:
            return (frappe.db.get_value("Address", addr, "state") or "").strip()
    except Exception:
        frappe.log_error(frappe.get_traceback(), "procureflow: get address state")
    return None


@frappe.whitelist()
def get_party_tax_type(supplier, company):
    """Return the tax type from supplier vs company state, or '' if undetermined."""
    supplier_state = _get_address_state("Supplier", supplier)
    company_state = _get_address_state("Company", company)
    if not supplier_state or not company_state:
        return ""
    return TAX_TYPE_INTRA if supplier_state.lower() == company_state.lower() else TAX_TYPE_INTER


# ---------------------------------------------------------------------------
# Item GST % from Item Tax Template
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_item_gst_rate(item_code, company=None):
    """Total GST % from the item's first Item Tax Template (sum of its rows)."""
    if not item_code:
        return 0

    template = None
    for row in frappe.get_all(
        "Item Tax",
        filters={"parent": item_code, "parenttype": "Item"},
        fields=["item_tax_template"],
        order_by="idx asc",
    ):
        if row.item_tax_template:
            template = row.item_tax_template
            break

    if not template:
        return 0

    total = 0.0
    for detail in frappe.get_all(
        "Item Tax Template Detail", filters={"parent": template}, fields=["tax_rate"]
    ):
        total += flt(detail.tax_rate)
    return total


# ---------------------------------------------------------------------------
# Purchase Order validate hook (authoritative)
# ---------------------------------------------------------------------------

def purchase_order_validate(doc, method=None):
    if doc.doctype != "Purchase Order":
        return
    _normalize_item_rates(doc)
    _apply_gst_taxes(doc)


def _normalize_item_rates(doc):
    """Keep rate / GST % / rate-with-tax consistent. `rate` is the source of truth
    for `amount`; if only rate-with-tax was provided, derive rate from it."""
    for item in doc.get("items", []):
        gst = flt(item.get("custom_gst_percent"))
        rate = flt(item.get("rate"))
        rate_with_tax = flt(item.get("custom_rate_with_tax"))

        if not rate and rate_with_tax:
            rate = rate_with_tax / (1 + gst / 100.0) if gst else rate_with_tax
            item.rate = rate

        item.custom_rate_with_tax = flt(rate * (1 + gst / 100.0), 2)


def _is_tax_account(account):
    if not account:
        return False
    return frappe.get_cached_value("Account", account, "account_type") == "Tax"


def _apply_gst_taxes(doc):
    company = doc.company
    if not company:
        return

    # Unregistered dealer -> NO GST at all. Zero every line's GST, strip any
    # tax-account rows, and recalc so grand_total == net_total.
    if doc.get("custom_tax_type") == TAX_TYPE_NONE:
        for item in doc.get("items", []):
            item.custom_gst_percent = 0
            if item.get("item_tax_template"):
                item.item_tax_template = None
            if item.get("item_tax_rate") and item.item_tax_rate not in ("{}", ""):
                item.item_tax_rate = "{}"
            item.custom_rate_with_tax = flt(item.rate, 2)
        doc.set("taxes", [t for t in doc.get("taxes", []) if not _is_tax_account(t.account_head)])
        _recalculate(doc)
        return

    accounts = get_gst_accounts(company)
    our_accounts = set(accounts.values())

    # GST here is driven SOLELY by custom_gst_percent. ERPNext otherwise
    # auto-injects tax rows from each item's Item Tax Template (the
    # "Add taxes from item tax template" Accounts Setting), which would double
    # up with our rows. Clear the per-item templates/rates so the framework
    # cannot re-add them on recalculation.
    for item in doc.get("items", []):
        if item.get("item_tax_template"):
            item.item_tax_template = None
        if item.get("item_tax_rate") and item.item_tax_rate not in ("{}", ""):
            item.item_tax_rate = "{}"

    # Drop our previous rows AND any tax-account rows auto-added from item
    # templates; keep genuine non-tax charge rows (freight, etc.) untouched.
    kept = []
    for t in doc.get("taxes", []):
        if t.account_head in our_accounts or _is_tax_account(t.account_head):
            continue
        kept.append(t)
    doc.set("taxes", kept)

    taxed = []  # (base_amount, gst) for taxable lines
    total_lines_with_amount = 0
    for item in doc.get("items", []):
        # qty * rate is fresh even if rate was just derived from rate-with-tax
        # (item.amount is only refreshed by the recalculation below).
        base = flt(item.get("qty")) * flt(item.get("rate"))
        if base:
            total_lines_with_amount += 1
        gst = flt(item.get("custom_gst_percent"))
        if gst > 0 and base:
            taxed.append((base, gst))

    if not taxed:
        _recalculate(doc)
        return

    tax_type = doc.get("custom_tax_type") or get_party_tax_type(doc.get("supplier"), company)
    if not tax_type:
        frappe.throw(
            _(
                "Please select <b>Tax Type</b> (Intra-State CGST+SGST or Inter-State IGST) "
                "on the Purchase Order. The supplier/company state could not be determined "
                "automatically from their addresses."
            )
        )
    if not doc.get("custom_tax_type"):
        doc.custom_tax_type = tax_type

    cost_center = frappe.get_cached_value("Company", company, "cost_center")
    distinct_rates = {gst for _base, gst in taxed}
    all_taxed = len(taxed) == total_lines_with_amount
    # A single rate applied to every line -> "On Net Total" scales correctly to
    # partial Purchase Receipts. Otherwise use fixed "Actual" amounts.
    uniform = len(distinct_rates) == 1 and all_taxed
    total_gst = sum(base * gst / 100.0 for base, gst in taxed)

    def add_on_net(account, label, rate):
        doc.append(
            "taxes",
            {
                "charge_type": "On Net Total",
                "account_head": account,
                "description": label,
                "rate": rate,
                "category": "Total",
                "add_deduct_tax": "Add",
                "included_in_print_rate": 0,
                "cost_center": cost_center,
            },
        )

    def add_actual(account, label, amount):
        doc.append(
            "taxes",
            {
                "charge_type": "Actual",
                "account_head": account,
                "description": label,
                "rate": 0,
                "tax_amount": flt(amount, 2),
                "category": "Total",
                "add_deduct_tax": "Add",
                "included_in_print_rate": 0,
                "cost_center": cost_center,
            },
        )

    if tax_type == TAX_TYPE_INTER:
        if uniform:
            rate = next(iter(distinct_rates))
            add_on_net(accounts["igst"], "IGST @ {0:g}%".format(rate), rate)
        else:
            add_actual(accounts["igst"], "IGST", total_gst)
    else:
        if uniform:
            half = next(iter(distinct_rates)) / 2.0
            add_on_net(accounts["cgst"], "CGST @ {0:g}%".format(half), half)
            add_on_net(accounts["sgst"], "SGST @ {0:g}%".format(half), half)
        else:
            add_actual(accounts["cgst"], "CGST", total_gst / 2.0)
            add_actual(accounts["sgst"], "SGST", total_gst / 2.0)

    _recalculate(doc)


def _recalculate(doc):
    if hasattr(doc, "calculate_taxes_and_totals"):
        doc.calculate_taxes_and_totals()
