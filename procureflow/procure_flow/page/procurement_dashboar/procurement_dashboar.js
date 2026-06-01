frappe.pages['procurement-dashboar'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Procurement Dashboard',
		single_column: true
	});
}