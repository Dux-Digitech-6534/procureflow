app_name = "procureflow"
app_title = "Procure Flow"
app_publisher = "Nandkishor Kochkar"
app_description = "Procure Flow"
app_email = "nandkishor.kochkar@duxdigitech.com"
app_license = "mit"


# ---------------------------------------------------------------------------
# ProcureFlow React SPA — a separate front-door served at /procureflow.
# Additive only: this does NOT modify the existing desk UI/backend. The SPA is
# built by frontend/ (vite) into procureflow/public/frontend + www/procureflow.html;
# its endpoints live in procureflow/react_api.py.
# ---------------------------------------------------------------------------
website_route_rules = [
    {"from_route": "/procureflow/<path:app_path>", "to_route": "procureflow"},
]

add_to_apps_screen = [
    {
        "name": "procureflow",
        "title": "ProcureFlow",
        "route": "/procureflow",
    },
]


doctype_js = {
    "Material Request": "public/js/material_request.js",
    "Supplier Quotation": "public/js/supplier_quotation.js"  ,
      "Purchase Order": "public/js/purchase_order.js"  ,
      "Purchase Receipt": "public/js/purchase_receipt.js"  ,
      "Item": "public/js/item.js"
       # 🔥 THIS MISSING
}


doctype_list_js = {
    "Material Request": "public/js/material_request_list.js",
     "Purchase Receipt": "public/js/purchase_receipt_list.js"
}


# Site supervisors only ever see the POs assigned to them as receiver — enforced
# at the permission layer (lists + single-doc) so it also covers desk/REST.
permission_query_conditions = {
    "Purchase Order": "procureflow.api.purchase_order_query_conditions",
}
has_permission = {
    "Purchase Order": "procureflow.api.purchase_order_has_permission",
}

doc_events = {
    'Purchase Order': {
        'validate': 'procureflow.purchase_tax.purchase_order_validate',
        'before_save': [
            'procureflow.api.copy_receipt_from_material_request',
        ],
        'before_submit': 'procureflow.signature_api.set_purchase_order_company_signature',
    },
    'Purchase Receipt': {
        'before_save': [
            'procureflow.api.populate_purchase_receipt_project_company_from_purchase_order',
            'procureflow.api.stamp_purchase_receipt_attachment_datetimes',
        ],
        # Attaching an image to an ALREADY-SUBMITTED receipt goes through
        # update-after-submit, not before_save — stamp the datetime there too.
        'before_update_after_submit': [
            'procureflow.api.stamp_purchase_receipt_attachment_datetimes',
        ],
        # Adopt files the user attached BEFORE the first save (they stay pointed
        # at the temp 'new-purchase-receipt-…' name and would otherwise vanish).
        'after_insert': [
            'procureflow.api.adopt_orphan_purchase_receipt_files',
        ],
    },
    # Sidebar attachments only insert a File (no receipt save at all) — the only
    # attach path left on a submitted receipt. Stamp the hidden datetime from here.
    'File': {
        'after_insert': 'procureflow.api.stamp_pr_datetime_from_file',
    },
}


fixtures = [

    # ✅ Custom Fields (ONLY required ones)
    {
        "dt": "Custom Field",
        "filters": [
            ["name", "in", [

                # Item
                "Item-custom_category",
                "Item-custom_sub_category",

                # Material Request
                "Material Request-custom_select_project_",
                "Material Request-custom_remark",
                "Material Request-custom_category",
                "Material Request-custom_sub_category",
                "Material Request-custom_add_receipt",
                "Material Request-custom_priority",
                "Material Request-custom_rejection_remark",

                # Supplier Quotation
                "Supplier Quotation-custom_project_name",
                "Supplier Quotation-custom_remark",
                "Supplier Quotation-custom_category",
                "Supplier Quotation-custom_sub_category",

                # Purchase Order
                "Purchase Order-custom_project_name",
                "Purchase Order-custom_remark",
                "Purchase Order-custom_category",
                "Purchase Order-custom_sub_category",
                "Purchase Order-custom_test_company_",
                "Purchase Order-custom_add_receipt",
                "Purchase Order-custom_priority",
                "Purchase Order-custom_authorized_signature",
                "Purchase Order-custom_company_signature",
                "Purchase Order-custom_rejection_remark",
                "Purchase Order-custom_tax_type",
                "Purchase Order Item-custom_remark",
                "Purchase Order Item-custom_gst_percent",
                "Purchase Order Item-custom_rate_with_tax",

                # Purchase Receipt
                "Purchase Receipt-custom_add_material",
                "Purchase Receipt-custom_add_invoice",
                 "Purchase Receipt-custom_material_invoice_datetime",
                  "Purchase Receipt-custom_material_receipt_datetime",
                "Purchase Receipt-custom_project_name",
                "Purchase Receipt-custom_test_company_",
                "Purchase Receipt-custom_payment_status",
                "Purchase Receipt-custom_total_paid_amount",
                "Purchase Receipt-custom_outstanding_amount",
                "Purchase Receipt Item-custom_remark"

            ]]
        ]
    },

    # ✅ Workflow
    {
        "dt": "Workflow",
        "filters": [
            ["name", "in", [
                "Workflow For PO On Procureflow",
                "Procureflow Material Request Approval"
            ]]
        ]
    },
    {
        "dt": "Workflow State",
        "filters": [
            ["name", "in", [
                "Pending Approval",
                "Approved",
                "Rejected"
            ]]
        ]
    },
    {
        "dt": "Workflow Action Master",
        "filters": [
            ["name", "in", [
                "Approve",
                "Reject",
                "Reopen"
            ]]
        ]
    },
    {
        "dt": "Print Format",
        "filters": [
            ["name", "=", "Sanskruti PO Print Format"]
        ]
    },
    {
        "dt": "Property Setter",
        "filters": [
            ["name", "in", [
                "Purchase Order Item-rate-label",
                "Purchase Order Item-amount-label",
                "Purchase Order Item-schedule_date-columns",
                "Purchase Order Item-rate-columns"
            ]]
        ]
    }
]



# fixtures = [

#     {
#         "dt": "Custom Field",
#         "filters": [
#             ["dt", "in", [

#                 # Parent Doctypes
#                 "Material Request",
#                 "Supplier Quotation",
#                 "Purchase Order",
#                 "Purchase Receipt",
#                 "Item",

#                 # Child Tables 🔥
#                 "Material Request Item",
#                 "Supplier Quotation Item",
#                 "Purchase Order Item",
#                 "Purchase Receipt Item"

#             ]]
#         ]
#     },

#     {
#         "dt": "Workflow",
#         "filters": [
#             ["document_type", "=", "Purchase Order"]
#         ]
#     },

#     "Workflow State",
#     "Workflow Action Master",

#     {
#         "dt": "Print Format",
#         "filters": [
#             ["doc_type", "=", "Purchase Order"]
#         ]
#     }
# ]

# Sanskruti Group branding assets
app_include_css = ["/assets/procureflow/css/sanskruti_branding.css"]
app_include_js = [
    "/assets/procureflow/js/sanskruti_branding.js",
    "/assets/procureflow/js/material_request_list.js",
    "/assets/procureflow/js/purchase_receipt_list.js"
]
web_include_css = ["/assets/procureflow/css/sanskruti_branding.css"]
web_include_js = ["/assets/procureflow/js/sanskruti_branding.js"]
