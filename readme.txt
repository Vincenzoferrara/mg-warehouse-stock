=== MG Warehouse Stock ===
Contributors: vincenzoferrara
Tags: inventory, stock, warehouse, woocommerce, pos, ecommerce, order-management, stock-management, multi-site, reports
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 8.0
Requires Plugins: woocommerce
Stable tag: 2.3.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Multi-site and multi-warehouse stock for WooCommerce: locations, movement ledger, purchase orders, receiving and count sessions.

== Description ==

MG Warehouse Stock keeps WooCommerce stock organised by **where** it is, not only by how much there is.

A product's quantity is spread across a tree of sites, warehouses, rooms, racks and shelves. Staff pick from a specific shelf, every movement is written to an append-only ledger with a reason code, and the quantity shown on the product is the sum of that tree. Nothing is overwritten, so a stock count can always be reconciled against what actually happened.

= What it adds =

* **Multi-site, multi-warehouse locations.** Sites and warehouses are real post types with a room/rack/shelf tree. Searchable, and editable from the admin screen or the REST API.
* **Movement ledger.** Every adjustment, receipt, pick, return and count correction is a row with a reason code, an author and a timestamp. Stock is never silently changed.
* **Reorder rules.** Per-product thresholds that surface suggested purchase quantities.
* **Suppliers, purchase orders and receiving.** Send a purchase order, receive it partially or in full, and the received quantities post to the ledger.
* **Inventory count sessions.** Open a count, enter what is physically on each shelf, and the differences become counted movements.
* **Accepted order status.** A dedicated `Accepted` status with a flow for staff to accept orders and pick the lines to fulfil.
* **Per-role capabilities.** Seven capabilities split into read, move, approve, manage suppliers, accept orders and administer the plugin, so a shop assistant can move stock without seeing purchasing.
* **REST API.** 34 endpoints under `mgws/v1` covering locations, stock, movements, purchasing, receiving, counts, the point of sale and loyalty cards, plus 5 short-form endpoints under `mgws` for health checks, stock reads and moves, order acceptance and barcode resolution. This is the interface a mobile or handheld front end uses.
* **High-Performance Order Storage.** Declared compatible, so the plugin works with WooCommerce's HPOS order tables.

= A note on WooCommerce stock reduction =

By default this plugin leaves WooCommerce's own stock reduction **alone**. If you want MGWS to be the single authority for stock, and you do not run other stock plugins, opt in:

`update_option( 'mgws_woocommerce_stock_authority', '1' );`

WooCommerce asks whether it may reduce stock once per **order**, not once per item, so switching this on stops stock reduction for every item in the order. That is correct when MGWS owns the ledger, and disruptive when it does not. It is off by default so that installing this plugin never changes how your store handles stock behind your back.

== Installation ==

1. Upload the `mg-warehouse-stock` folder to `/wp-content/plugins/`, or install the plugin through the Plugins screen.
2. Activate it. WooCommerce must be installed and active; WordPress will refuse activation otherwise.
3. Open **WooCommerce → Magazzino** to create your first site and warehouse.
4. Set a product's stock. The quantity on the product becomes the total of your location tree, and WooCommerce's own quantity is kept in sync with it.

== Frequently Asked Questions ==

= Does it work with High-Performance Order Storage? =

Yes. Compatibility is declared on every load, so WooCommerce will not flag the plugin as incompatible.

= Can different users see different parts of it? =

Yes. Seven capabilities cover reading stock, moving stock, approving purchases, managing suppliers, accepting orders, and administering the plugin. Roles are assigned on activation and can be adjusted per user.

= Where do the quantities come from? =

From the sum of the location tree. A product with 3 units on one shelf and 5 on another shows 8. The movement ledger is the record of how it got there.

= Can I run it alongside another stock plugin? =

Yes, and that is the default. The plugin only takes over WooCommerce's stock reduction if you explicitly opt in with the `mgws_woocommerce_stock_authority` option described above. If another plugin also adjusts quantities, MGWS's ledger will not see those movements.

= What happens when I delete the plugin? =

WordPress runs the uninstall routine, which removes all 18 of its tables, its options, its custom post types, its user meta and its capabilities. Your products and orders are untouched. This is destructive and cannot be undone, so export anything you want to keep first.

= Is there a mobile app? =

The plugin exposes 34 REST endpoints under `mgws/v1` for the point of sale, loyalty cards, stock lookups, purchasing and counts, plus 5 short-form endpoints under `mgws`. It is built for a companion mobile or handheld front end.

== Changelog ==

= 2.3.0 =
* First public release of the multi-site, multi-warehouse stock manager.
* Location tree of sites, warehouses, rooms, racks and shelves.
* Append-only movement ledger with reason codes.
* Reorder rules, suppliers, purchase orders and receiving.
* Inventory count sessions with counted movements.
* Accepted order status and order acceptance flow.
* Seven per-role capabilities.
* 34 REST endpoints under `mgws/v1` and 5 short-form endpoints under `mgws`, covering the point of sale and loyalty cards.
* High-Performance Order Storage compatibility declared.
* Complete uninstall routine: tables, options, post types, user meta and capabilities.
* Translatable interface, English source with an Italian translation.
