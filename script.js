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

// --- 3. GET STARTED LOGIC ---
function chooseRole(role) {
    closeGetStartedModal();
    if (role === 'company') setTimeout(openInfoModal, 300);
    else setTimeout(openAnnotatorInfoModal, 300);
}

// --- 4. SWITCHERS & TOGGLES ---
function switchToInquiry() { closeInfoModal(); setTimeout(openModal, 300); }
function switchToAnnotatorForm() { if(elements.annotatorInfoModal) elements.annotatorInfoModal.style.display = 'none'; setTimeout(openAnnotatorFormModal, 300); }
function toggleExpField() {
    const expSelect = document.getElementById('prevExp');
    const expDetail = document.getElementById('expDetail');
    if (expSelect && expDetail) {
        if (expSelect.value === 'yes') expDetail.classList.remove('hidden');
        else expDetail.classList.add('hidden');
    }
}

// --- 5. REVEAL ON SCROLL ---
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('active'); });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// --- 6. 3D TILT EFFECT ---
document.querySelectorAll('.card-glow').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const rotateX = ((e.clientY - rect.top - rect.height/2) / (rect.height/2)) * -8;
        const rotateY = ((e.clientX - rect.left - rect.width/2) / (rect.width/2)) * 8;
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });
    card.addEventListener('mouseleave', () => card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`);
});

// --- 7. BACKGROUND PARTICLES ---
const canvas = document.getElementById('particleCanvas');
if (canvas) {
    const ctx = canvas.getContext('2d');
    let particles = [];
    function initCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * canvas.width; this.y = Math.random() * canvas.height;
            this.size = Math.random() * 1.5; this.speedX = (Math.random() - 0.5) * 0.4;
            this.speedY = (Math.random() - 0.5) * 0.4; this.opacity = Math.random() * 0.4;
        }
        update() {
            this.x += this.speedX; this.y += this.speedY;
            if (this.x > canvas.width || this.x < 0 || this.y > canvas.height || this.y < 0) this.reset();
        }
        draw() { ctx.fillStyle = `rgba(167, 139, 250, ${this.opacity})`; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); }
    }
    function animate() { ctx.clearRect(0, 0, canvas.width, canvas.height); particles.forEach(p => { p.update(); p.draw(); }); requestAnimationFrame(animate); }
    initCanvas();
    for (let i = 0; i < 60; i++) particles.push(new Particle());
    animate();
    window.addEventListener('resize', initCanvas);
}

// --- 8. CUSTOM CURSOR LOGIC ---
const cursorDot = document.getElementById('cursor-dot');
const cursorOutline = document.getElementById('cursor-outline');
if (cursorDot && cursorOutline) {
    window.addEventListener('mousemove', (e) => {
        cursorDot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        cursorOutline.animate({
            transform: `translate(${e.clientX - 15}px, ${e.clientY - 15}px)`
        }, { duration: 150, fill: "forwards" });
    });
    document.querySelectorAll('button, a, .card-glow').forEach(el => {
        el.addEventListener('mouseenter', () => { cursorOutline.style.transform += ' scale(1.5)'; cursorOutline.style.backgroundColor = 'rgba(167, 139, 250, 0.1)'; });
        el.addEventListener('mouseleave', () => { cursorOutline.style.transform = cursorOutline.style.transform.replace(' scale(1.5)', ''); cursorOutline.style.backgroundColor = 'transparent'; });
    });
}

// --- 9. CLICK FEEDBACK & MODAL CLOSE ---
document.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('mousedown', () => btn.style.transform = 'scale(0.96)');
    btn.addEventListener('mouseup', () => btn.style.transform = 'scale(1)');
});

window.onclick = function(e) {
    Object.values(elements).forEach(modal => { if (e.target == modal) { modal.style.display = 'none'; document.body.style.overflow = 'auto'; } });
};
