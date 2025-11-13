# JavaScript Additions for Unified Inventory System

## Key Changes Needed in inventory.html <script> section

### 1. Add Product Fields Toggle Handler

Add this after the `setupEventListeners()` function:

```javascript
// Product fields toggle
const isProductCheckbox = document.getElementById('is-product-checkbox');
const productFields = document.getElementById('product-fields');

isProductCheckbox.addEventListener('change', () => {
    if (isProductCheckbox.checked) {
        productFields.classList.remove('hidden');
    } else {
        productFields.classList.add('hidden');
    }
});
```

### 2. Update Form Submit Handler

Replace the form submit handler to include product fields:

```javascript
document.getElementById('inventory-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const itemData = {
        name: document.getElementById('item-name').value.trim(),
        type: document.getElementById('item-type').value,
        quantity: parseFloat(document.getElementById('item-quantity').value),
        unit: document.getElementById('item-unit').value.trim(),
        price: parseFloat(document.getElementById('item-price').value),
        lowStockThreshold: parseInt(document.getElementById('item-threshold').value) || 10,
        supplier: document.getElementById('item-supplier').value.trim(),
        description: document.getElementById('item-description').value.trim(),
        sku: document.getElementById('item-sku').value.trim(),
        
        // Product fields
        isProduct: document.getElementById('is-product-checkbox').checked,
        category: document.getElementById('product-category').value.trim(),
        material: document.getElementById('product-material').value.trim(),
        imageUrl: document.getElementById('product-image').value.trim(),
        gallery: document.getElementById('product-gallery').value
            .split('\n')
            .map(url => url.trim())
            .filter(url => url.length > 0),
        sizes: document.getElementById('product-sizes').value
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0),
        colors: document.getElementById('product-colors').value
            .split(',')
            .map(c => c.trim())
            .filter(c => c.length > 0),
        productDetails: document.getElementById('product-details').value.trim(),
        faqs: document.getElementById('product-faqs').value.trim()
    };

    try {
        const url = editingItemId 
            ? `${API_BASE}/api/admin/inventory/${editingItemId}` 
            : `${API_BASE}/api/admin/inventory`;
        
        const method = editingItemId ? 'PATCH' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(itemData)
        });

        const result = await response.json();

        if (result.success) {
            closeModal();
            loadInventory();
            
            // Show success message with sync info
            const syncMessage = result.data.isProduct ? ' and synced to products' : '';
            showToast(`Item ${editingItemId ? 'updated' : 'created'} successfully${syncMessage}`, 'success');
        } else {
            showToast(result.message || 'Operation failed', 'error');
        }
    } catch (error) {
        console.error('Error saving item:', error);
        showToast('Failed to save item', 'error');
    }
});
```

### 3. Update renderTable() Function

Replace the renderTable function to show product indicators:

