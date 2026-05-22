app_name = "procureflow"
app_title = "Procure Flow"
app_publisher = "Nandkishor Kochkar"
app_description = "Procure Flow"
app_email = "nandkishor.kochkar@duxdigitech.com"
app_license = "mit"



doctype_js = {
    "Material Request": "public/js/material_request.js",
    "Supplier Quotation": "public/js/supplier_quotation.js"  ,
      "Purchase Order": "public/js/purchase_order.js"  ,
      "Purchase Receipt": "public/js/purchase_receipt.js"  
       # 🔥 THIS MISSING
}


doc_events = {
    "Purchase Order": {
        "before_save": "procureflow.api.copy_receipt_from_material_request"
    }
}


fixtures = [

    # ✅ Custom Fields (ONLY required ones)
    {
        "dt": "Custom Field",
        "filters": [
            ["name", "in", [

                # Material Request
                "Material Request-custom_select_project_",
                "Material Request-custom_remark",
                "Material Request-custom_category",
                "Material Request-custom_add_receipt",

                # Supplier Quotation
                "Supplier Quotation-custom_project_name",
                "Supplier Quotation-custom_remark",
                "Supplier Quotation-custom_category",

                # Purchase Order
                "Purchase Order-custom_project_name",
                "Purchase Order-custom_remark",
                "Purchase Order-custom_category",
                "Purchase Order-custom_test_company_",
                "Purchase Order-custom_add_receipt",

                # Purchase Receipt
                "Purchase Receipt-custom_add_material",
                "Purchase Receipt-custom_add_invoice",
                 "Purchase Receipt-custom_material_invoice_datetime",
                  "Purchase Receipt-custom_material_receipt_datetime"

            ]]
        ]
    },

    # ✅ Workflow
    {
        "dt": "Workflow",
        "filters": [
            ["name", "=", "Workflow For PO On Procureflow"]
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
app_include_js = ["/assets/procureflow/js/sanskruti_branding.js"]
web_include_css = ["/assets/procureflow/css/sanskruti_branding.css"]
web_include_js = ["/assets/procureflow/js/sanskruti_branding.js"]
