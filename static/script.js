// SaaS Config
const SUPABASE_URL = "https://wyemnhulehoeriscqvyl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZW1uaHVsZWhvZXJpc2NxdnlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDQ0NjEsImV4cCI6MjA4MjUyMDQ2MX0.yjOD1yuxxwFawYNOwSjOodgUxziwWfjEL62N918fnsY";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentAuthMode = 'signin';

// Page Navigation
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    // Show target page
    document.getElementById(pageId + 'Page').classList.remove('hidden');
    
    if (pageId === 'gallery') loadGallery();
}

// Open Auth Modal with mode
function openAuthModal(mode = 'signin') {
    currentAuthMode = mode;
    const modal = document.getElementById('authModal');
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const switchText = document.getElementById('authSwitchText');
    const emailInput = document.getElementById('authEmail');
    const sendBtn = document.getElementById('sendMagicLink');

    modal.classList.remove('hidden');
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Magic Link';
    emailInput.value = '';

    if (mode === 'signup') {
        title.textContent = 'Create Account';
        subtitle.textContent = 'Join Styler AI and get 3 free credits.';
        switchText.innerHTML = `Already have an account? <button onclick="openAuthModal('signin')" class="text-indigo-600 font-bold underline">Sign in</button>`;
    } else {
        title.textContent = 'Welcome Back';
        subtitle.textContent = 'Enter your email to sign in.';
        switchText.innerHTML = `Don't have an account? <button onclick="openAuthModal('signup')" class="text-indigo-600 font-bold underline">Sign up</button>`;
    }
}

// Gallery Loading
async function loadGallery() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return openAuthModal('signin');

    const grid = document.getElementById('galleryGrid');
    const empty = document.getElementById('galleryEmpty');
    grid.innerHTML = '<div class="col-span-full text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"></div></div>';

    try {
        const resp = await fetch('/gallery', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const items = await resp.json();

        grid.innerHTML = '';
        if (items.length === 0) {
            empty.classList.remove('hidden');
        } else {
            empty.classList.add('hidden');
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'group relative aspect-[3/4] rounded-2xl overflow-hidden premium-shadow bg-white';
                div.innerHTML = `
                    <img src="${item.result_url}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                        <a href="${item.result_url}" download class="text-white text-xs font-bold uppercase tracking-wider">Download</a>
                    </div>
                `;
                grid.appendChild(div);
            });
        }
    } catch (e) {
        grid.innerHTML = '<p class="col-span-full text-rose-500 text-center">Failed to load gallery</p>';
    }
}

// Payment Redirect
async function buyCredits(plan) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return openAuthModal('signin');

    try {
        const resp = await fetch(`/checkout?plan=${plan}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await resp.json();
        if (data.url) window.location.href = data.url;
    } catch (e) {
        alert("Payment failed to initialize");
    }
}

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
    const loggedOutButtons = document.getElementById('loggedOutButtons');
    const userInfo = document.getElementById('userInfo');
    const creditCount = document.getElementById('creditCount');

    if (session) {
        if (loggedOutButtons) loggedOutButtons.classList.add('auth-hidden');
        userInfo.classList.remove('auth-hidden');
        
        try {
            const resp = await fetch('/user/profile', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const profile = await resp.json();
            if (profile && profile.credits !== undefined) {
                creditCount.textContent = `${profile.credits} Credits`;
            }
        } catch (e) { console.error("Profile fetch failed", e); }
    } else {
        if (loggedOutButtons) loggedOutButtons.classList.remove('auth-hidden');
        userInfo.classList.add('auth-hidden');
    }
}

// Initial Auth Check
updateAuthState();

// Login Flow
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

document.getElementById('buyStarterBtn').addEventListener('click', () => buyCredits('starter'));
document.getElementById('buyProBtn').addEventListener('click', () => buyCredits('pro'));

document.getElementById('generateBtn').addEventListener('click', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return openAuthModal('signup');

    const baseFile = document.getElementById('baseImage').files[0];
    const garmentFile = document.getElementById('garmentImage').files[0];
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