```javascript
function renderTable(items) {
    const tbody = document.getElementById('inventory-tbody');

    if (items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-12 text-center text-gray-500">
                    <i class="fas fa-inbox text-4xl mb-2 block"></i>
                    <p>No inventory items found</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = items.map(item => {
        const rowClass = item.status === 'low_stock' ? 'low-stock-row' : item.status === 'out_of_stock' ? 'out-of-stock-row' : '';
        
        // Product indicator badge
        const productBadge = item.isProduct ? 
            `<span class="ml-2 px-2 py-1 text-xs font-semibold text-indigo-700 bg-indigo-100 rounded-full" title="Synced to product catalog">
                <i class="fas fa-sync-alt"></i> Product
            </span>` : '';

        return `
            <tr class="${rowClass}">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <div class="text-sm font-medium text-gray-900">
                            ${escapeHtml(item.name)}
                            ${productBadge}
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 text-xs font-semibold ${
                        item.type === 'fabric' ? 'text-purple-700 bg-purple-100' : 'text-blue-700 bg-blue-100'
                    } rounded-full">
                        ${item.type === 'fabric' ? 'Material' : 'Product'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${item.quantity}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${escapeHtml(item.unit)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ₱${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${getStatusBadge(item.status)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${escapeHtml(item.supplier || '-')}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                        onclick="openEditModal('${item._id}')" 
                        class="text-indigo-600 hover:text-indigo-900 mr-3"
                        aria-label="Edit item"
                    >
                        <i class="fas fa-edit"></i>
                    </button>
                    <button 
                        onclick="openDeleteModal('${item._id}', '${escapeHtml(item.name)}', ${item.isProduct})" 
                        class="text-red-600 hover:text-red-900"
                        aria-label="Delete item"
                    >
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}
```

### 4. Update openEditModal() Function

Replace with extended version:

```javascript
async function openEditModal(itemId) {
    editingItemId = itemId;
    document.getElementById('modal-title').textContent = 'Edit Inventory Item';

    try {
        const response = await fetch(`${API_BASE}/api/admin/inventory/${itemId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'ngrok-skip-browser-warning': 'true'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load item');
        }

        const { data } = await response.json();

        // Populate basic fields
        document.getElementById('item-name').value = data.name;
        document.getElementById('item-type').value = data.type;
        document.getElementById('item-quantity').value = data.quantity;
        document.getElementById('item-unit').value = data.unit;
        document.getElementById('item-price').value = data.price;
        document.getElementById('item-threshold').value = data.lowStockThreshold || 10;
        document.getElementById('item-supplier').value = data.supplier || '';
        document.getElementById('item-sku').value = data.sku || '';
        document.getElementById('item-description').value = data.description || '';

        // Populate product fields
        const isProductCheckbox = document.getElementById('is-product-checkbox');
        const productFields = document.getElementById('product-fields');
        
        isProductCheckbox.checked = data.isProduct || false;
        if (data.isProduct) {
            productFields.classList.remove('hidden');
            document.getElementById('product-category').value = data.category || '';
            document.getElementById('product-material').value = data.material || '';
            document.getElementById('product-image').value = data.imageUrl || '';
            document.getElementById('product-gallery').value = (data.gallery || []).join('\n');
            document.getElementById('product-sizes').value = (data.sizes || []).join(', ');
            document.getElementById('product-colors').value = (data.colors || []).join(', ');
            document.getElementById('product-details').value = data.productDetails || '';
            document.getElementById('product-faqs').value = data.faqs || '';
        } else {
            productFields.classList.add('hidden');
        }

        document.getElementById('inventory-modal').classList.remove('hidden');
        document.getElementById('inventory-modal').classList.add('flex');
    } catch (error) {
        console.error('Error loading item:', error);
        showToast('Failed to load item details', 'error');
    }
}
```

### 5. Update openDeleteModal() Function

```javascript
function openDeleteModal(itemId, itemName, isProduct) {
    editingItemId = itemId;
    document.getElementById('delete-item-name').textContent = itemName;
    
    // Show/hide product sync warning
    const syncWarning = document.getElementById('product-sync-warning');
    if (isProduct) {
        syncWarning.classList.remove('hidden');
    } else {
        syncWarning.classList.add('hidden');
    }
    
    document.getElementById('delete-modal').classList.remove('hidden');
    document.getElementById('delete-modal').classList.add('flex');
}
```

### 6. Add Toast Notification Function

```javascript
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${
        type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
```

## Summary of Changes

1. **Product Fields Toggle**: Show/hide product-specific fields based on checkbox
2. **Extended Form Data**: Collect all product fields when saving
3. **Product Indicator**: Visual badge in table showing which items are synced to products
4. **Delete Warning**: Show warning when deleting product-synced items
5. **Edit Support**: Properly load and display product fields when editing
6. **Toast Notifications**: User-friendly success/error messages

These changes enable the unified inventory system where materials and products are managed together, with automatic syncing to the customer-facing product catalog.
