// --- 1. सभी Modals को Identify करें ---
const infoModal = document.getElementById('infoModal');
const contactModal = document.getElementById('contactModal');
const annotatorInfoModal = document.getElementById('annotatorInfoModal');
const annotatorFormModal = document.getElementById('annotatorFormModal');
const signInModal = document.getElementById('signInModal');
const getStartedModal = document.getElementById('getStartedModal');

// --- 2. खोलने और बंद करने के फंक्शन्स ---
function openInfoModal() { infoModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeInfoModal() { infoModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openModal() { contactModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeModal() { contactModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openAnnotatorInfoModal() { annotatorInfoModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeAnnotatorInfoModal() { annotatorInfoModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openAnnotatorFormModal() { annotatorFormModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeAnnotatorFormModal() { annotatorFormModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openSignInModal() { signInModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeSignInModal() { signInModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openGetStartedModal() { getStartedModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeGetStartedModal() { getStartedModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

// --- 3. बटन के अंदर का Logic ---
function chooseRole(role) {
    closeGetStartedModal();
    if (role === 'company') {
        setTimeout(openInfoModal, 300);
    } else {
        setTimeout(openAnnotatorInfoModal, 300);
    }
}

function switchToInquiry() { closeInfoModal(); setTimeout(openModal, 300); }
function switchToAnnotatorForm() { annotatorInfoModal.style.display = 'none'; setTimeout(openAnnotatorFormModal, 300); }

function toggleExpField() {
    const expSelect = document.getElementById('prevExp');
    const expDetail = document.getElementById('expDetail');
    if (expSelect.value === 'yes') expDetail.classList.remove('hidden');
    else expDetail.classList.add('hidden');
}

// --- 4. बाहर क्लिक करने पर Modal बंद हो ---
window.onclick = function(e) {
    if (e.target == infoModal) closeInfoModal();
    if (e.target == contactModal) closeModal();
    if (e.target == annotatorInfoModal) closeAnnotatorInfoModal();
    if (e.target == annotatorFormModal) closeAnnotatorFormModal();
    if (e.target == signInModal) closeSignInModal();
    if (e.target == getStartedModal) closeGetStartedModal();
}

// --- 5. फॉर्म सबमिट होने पर मैसेज ---
document.getElementById('fullInquiryForm')?.addEventListener('submit', function(e) { 
    e.preventDefault(); alert('Request Sent!'); closeModal(); 
});
