// --- 1. MODAL ELEMENTS ---
const elements = {
    infoModal: document.getElementById('infoModal'),
    contactModal: document.getElementById('contactModal'),
    annotatorInfoModal: document.getElementById('annotatorInfoModal'),
    annotatorFormModal: document.getElementById('annotatorFormModal'),
    signInModal: document.getElementById('signInModal'),
    getStartedModal: document.getElementById('getStartedModal')
};

// --- 2. OPEN/CLOSE FUNCTIONS ---
function openInfoModal() { if(elements.infoModal) elements.infoModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeInfoModal() { if(elements.infoModal) elements.infoModal.style.display = 'none'; document.body.style.overflow = 'auto'; }
function openModal() { if(elements.contactModal) elements.contactModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeModal() { if(elements.contactModal) elements.contactModal.style.display = 'none'; document.body.style.overflow = 'auto'; }
function openAnnotatorInfoModal() { if(elements.annotatorInfoModal) elements.annotatorInfoModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeAnnotatorInfoModal() { if(elements.annotatorInfoModal) elements.annotatorInfoModal.style.display = 'none'; document.body.style.overflow = 'auto'; }
function openAnnotatorFormModal() { if(elements.annotatorFormModal) elements.annotatorFormModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeAnnotatorFormModal() { if(elements.annotatorFormModal) elements.annotatorFormModal.style.display = 'none'; document.body.style.overflow = 'auto'; }
function openSignInModal() { if(elements.signInModal) elements.signInModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeSignInModal() { if(elements.signInModal) elements.signInModal.style.display = 'none'; document.body.style.overflow = 'auto'; }
function openGetStartedModal() { if(elements.getStartedModal) elements.getStartedModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeGetStartedModal() { if(elements.getStartedModal) elements.getStartedModal.style.display = 'none'; document.body.style.overflow = 'auto'; }

// --- 3. LOGIC & TOGGLES ---
function chooseRole(role) {
    closeGetStartedModal();
    if (role === 'company') setTimeout(openInfoModal, 300);
    else setTimeout(openAnnotatorInfoModal, 300);
}
function switchToInquiry() { closeInfoModal(); setTimeout(openModal, 300); }
function switchToAnnotatorForm() { closeAnnotatorInfoModal(); setTimeout(openAnnotatorFormModal, 300); }

// --- 4. REVEAL ON SCROLL ---
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('active'); });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// --- 5. 3D TILT EFFECT ---
document.querySelectorAll('.card-glow').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const rotateX = ((e.clientY - rect.top - rect.height/2) / (rect.height/2)) * -10;
        const rotateY = ((e.clientX - rect.left - rect.width/2) / (rect.width/2)) * 10;
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });
    card.addEventListener('mouseleave', () => {
        card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    });
});

// --- 6. MAGNETIC CURSOR ---
const cursorDot = document.getElementById('cursor-dot');
const cursorOutline = document.getElementById('cursor-outline');
let mouseX = 0, mouseY = 0, dotX = 0, dotY = 0, outlineX = 0, outlineY = 0;
let targetX = 0, targetY = 0, targetWidth = 35, targetHeight = 35, targetRadius = 50, isMagnetic = false;
window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
function animateCursor() {
    dotX += (mouseX - dotX) * 0.2; dotY += (mouseY - dotY) * 0.2;
    if(cursorDot) { cursorDot.style.left = `${dotX}px`; cursorDot.style.top = `${dotY}px`; }
    if (!isMagnetic) { targetX = mouseX; targetY = mouseY; targetWidth = 35; targetHeight = 35; targetRadius = 50; }
    outlineX += (targetX - outlineX) * 0.15; outlineY += (targetY - outlineY) * 0.15;
    if(cursorOutline) { cursorOutline.style.left = `${outlineX}px`; cursorOutline.style.top = `${outlineY}px`; cursorOutline.style.width = `${targetWidth}px`; cursorOutline.style.height = `${targetHeight}px`; cursorOutline.style.borderRadius = isMagnetic ? targetRadius : '50%'; }
    requestAnimationFrame(animateCursor);
}
animateCursor();
document.querySelectorAll('button, a, .card-glow').forEach(el => {
    el.addEventListener('mouseenter', () => {
        isMagnetic = true; const rect = el.getBoundingClientRect(); targetX = rect.left + rect.width / 2; targetY = rect.top + rect.height / 2; targetWidth = rect.width + 12; targetHeight = rect.height + 12; targetRadius = window.getComputedStyle(el).borderRadius;
        if(cursorOutline){ cursorOutline.style.backgroundColor = "rgba(167, 139, 250, 0.1)"; cursorOutline.style.borderColor = "rgba(167, 139, 250, 0.8)"; }
    });
    el.addEventListener('mouseleave', () => { isMagnetic = false; if(cursorOutline){ cursorOutline.style.backgroundColor = "transparent"; cursorOutline.style.borderColor = "#A78BFA"; } });
});

