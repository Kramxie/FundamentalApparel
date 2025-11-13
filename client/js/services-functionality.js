// Services Page Functionality
const API_BASE = 'https://unmumbled-balloonlike-gayle.ngrok-free.dev';

// NOTE: Tab switching removed - now using separate pages for each service
// Services are accessed via: customize-jersey-form.html, layout-creation-form.html, printing-only-form.html

// Printing Modal
function openPrintingModal() {
    const modal = document.getElementById('printing-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closePrintingModal() {
    const modal = document.getElementById('printing-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// File preview helper
function setupFilePreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    
    if (!input || !preview) return;
    
    input.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = preview.querySelector('img');
                if (img) {
                    img.src = e.target.result;
                    preview.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        }
    });
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', function() {
    // === CUSTOMIZE JERSEY SECTION ===
    
    // Design method toggle
    const designMethodRadios = document.querySelectorAll('input[name="design-method"]');
    const templateFields = document.getElementById('template-fields');
    const uploadFields = document.getElementById('upload-fields');
    
    designMethodRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'template') {
                templateFields.classList.remove('hidden');
                uploadFields.classList.add('hidden');
            } else {
                templateFields.classList.add('hidden');
                uploadFields.classList.remove('hidden');
            }
        });
    });
    
    // Logo type toggle
    const logoTypeRadios = document.querySelectorAll('input[name="logo-type"]');
    const logoUploadFields = document.getElementById('logo-upload-fields');
    
    logoTypeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'upload') {
                logoUploadFields.classList.remove('hidden');
            } else {
                logoUploadFields.classList.add('hidden');
            }
        });
    });
    
    // Quantity change - show/hide team details
    const quantityInput = document.getElementById('jersey-quantity');
    const teamDetailsSection = document.getElementById('team-details-section');
    
    quantityInput.addEventListener('input', function() {
        if (parseInt(this.value) > 1) {
            teamDetailsSection.classList.remove('hidden');
        } else {
            teamDetailsSection.classList.add('hidden');
            document.getElementById('include-members').checked = false;
            document.getElementById('team-members-container').classList.add('hidden');
        }
    });
    
    // Include team members checkbox
    const includeMembersCheckbox = document.getElementById('include-members');
    const teamMembersContainer = document.getElementById('team-members-container');
    
    includeMembersCheckbox.addEventListener('change', function() {
        if (this.checked) {
            teamMembersContainer.classList.remove('hidden');
            generateTeamMemberFields();
        } else {
            teamMembersContainer.classList.add('hidden');
            teamMembersContainer.innerHTML = '';
        }
    });
    
    // Generate team member fields based on quantity
    function generateTeamMemberFields() {
        const quantity = parseInt(quantityInput.value);
        teamMembersContainer.innerHTML = '';
        
        for (let i = 1; i <= quantity; i++) {
            const memberDiv = document.createElement('div');
            memberDiv.className = 'border rounded-lg p-4 bg-gray-50';
            memberDiv.innerHTML = `
                <h4 class="font-semibold text-gray-900 mb-3">Member ${i}</h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input type="text" placeholder="Name" 
                        class="member-name px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    <input type="text" placeholder="Jersey Number" 
                        class="member-number px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    <select class="member-size px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <option value="">Size</option>
                        <option value="XS">XS</option>
                        <option value="S">S</option>
                        <option value="M">M</option>
                        <option value="L">L</option>
                        <option value="XL">XL</option>
                        <option value="XXL">XXL</option>
                        <option value="3XL">3XL</option>
                    </select>
                </div>
            `;
            teamMembersContainer.appendChild(memberDiv);
        }
    }
    
    // Shorts checkbox
    const includeShortsCheckbox = document.getElementById('include-shorts');
    const shortsOptions = document.getElementById('shorts-options');
    
    includeShortsCheckbox.addEventListener('change', function() {
        if (this.checked) {
            shortsOptions.classList.remove('hidden');
        } else {
            shortsOptions.classList.add('hidden');
        }
    });
    
    // Shorts design radio
    const shortsDesignRadios = document.querySelectorAll('input[name="shorts-design"]');
    const shortsDifferentFields = document.getElementById('shorts-different-fields');
    const shortsTemplateFields = document.getElementById('shorts-template-fields');
    const shortsUploadFields = document.getElementById('shorts-upload-fields');
    
    shortsDesignRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'different') {
                shortsDifferentFields.classList.remove('hidden');
                // Check if using template or upload method
                const designMethod = document.querySelector('input[name="design-method"]:checked').value;
                if (designMethod === 'template') {
                    shortsTemplateFields.classList.remove('hidden');
                    shortsUploadFields.classList.add('hidden');
                } else {
                    shortsTemplateFields.classList.add('hidden');
                    shortsUploadFields.classList.remove('hidden');
                }
            } else {
                shortsDifferentFields.classList.add('hidden');
            }
        });
    });
    
    // Update shorts fields when design method changes
    designMethodRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            const shortsDifferent = document.querySelector('input[name="shorts-design"]:checked')?.value === 'different';
            if (shortsDifferent) {
                if (this.value === 'template') {
                    shortsTemplateFields.classList.remove('hidden');
                    shortsUploadFields.classList.add('hidden');
                } else {
                    shortsTemplateFields.classList.add('hidden');
                    shortsUploadFields.classList.remove('hidden');
                }
            }
        });
    });
    
    // Setup file previews
    setupFilePreview('logo-file', 'logo-preview');
    setupFilePreview('jersey-design-file', 'jersey-design-preview');
    setupFilePreview('shorts-design-file', 'shorts-design-preview');
    setupFilePreview('inspiration-image', 'inspiration-preview');
    setupFilePreview('printing-design-file', 'printing-design-preview');
    
    // === PRINTING ONLY SECTION ===
    
    // Printing method toggle
    const printingMethodRadios = document.querySelectorAll('input[name="printing-method"]');
    const printingUploadField = document.getElementById('printing-upload-field');
    
    printingMethodRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'upload-design') {
                printingUploadField.classList.remove('hidden');
            } else {
                printingUploadField.classList.add('hidden');
            }
        });
    });
    
    // === FORM SUBMISSIONS ===
    
    // Customize Jersey Form
    document.getElementById('customize-jersey-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const token = localStorage.getItem('token');
        if (!token) {
            alert('Please log in to submit a custom order.');
            window.location.href = 'login.html';
            return;
        }
        
        const formData = new FormData();
        const designMethod = document.querySelector('input[name="design-method"]:checked').value;
        
        // Common fields
        formData.append('serviceType', 'customize-jersey');
        formData.append('customType', designMethod === 'template' ? 'Template' : 'FileUpload');
        formData.append('productName', 'Custom Jersey');
        formData.append('itemType', document.querySelector('input[name="item-type"]:checked').value);
        formData.append('printingType', document.querySelector('input[name="printing-type"]:checked').value);
        formData.append('quantity', document.getElementById('jersey-quantity').value);
        
        if (designMethod === 'template') {
            // Template fields
            const designStyle = document.getElementById('design-style').value;
            const primaryColor = document.getElementById('primary-color').value;
            const secondaryColor = document.getElementById('secondary-color').value;
            const accentColor = document.getElementById('accent-color').value;
            
            formData.append('designStyle', designStyle);
            formData.append('primaryColor', primaryColor);
            formData.append('secondaryColor', secondaryColor);
            formData.append('accentColor', accentColor);
            
            // Text details
            formData.append('textFont', document.getElementById('text-font').value);
            formData.append('textSize', document.getElementById('text-size').value);
            formData.append('textPlacement', document.getElementById('text-placement').value);
            formData.append('customText', document.getElementById('custom-text').value);
            
            // Logo
            const logoType = document.querySelector('input[name="logo-type"]:checked').value;
            formData.append('logoType', logoType);
            if (logoType === 'upload') {
                const logoFile = document.getElementById('logo-file').files[0];
                if (logoFile) {
                    formData.append('logoFile', logoFile);
                }
                formData.append('logoPlacement', document.getElementById('logo-placement').value);
            }
            
            // Design details string
            const designDetails = `Style: ${designStyle}, Colors: ${primaryColor}, ${secondaryColor}, ${accentColor}, Text: ${document.getElementById('custom-text').value}`;
            formData.append('designDetails', designDetails);
        } else {
            // Upload design
            const designFile = document.getElementById('jersey-design-file').files[0];
            if (!designFile) {
                alert('Please upload a design file.');
                return;
            }
            formData.append('designFile', designFile);
        }
        
        // Team details
        const teamName = document.getElementById('team-name').value;
        if (teamName) {
            formData.append('teamName', teamName);
        }
        
        const includeMembers = document.getElementById('include-members').checked;
        formData.append('includeTeamMembers', includeMembers);
        
        if (includeMembers) {
            const members = [];
            document.querySelectorAll('#team-members-container > div').forEach(memberDiv => {
                const name = memberDiv.querySelector('.member-name').value;
                const number = memberDiv.querySelector('.member-number').value;
                const size = memberDiv.querySelector('.member-size').value;
                if (name || number || size) {
                    members.push({ name, jerseyNumber: number, size });
                }
            });
            formData.append('teamMembers', JSON.stringify(members));
        }
        
        // Shorts
        const includeShorts = document.getElementById('include-shorts').checked;
        formData.append('includeShorts', includeShorts);
        
        if (includeShorts) {
            const shortsDesign = document.querySelector('input[name="shorts-design"]:checked').value;
            formData.append('shortsSameDesign', shortsDesign === 'same');
            
            if (shortsDesign === 'different') {
                if (designMethod === 'template') {
                    const shortsDetails = `Style: ${document.getElementById('shorts-design-style').value}, Colors: ${document.getElementById('shorts-primary-color').value}, ${document.getElementById('shorts-secondary-color').value}, ${document.getElementById('shorts-accent-color').value}`;
                    formData.append('shortsDesignDetails', shortsDetails);
                } else {
                    const shortsFile = document.getElementById('shorts-design-file').files[0];
                    if (shortsFile) {
                        formData.append('shortsDesignFile', shortsFile);
                    }
                }
            }
        }
        
        // Notes
        const notes = document.getElementById('jersey-notes').value;
        if (notes) {
            formData.append('notes', notes);
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/custom-orders`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('Custom order submitted successfully! Our team will review and send you a quote.');
                window.location.href = 'profile.html';
            } else {
                alert(data.error || 'Failed to submit order. Please try again.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred. Please try again.');
        }
    });
    
    // Layout Creation Form
    document.getElementById('layout-creation-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const token = localStorage.getItem('token');
        if (!token) {
            alert('Please log in to submit a custom order.');
            window.location.href = 'login.html';
            return;
        }
        
        const inspirationFile = document.getElementById('inspiration-image').files[0];
        if (!inspirationFile) {
            alert('Please upload an inspiration image.');
            return;
        }
        
        const formData = new FormData();
        formData.append('serviceType', 'layout-creation');
        formData.append('customType', 'LayoutCreation');
        formData.append('productName', 'Layout Creation Service');
        formData.append('designFile', inspirationFile);
        
        // Team details
        const teamName = document.getElementById('layout-team-name').value;
        formData.append('teamName', teamName);
        
        const memberName = document.getElementById('layout-member-name').value;
        if (memberName) {
            formData.append('memberName', memberName);
        }
        
        const jerseyNumber = document.getElementById('layout-jersey-number').value;
        if (jerseyNumber) {
            formData.append('jerseyNumber', jerseyNumber);
        }
        
        // Color palette
        const colors = [];
        for (let i = 1; i <= 5; i++) {
            const color = document.getElementById(`palette-color-${i}`).value;
            if (color) colors.push(color);
        }
        formData.append('colorPalette', JSON.stringify(colors));
        
        // Quantity
        formData.append('quantity', document.getElementById('layout-quantity').value);
        
        // Notes
        const notes = document.getElementById('layout-notes').value;
        if (notes) {
            formData.append('notes', notes);
        }
        
        const designDetails = `Team: ${teamName}, Colors: ${colors.join(', ')}`;
        formData.append('designDetails', designDetails);
        
        try {
            const response = await fetch(`${API_BASE}/api/custom-orders`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('Layout creation request submitted successfully! We will create your design and send it for approval.');
                window.location.href = 'profile.html';
            } else {
                alert(data.error || 'Failed to submit request. Please try again.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred. Please try again.');
        }
    });
    
    // Printing Only Form
    document.getElementById('printing-only-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const token = localStorage.getItem('token');
        if (!token) {
            alert('Please log in to submit a custom order.');
            window.location.href = 'login.html';
            return;
        }
        
        const printingMethod = document.querySelector('input[name="printing-method"]:checked').value;
        
        const formData = new FormData();
        formData.append('serviceType', 'printing-only');
        formData.append('customType', 'PrintingOnly');
        formData.append('productName', 'Printing Only Service');
        formData.append('printingMethod', printingMethod);
        
        if (printingMethod === 'upload-design') {
            const designFile = document.getElementById('printing-design-file').files[0];
            if (!designFile) {
                alert('Please upload your design file.');
                return;
            }
            formData.append('designFile', designFile);
        }
        
        // Quantity & size
        formData.append('quantity', document.getElementById('printing-quantity').value);
        formData.append('garmentSize', document.getElementById('garment-size').value);
        
        // Notes
        const notes = document.getElementById('printing-notes').value;
        if (notes) {
            formData.append('notes', notes);
        }
        
        const designDetails = `Printing Method: ${printingMethod}, Size: ${document.getElementById('garment-size').value}`;
        formData.append('designDetails', designDetails);
        
        try {
            const response = await fetch(`${API_BASE}/api/custom-orders`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('Printing order submitted successfully! We will review and send you a quote.');
                window.location.href = 'profile.html';
            } else {
                alert(data.error || 'Failed to submit order. Please try again.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred. Please try again.');
        }
    });
});
