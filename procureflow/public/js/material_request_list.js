window.replace_material_request_pending_status_in_list = function () {
    const route = frappe.get_route ? frappe.get_route() : [];

    if (!(route[0] === "List" && route[1] === "Material Request")) {
        return;
    }

    let changed = 0;

    $(".list-row-container").each(function () {
        const $row = $(this);

        $row.find(".indicator-pill, .indicator, .badge, span, a, div").each(function () {
            const $el = $(this);
            const text = $el.text().trim();

            if (text === "Pending") {
                $el.text(__("Pending PO"));
                changed++;
            }
        });
    });

    console.log("[MR Pending PO] list replacement ran. Changed:", changed);
};

window.schedule_material_request_pending_po_list_fix = function () {
    window.replace_material_request_pending_status_in_list();
    setTimeout(window.replace_material_request_pending_status_in_list, 100);
    setTimeout(window.replace_material_request_pending_status_in_list, 300);
    setTimeout(window.replace_material_request_pending_status_in_list, 700);
    setTimeout(window.replace_material_request_pending_status_in_list, 1200);
    setTimeout(window.replace_material_request_pending_status_in_list, 2000);
};

frappe.listview_settings["Material Request"] =
    frappe.listview_settings["Material Request"] || {};

const old_mr_onload = frappe.listview_settings["Material Request"].onload;
frappe.listview_settings["Material Request"].onload = function (listview) {
    if (old_mr_onload) {
        old_mr_onload(listview);
    }

    window.schedule_material_request_pending_po_list_fix();

    if (listview && listview.$result && listview.$result.length) {
        const target = listview.$result.get(0);

        if (target && !target.__mr_pending_po_observer_added) {
            const observer = new MutationObserver(function () {
                window.schedule_material_request_pending_po_list_fix();
            });

            observer.observe(target, {
                childList: true,
                subtree: true,
                characterData: true
            });

            target.__mr_pending_po_observer_added = true;
        }
    }
};

const old_mr_refresh = frappe.listview_settings["Material Request"].refresh;
frappe.listview_settings["Material Request"].refresh = function (listview) {
    if (old_mr_refresh) {
        old_mr_refresh(listview);
    }

    window.schedule_material_request_pending_po_list_fix();
};

$(document).on("page-change", function () {
    window.schedule_material_request_pending_po_list_fix();
});

$(document).on("click", ".filter-button, .btn, .list-paging-area button, .sort-selector, .list-row", function () {
    setTimeout(window.schedule_material_request_pending_po_list_fix, 300);
});

setInterval(function () {
    const route = frappe.get_route ? frappe.get_route() : [];
    if (route[0] === "List" && route[1] === "Material Request") {
        window.replace_material_request_pending_status_in_list();
    }
}, 1500);

console.log("[MR Pending PO] material_request_list.js loaded");
