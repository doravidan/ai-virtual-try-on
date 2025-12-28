// SaaS Config
const SUPABASE_URL = "https://wyemnhulehoeriscqvyl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZW1uaHVsZWhvZXJpc2NxdnlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDQ0NjEsImV4cCI6MjA4MjUyMDQ2MX0.yjOD1yuxxwFawYNOwSjOodgUxziwWfjEL62N918fnsY";

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth State Management
async function updateAuthState() {
    const { data: { session } } = await supabase.auth.getSession();
    const userMenu = document.getElementById('userMenu');
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

    const { error } = await supabase.auth.signInWithOtp({
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
    await supabase.auth.signOut();
    window.location.reload();
});

// Close modal on outside click
document.getElementById('authModal').addEventListener('click', (e) => {
    if (e.target.id === 'authModal') e.target.classList.add('hidden');
});

// Utility to handle image preview
function setupPreview(inputId, previewId, placeholderId) {
// ... existing setupPreview logic ...
}

setupPreview('baseImage', 'basePreview', 'basePlaceholder');
setupPreview('garmentImage', 'garmentPreview', 'garmentPlaceholder');

// ... existing fetchUrlBtn logic ...

// Handle Generation
document.getElementById('generateBtn').addEventListener('click', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        document.getElementById('authModal').classList.remove('hidden');
        return;
    }

    const baseFile = document.getElementById('baseImage').files[0];
    // ... existing validation ...

    const formData = new FormData();
    formData.append('base_image', baseFile);
    
    // ... existing garment logic ...

    // SaaS context
    const headers = { 'Authorization': `Bearer ${session.access_token}` };

    // UI state
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
            
            // Update credits locally
            document.getElementById('creditCount').textContent = `${data.remaining_credits} Credits`;
            
            // Smooth scroll to result
            setTimeout(() => {
                document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        } else {
            // Handle Insufficient Credits
            if (response.status === 402) {
                throw new Error("Insufficient credits. Buy more to continue styling!");
            }
            throw new Error(data.detail || 'Generation failed');
        }
    } catch (err) {
// ... existing error logic ...
    } finally {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('generateBtn').disabled = false;
    }
});

