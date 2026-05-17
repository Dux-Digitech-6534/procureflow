app_name = "procureflow"
app_title = "Procure Flow"
app_publisher = "Nandkishor Kochkar"
app_description = "Procure Flow"
app_email = "nandkishor.kochkar@duxdigitech.com"
app_license = "mit"



doctype_js = {
    "Material Request": "public/js/material_request.js",
    "Supplier Quotation": "public/js/supplier_quotation.js"  ,
      "Purchase Order": "public/js/purchase_order.js"   # 🔥 THIS MISSING
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

                # Supplier Quotation
                "Supplier Quotation-custom_project_name",
                "Supplier Quotation-custom_remark",
                "Supplier Quotation-custom_category",

                # Purchase Order
                "Purchase Order-custom_project_name",
                "Purchase Order-custom_remark",
                "Purchase Order-custom_category",

                # Purchase Receipt
                "Purchase Receipt-custom_add_material",
                "Purchase Receipt-custom_add_invoice"

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





