

frappe.ui.form.on('Supplier Quotation', {
    onload: function(frm) {

        console.log("SQ Loaded");

        // previous route se MR pakdo
        let prev = frappe.route_history.slice(-2)[0];

        console.log("Previous Route:", prev);

        if (prev && prev[1] === "Material Request") {

            let mr_name = prev[2];

            console.log("MR Found:", mr_name);

            frappe.db.get_doc("Material Request", mr_name)
                .then(mr => {

                    console.log("MR Data:", mr);

                    frm.set_value("custom_project_name", mr.custom_select_project_);
                    frm.set_value("custom_store_name", mr.set_warehouse);
                    frm.set_value("custom_remark", mr.custom_remark);
                     frm.set_value("custom_category", mr.custom_category)

                    // null/"" normalize karke hi set karo, warna purane docs dirty ho jate hain
                    let mr_sub = mr.custom_sub_category || "";
                    if ((frm.doc.custom_sub_category || "") !== mr_sub) {
                        frm.set_value("custom_sub_category", mr_sub);
                    }
                });
        }
    }
});


// get item from material request 


frappe.ui.form.on('Supplier Quotation', {

    refresh: function(frm) {

        console.log("SQ Refresh");

        // jab items aaye tab run kare
        if (frm.doc.items && frm.doc.items.length > 0) {

            let mr_name = frm.doc.items[0].material_request;

            console.log("MR from Item:", mr_name);

            if (mr_name) {

                frappe.db.get_doc("Material Request", mr_name)
                    .then(mr => {

                        console.log("MR Data:", mr);

                        frm.set_value("custom_project_name", mr.custom_select_project_);
                        frm.set_value("custom_store_name", mr.set_warehouse);
                        frm.set_value("custom_remark", mr.custom_remark);
                        frm.set_value("custom_category", mr.custom_category)

                        // null/"" normalize karke hi set karo, warna purane docs dirty ho jate hain
                        let mr_sub = mr.custom_sub_category || "";
                        if ((frm.doc.custom_sub_category || "") !== mr_sub) {
                            frm.set_value("custom_sub_category", mr_sub);
                        }
                    });
            }
        }
    }
});



// child table specification

frappe.ui.form.on('Supplier Quotation', {

    refresh: function(frm) {

        console.log("SQ Refresh");

        if (frm.doc.items && frm.doc.items.length > 0) {

            frm.doc.items.forEach(function(item) {

                if (item.material_request && item.material_request_item) {

                    frappe.db.get_doc("Material Request", item.material_request)
                        .then(mr => {

                            if (mr && mr.items) {

                                let mr_item = mr.items.find(i => i.name === item.material_request_item);

                                if (mr_item) {

                                    console.log("MR Item Found:", mr_item);

                                    frappe.model.set_value(
                                        item.doctype,
                                        item.name,
                                        "custom_specification",
                                        mr_item.custom_specification || ""
                                    );
                                }
                            }
                        })
                        .catch(err => {
                            console.log("Error:", err);
                        });
                }
            });
        }
    }
});


// child table filter

// Shared filter: category + sub category
// Sub category blank ho to sirf wahi items jo bina sub category ke hain
// NOTE: shared global scope — same function material_request.js,
// supplier_quotation.js, purchase_order.js teeno me hai, teeno copies
// hamesha IDENTICAL rakho
function get_item_category_filters(frm) {

    let filters = {
        "custom_category": frm.doc.custom_category
    };

    if (frm.doc.custom_sub_category) {
        filters["custom_sub_category"] = frm.doc.custom_sub_category;
    } else {
        filters["custom_sub_category"] = ["is", "not set"];
    }

    return filters;
}

frappe.ui.form.on('Supplier Quotation', {

    refresh: function(frm) {

        console.log("SQ Category Filter Applied");

        frm.set_query("item_code", "items", function(doc, cdt, cdn) {

            if (frm.doc.custom_category) {

                return {
                    query: "erpnext.controllers.queries.item_query",
                    filters: get_item_category_filters(frm)
                };

            } else {

                return {};
            }
        });
    }
});