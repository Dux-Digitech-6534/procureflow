frappe.listview_settings["Purchase Receipt"] = {
    get_indicator: function (doc) {
        if (doc.custom_payment_status === "Fully Paid") {
            return [__("Fully Paid"), "green", "custom_payment_status,=,Fully Paid"];
        }

        if (doc.custom_payment_status === "Partially Paid") {
            return [__("Partially Paid"), "orange", "custom_payment_status,=,Partially Paid"];
        }

        if (doc.custom_payment_status === "Not Paid") {
            return [__("Not Paid"), "red", "custom_payment_status,=,Not Paid"];
        }
    }
};