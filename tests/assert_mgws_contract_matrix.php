<?php

if ($argc !== 2) {
    fwrite(STDERR, "usage: php tests/assert_mgws_contract_matrix.php <contract-path>\n");
    exit(2);
}

$contractPath = $argv[1];
if (!is_file($contractPath) || !is_readable($contractPath)) {
    fwrite(STDERR, "unreadable contract: {$contractPath}\n");
    exit(2);
}

$content = file_get_contents($contractPath);
if ($content === false) {
    fwrite(STDERR, "unreadable contract: {$contractPath}\n");
    exit(2);
}

$requiredRows = array(
    'POST /wp-json/mgws/v1/pos/checkout',
    'GET /wp-json/mgws/v1/inventory/status',
    'GET /wp-json/mgws/v1/inventory/stock/product/{productId}',
    'GET /wp-json/mgws/v1/inventory/stock/all',
    'GET /wp-json/mgws/v1/inventory/statistics',
    'GET /wp-json/mgws/v1/inventory/low-stock',
    'POST /wp-json/mgws/v1/inventory/stock/sync',
    'PUT /wp-json/mgws/v1/inventory/stock/reconcile',
    'POST /wp-json/mgws/v1/inventory/stock/move',
    'POST /wp-json/mgws/v1/inventory/rfid/scan',
    'GET /wp-json/mgws/v1/loyalty/customers/{customerId}',
    'POST /wp-json/mgws/v1/loyalty/customers/{customerId}/points/add',
    'POST /wp-json/mgws/v1/loyalty/customers/{customerId}/points/deduct',
    'GET /wp-json/mgws/v1/loyalty/lookup/card/{cardNumber}',
    'GET /wp-json/mgws/v1/loyalty/lookup/email/{email}',
    'PUT /wp-json/mgws/v1/loyalty/customers/{customerId}/card',
    'DELETE /wp-json/mgws/v1/loyalty/customers/{customerId}/card',
    'GET /wp-json/mgws/v1/loyalty/customers/{customerId}/history',
    'GET /wp-json/mgws/v1/loyalty/stats',
    'GET /wp-json/mgws/v1/loyalty/status',
    'POST /wp-json/mgws/v1/inventory/quick-load',
    'GET /wp-json/mgws/v1/inventory/sites',
    'GET /wp-json/mgws/v1/inventory/warehouses',
    'GET /wp-json/mgws/v1/inventory/locations',
    'GET /wp-json/mgws/v1/inventory/suppliers',
    'POST /wp-json/mgws/v1/inventory/suppliers',
    'GET /wp-json/mgws/v1/inventory/suppliers/{supplierId}',
    'PATCH /wp-json/mgws/v1/inventory/suppliers/{supplierId}',
    'DELETE /wp-json/mgws/v1/inventory/suppliers/{supplierId}',
    'GET /wp-json/mgws/v1/inventory/reorder-rules',
    'POST /wp-json/mgws/v1/inventory/reorder-rules',
    'PATCH /wp-json/mgws/v1/inventory/reorder-rules/{ruleId}',
    'DELETE /wp-json/mgws/v1/inventory/reorder-rules/{ruleId}',
    'GET /wp-json/mgws/v1/inventory/reorder-suggestions',
    'GET /wp-json/mgws/v1/inventory/purchase-orders',
    'POST /wp-json/mgws/v1/inventory/purchase-orders',
    'GET /wp-json/mgws/v1/inventory/purchase-orders/{purchaseOrderId}',
    'PATCH /wp-json/mgws/v1/inventory/purchase-orders/{purchaseOrderId}',
    'POST /wp-json/mgws/v1/inventory/purchase-orders/{purchaseOrderId}/lines',
    'POST /wp-json/mgws/v1/inventory/purchase-orders/{purchaseOrderId}/status',
    'POST /wp-json/mgws/v1/inventory/purchase-orders/{purchaseOrderId}/verify',
    'GET /wp-json/mgws/v1/inventory/receipts',
    'POST /wp-json/mgws/v1/inventory/receipts',
    'GET /wp-json/mgws/v1/inventory/receipts/{receiptId}',
    'PATCH /wp-json/mgws/v1/inventory/receipts/{receiptId}',
    'POST /wp-json/mgws/v1/inventory/receipts/{receiptId}/convalida',
    'GET /wp-json/mgws/v1/inventory/backorders',
    'GET /wp-json/mgws/v1/inventory/count-sessions',
    'POST /wp-json/mgws/v1/inventory/count-sessions',
    'GET /wp-json/mgws/v1/inventory/count-sessions/{sessionId}',
    'PATCH /wp-json/mgws/v1/inventory/count-sessions/{sessionId}',
    'POST /wp-json/mgws/v1/inventory/count-sessions/{sessionId}/lines',
    'POST /wp-json/mgws/v1/inventory/count-sessions/{sessionId}/approve',
    'GET /wp-json/mgws/v1/inventory/movements',
    'GET /wp-json/mgws/v1/inventory/movements/{movementId}',
);

$counts = array_fill_keys($requiredRows, 0);
foreach (preg_split('/\R/', $content) as $line) {
    $line = trim($line);
    if ($line === '' || $line[0] !== '|') {
        continue;
    }

    $cells = array_map('trim', explode('|', trim($line, '|')));
    if (count($cells) < 11 || $cells[0] !== 'mgws/v1') {
        continue;
    }

    $row = strtoupper($cells[2]) . ' ' . $cells[1];
    if (array_key_exists($row, $counts)) {
        $counts[$row]++;
    }
}

$problems = array();
foreach ($counts as $row => $count) {
    if ($count === 0) {
        $problems[] = "missing {$row}";
    } elseif ($count > 1) {
        $problems[] = "duplicated {$row}";
    }
}

foreach (array('<fill>', '[endpoint]', 'TBD', 'TODO') as $placeholder) {
    if (strpos($content, $placeholder) !== false) {
        $problems[] = "placeholder {$placeholder}";
    }
}

if ($problems !== array()) {
    fwrite(STDERR, implode("\n", $problems) . "\n");
    exit(1);
}

fwrite(STDOUT, "MGWS v1 contract matrix: 50 required rows verified\n");
