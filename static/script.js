// Utility to handle image preview
function setupPreview(inputId, previewId, placeholderId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const placeholder = document.getElementById(placeholderId);

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                preview.src = event.target.result;
                preview.classList.remove('hidden');
                placeholder.classList.add('hidden');
            };
            reader.readAsDataURL(file);
        }
    });
}

setupPreview('baseImage', 'basePreview', 'basePlaceholder');
setupPreview('garmentImage', 'garmentPreview', 'garmentPlaceholder');

// Handle URL fetching
document.getElementById('fetchUrlBtn').addEventListener('click', async () => {
    const url = document.getElementById('garmentUrl').value;
    if (!url) return alert('Enter a URL first');

    const fetchBtn = document.getElementById('fetchUrlBtn');
    fetchBtn.disabled = true;
    fetchBtn.textContent = '...';

    try {
        const formData = new FormData();
        formData.append('url', url);

        const response = await fetch('/extract-image', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (response.ok) {
            const preview = document.getElementById('garmentPreview');
            const placeholder = document.getElementById('garmentPlaceholder');
            preview.src = data.image_url;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
            // We'll handle the actual file upload from URL on the backend
        } else {
            alert(data.detail || 'Could not fetch image');
        }
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch';
    }
});

// Handle Generation
document.getElementById('generateBtn').addEventListener('click', async () => {
    const baseFile = document.getElementById('baseImage').files[0];
    const garmentFile = document.getElementById('garmentImage').files[0];
    const garmentUrl = document.getElementById('garmentUrl').value;
    const garmentPreviewSrc = document.getElementById('garmentPreview').src;

    if (!baseFile) return alert('Please upload your photo (Base Image)');
    if (!garmentFile && !garmentUrl) return alert('Please upload or fetch a dress photo');

    const formData = new FormData();
    formData.append('base_image', baseFile);
    
    if (garmentFile) {
        formData.append('garment_image', garmentFile);
    } else {
        formData.append('garment_url', garmentPreviewSrc); // Use the fetched image URL
    }

    // Default values for removed options
    formData.append('garment_category', 'tops');
    formData.append('preserve_shoes', false);
    formData.append('add_train', false);
    formData.append('modesty_mode', false);
    formData.append('custom_prompt', '');

    // UI state
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('result').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('generateBtn').disabled = true;

    try {
        const response = await fetch('/generate', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('resultImage').src = data.result_url;
            document.getElementById('downloadBtn').href = data.result_url;
            document.getElementById('result').classList.remove('hidden');
        } else {
            throw new Error(data.detail || 'Generation failed');
        }
    } catch (err) {
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('errorMsg').textContent = err.message;
    } finally {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('generateBtn').disabled = false;
    }
});