// --- 7. TYPEWRITER ---
const textElement = document.getElementById('typewriter');
const phrases = ["Perfect Training Data", "Precise Image Labels", "Expert Transcription", "High-Quality RLHF", "Accurate Datasets"];
let phraseIndex = 0, charIndex = 0, isDeleting = false;
function typeEffect() {
    if (!textElement) return; const currentPhrase = phrases[phraseIndex];
    textElement.textContent = isDeleting ? currentPhrase.substring(0, charIndex - 1) : currentPhrase.substring(0, charIndex + 1);
    charIndex = isDeleting ? charIndex - 1 : charIndex + 1; let speed = isDeleting ? 50 : 100;
    if (!isDeleting && charIndex === currentPhrase.length) { isDeleting = true; speed = 2000; }
    else if (isDeleting && charIndex === 0) { isDeleting = false; phraseIndex = (phraseIndex + 1) % phrases.length; speed = 500; }
    setTimeout(typeEffect, speed);
}
typeEffect();

// --- 8. FAQ ---
function toggleFAQ(button) { const content = button.nextElementSibling; content.style.maxHeight = (content.style.maxHeight && content.style.maxHeight !== '0px') ? '0px' : content.scrollHeight + "px"; }

// --- 9. PARTICLES ---
const canvas = document.getElementById('particleCanvas');
if (canvas) {
    const ctx = canvas.getContext('2d'); let particles = [];
    function initCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    class Particle { constructor(){this.reset()} reset(){this.x=Math.random()*canvas.width;this.y=Math.random()*canvas.height;this.size=Math.random()*1.5;this.speedX=(Math.random()-.5)*.4;this.speedY=(Math.random()-.5)*.4;this.opacity=Math.random()*.4} update(){this.x+=this.speedX;this.y+=this.speedY;if(this.x>canvas.width||this.x<0||this.y>canvas.height||this.y<0)this.reset()} draw(){ctx.fillStyle=`rgba(167, 139, 250, ${this.opacity})`;ctx.beginPath();ctx.arc(this.x,this.y,this.size,0,Math.PI*2);ctx.fill()} }
    function animateParticles(){ctx.clearRect(0,0,canvas.width,canvas.height);particles.forEach(p=>{p.update();p.draw()});requestAnimationFrame(animateParticles)}
    initCanvas(); for(let i=0;i<60;i++)particles.push(new Particle()); animateParticles(); window.addEventListener('resize',initCanvas);
}

// --- 10. OUTSIDE CLICK ---
window.onclick = (e) => { Object.values(elements).forEach(modal => { if (modal && e.target == modal) { modal.style.display = 'none'; document.body.style.overflow = 'auto'; } }); };

// --- 11. SECURE PUBLIC FORMS ---
const FORM_API = 'https://llmhyezgcnbognmmsnzq.supabase.co/rest/v1';
const FORM_KEY = 'sb_publishable_QfaSTpmmj6reyY-kCsmhng_7PKvCGml';
async function postPublic(table, payload) {
    const res = await fetch(`${FORM_API}/${table}`, {
        method: 'POST',
        headers: { 'apikey': FORM_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.text()) || 'Unable to submit form');
}
const inquiryForm = document.getElementById('fullInquiryForm');
if (inquiryForm) inquiryForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const fields = inquiryForm.querySelectorAll('input,select,textarea'); const btn=inquiryForm.querySelector('button[type="submit"]'); btn.disabled=true; btn.textContent='Sending…';
    try { await postPublic('company_inquiries',{full_name:fields[0].value.trim(),company_name:fields[1].value.trim(),email:fields[2].value.trim().toLowerCase(),budget_range:fields[3].value,project_details:fields[4].value.trim()}); inquiryForm.reset(); closeModal(); alert('Thanks — your inquiry was submitted securely.'); }
    catch(err){ alert(err.message); } finally { btn.disabled=false; btn.textContent='Send Request →'; }
});
const annotatorForm = document.getElementById('annotatorAppForm');
if (annotatorForm) annotatorForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const fields=annotatorForm.querySelectorAll('input,select'); const btn=annotatorForm.querySelector('button[type="submit"]'); btn.disabled=true; btn.textContent='Submitting…';
    try { await postPublic('annotator_applications',{full_name:fields[0].value.trim(),birth_place:fields[1].value.trim(),email:fields[2].value.trim().toLowerCase(),education_level:fields[3].value}); annotatorForm.reset(); closeAnnotatorFormModal(); alert('Application submitted successfully.'); }
    catch(err){ alert(err.message); } finally { btn.disabled=false; btn.textContent='Submit Application'; }
});
