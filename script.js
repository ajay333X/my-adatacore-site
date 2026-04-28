// 1. Modals link karein
const infoModal = document.getElementById('infoModal');
const contactModal = document.getElementById('contactModal');
const annotatorInfoModal = document.getElementById('annotatorInfoModal');
const annotatorFormModal = document.getElementById('annotatorFormModal');
const signInModal = document.getElementById('signInModal');
const getStartedModal = document.getElementById('getStartedModal');

// 2. Open/Close Functions
function openInfoModal() { if(infoModal) infoModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeInfoModal() { if(infoModal) infoModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openModal() { if(contactModal) contactModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeModal() { if(contactModal) contactModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openAnnotatorInfoModal() { if(annotatorInfoModal) annotatorInfoModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeAnnotatorInfoModal() { if(annotatorInfoModal) annotatorInfoModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openAnnotatorFormModal() { if(annotatorFormModal) annotatorFormModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeAnnotatorFormModal() { if(annotatorFormModal) annotatorFormModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openSignInModal() { if(signInModal) signInModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeSignInModal() { if(signInModal) signInModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openGetStartedModal() { if(getStartedModal) getStartedModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeGetStartedModal() { if(getStartedModal) getStartedModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

// 3. Logic
function chooseRole(role) {
    closeGetStartedModal();
    if (role === 'company') {
        setTimeout(openInfoModal, 300);
    } else {
        setTimeout(openAnnotatorInfoModal, 300);
    }
}

function switchToInquiry() { closeInfoModal(); setTimeout(openModal, 300); }
function switchToAnnotatorForm() { if(annotatorInfoModal) annotatorInfoModal.style.display = 'none'; setTimeout(openAnnotatorFormModal, 300); }

function toggleExpField() {
    const expSelect = document.getElementById('prevExp');
    const expDetail = document.getElementById('expDetail');
    if (expSelect && expSelect.value === 'yes') expDetail.classList.remove('hidden');
    else if(expDetail) expDetail.classList.add('hidden');
}

// 4. Background Click
window.onclick = function(e) {
    if (e.target == infoModal) closeInfoModal();
    if (e.target == contactModal) closeModal();
    if (e.target == annotatorInfoModal) closeAnnotatorInfoModal();
    if (e.target == annotatorFormModal) closeAnnotatorFormModal();
    if (e.target == signInModal) closeSignInModal();
    if (e.target == getStartedModal) closeGetStartedModal();
}
