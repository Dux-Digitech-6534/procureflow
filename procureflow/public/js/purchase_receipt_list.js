function get_purchase_receipt_payment_status_color(status) {
    if (status === "Fully Paid") {
        return "green";
    }

    if (status === "Partially Paid") {
        return "orange";
    }

    return "red";
}

function format_purchase_receipt_payment_status(value, df, doc) {
    const status = doc.custom_payment_status || value || "Not Paid";
    const color = get_purchase_receipt_payment_status_color(status);
    const escaped_status = frappe.utils.escape_html(status);
    const translated_status = frappe.utils.escape_html(__(status));

    return `<span class="indicator-pill ${color} filterable"
        data-filter="custom_payment_status,=,${escaped_status}">
        <span class="ellipsis">${translated_status}</span>
    </span>`;
}

function hide_purchase_receipt_default_status_column() {
    setTimeout(() => {
        const route = frappe.get_route ? frappe.get_route() : [];
        if (!route || route[0] !== "List" || route[1] !== "Purchase Receipt") {
            return;
        }

        const status_indexes = [];

        $(".list-row-head .list-row-col").each(function (index) {
            const $col = $(this);
            const text = $col.text().trim();
            const fieldname = $col.attr("data-fieldname");

            if (text === "Status" || fieldname === "status") {
                status_indexes.push(index);
            }
        });

        status_indexes.forEach(index => {
            $(".list-row-head .list-row-col").eq(index).hide();
            $(".list-row-container .list-row").each(function () {
                $(this).find(".list-row-col").eq(index).hide();
            });
        });
    }, 300);
}

function apply_purchase_receipt_payment_status_list_settings() {
    frappe.listview_settings["Purchase Receipt"] =
        frappe.listview_settings["Purchase Receipt"] || {};

    const settings = frappe.listview_settings["Purchase Receipt"];
    const add_fields = settings.add_fields || [];

    if (!add_fields.includes("custom_payment_status")) {
        settings.add_fields = add_fields.concat(["custom_payment_status"]);
    }

    settings.formatters = Object.assign({}, settings.formatters || {}, {
        custom_payment_status: format_purchase_receipt_payment_status
    });

    if (!settings.__procureflow_payment_status_hooks_added) {
        const old_onload = settings.onload;
        settings.onload = function (listview) {
            if (old_onload) {
                old_onload(listview);
            }
            hide_purchase_receipt_default_status_column();
        };

        const old_refresh = settings.refresh;
        settings.refresh = function (listview) {
            if (old_refresh) {
                old_refresh(listview);
            }
            hide_purchase_receipt_default_status_column();
        };

        settings.__procureflow_payment_status_hooks_added = true;
    }

    settings.hide_name_column = false;
}

apply_purchase_receipt_payment_status_list_settings();

frappe.after_ajax(() => {
    apply_purchase_receipt_payment_status_list_settings();
    hide_purchase_receipt_default_status_column();
});

$(document).on("page-change", function () {
    hide_purchase_receipt_default_status_column();
});

$(document).on("click", ".filter-button, .btn, .list-paging-area button, .sort-selector", function () {
    setTimeout(hide_purchase_receipt_default_status_column, 300);
});
