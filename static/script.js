// SaaS Config
const SUPABASE_URL = "https://wyemnhulehoeriscqvyl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZW1uaHVsZWhvZXJpc2NxdnlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDQ0NjEsImV4cCI6MjA4MjUyMDQ2MX0.yjOD1yuxxwFawYNOwSjOodgUxziwWfjEL62N918fnsY";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

// Auth State Management
async function updateAuthState() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const creditCount = document.getElementById('creditCount');

    if (session) {
        loginBtn.classList.add('auth-hidden');
        userInfo.classList.remove('auth-hidden');
        
        // Fetch credits from backend
        try {
            const resp = await fetch('/user/profile', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const profile = await resp.json();
            creditCount.textContent = `${profile.credits || 0} Credits`;
        } catch (e) { console.error("Profile fetch failed", e); }
    } else {
        loginBtn.classList.remove('auth-hidden');
        userInfo.classList.add('auth-hidden');
    }
}

// Initial Auth Check
updateAuthState();

// Login Flow
document.getElementById('loginBtn').addEventListener('click', () => {
    document.getElementById('authModal').classList.remove('hidden');
});

document.getElementById('sendMagicLink').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value;
    const btn = document.getElementById('sendMagicLink');
    if (!email) return alert("Enter your email");

    btn.disabled = true;
    btn.textContent = "Sending...";

    const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin }
    });

    if (error) {
        alert(error.message);
        btn.disabled = false;
        btn.textContent = "Send Magic Link";
    } else {
        btn.textContent = "Check your email!";
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.reload();
});

// Close modal on outside click
document.getElementById('authModal').addEventListener('click', (e) => {
    if (e.target.id === 'authModal') e.target.classList.add('hidden');
});

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
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        document.getElementById('authModal').classList.remove('hidden');
        return;
    }

    const baseFile = document.getElementById('baseImage').files[0];
    const garmentFile = document.getElementById('garmentImage').files[0];
    const garmentUrl = document.getElementById('garmentUrl').value;
    const garmentPreviewSrc = document.getElementById('garmentPreview').src;

    if (!baseFile) return alert('Please upload your photo (Step 01)');
    if (!garmentFile && (!garmentPreviewSrc || !garmentPreviewSrc.startsWith('http'))) {
        return alert('Please upload or fetch a clothing photo (Step 02)');
    }

    const formData = new FormData();
    formData.append('base_image', baseFile);
    
    if (garmentFile) {
        formData.append('garment_image', garmentFile);
    } else {
        formData.append('garment_url', garmentPreviewSrc);
    }

    // Default values
    formData.append('garment_category', 'tops');
    formData.append('preserve_shoes', false);
    formData.append('add_train', false);
    formData.append('modesty_mode', false);
    formData.append('custom_prompt', '');

    const headers = { 'Authorization': `Bearer ${session.access_token}` };

    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('result').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('generateBtn').disabled = true;

    try {
        const response = await fetch('/generate', {
            method: 'POST',
            body: formData,
            headers: headers
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('resultImage').src = data.result_url;
            document.getElementById('downloadBtn').href = data.result_url;
            document.getElementById('result').classList.remove('hidden');
            
            if (data.remaining_credits !== undefined) {
                document.getElementById('creditCount').textContent = `${data.remaining_credits} Credits`;
            }
            
            setTimeout(() => {
                document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        } else {
            if (response.status === 402) {
                throw new Error("Insufficient credits. Please top up to continue styling!");
            }
            throw new Error(data.detail || 'Generation failed');
        }
    } catch (err) {
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('errorMsg').textContent = err.message;
        document.getElementById('error').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('generateBtn').disabled = false;
    }
});
