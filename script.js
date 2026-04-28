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
function switchToAnnotatorForm() { if(elements.annotatorInfoModal) elements.annotatorInfoModal.style.display = 'none'; setTimeout(openAnnotatorFormModal, 300); }

function toggleExpField() {
    const expSelect = document.getElementById('prevExp');
    const expDetail = document.getElementById('expDetail');
    if (expSelect && expDetail) {
        expDetail.style.display = (expSelect.value === 'yes') ? 'block' : 'none';
    }
}

// --- 4. REVEAL ON SCROLL ---
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('active'); });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// --- 5. ULTRA-SMOOTH MAGNETIC CURSOR LOGIC ---
const cursorDot = document.getElementById('cursor-dot');
const cursorOutline = document.getElementById('cursor-outline');

let mouseX = 0, mouseY = 0;     
let dotX = 0, dotY = 0;         
let outlineX = 0, outlineY = 0; 
let targetX = 0, targetY = 0;   
let targetWidth = 35, targetHeight = 35; 
let targetRadius = 50;          
let isMagnetic = false;

window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

function animateCursor() {
    // 1. Smooth Dot Movement
    dotX += (mouseX - dotX) * 0.2;
    dotY += (mouseY - dotY) * 0.2;
    if(cursorDot) {
        cursorDot.style.left = `${dotX}px`;
        cursorDot.style.top = `${dotY}px`;
    }

    // 2. Smooth Outline Logic
    if (!isMagnetic) {
        targetX = mouseX;
        targetY = mouseY;
        targetWidth = 35;
        targetHeight = 35;
        targetRadius = 50;
    }

    outlineX += (targetX - outlineX) * 0.15; 
    outlineY += (targetY - outlineY) * 0.15;
    
    if(cursorOutline) {
        cursorOutline.style.left = `${outlineX}px`;
        cursorOutline.style.top = `${outlineY}px`;
        cursorOutline.style.width = `${targetWidth}px`;
        cursorOutline.style.height = `${targetHeight}px`;
        cursorOutline.style.borderRadius = isMagnetic ? targetRadius : '50%';
    }

    requestAnimationFrame(animateCursor);
}
animateCursor();

// Function to Attach Magnetic Events
function attachMagneticEffect() {
    document.querySelectorAll('button, a, .card-glow').forEach(el => {
        el.addEventListener('mouseenter', () => {
            isMagnetic = true;
            const rect = el.getBoundingClientRect();
            targetX = rect.left + rect.width / 2;
            targetY = rect.top + rect.height / 2;
            targetWidth = rect.width + 12;
            targetHeight = rect.height + 12;
            targetRadius = window.getComputedStyle(el).borderRadius;
            
            cursorOutline.style.backgroundColor = "rgba(167, 139, 250, 0.1)";
            cursorOutline.style.borderColor = "rgba(167, 139, 250, 0.8)";
        });

        el.addEventListener('mouseleave', () => {
            isMagnetic = false;
            cursorOutline.style.backgroundColor = "transparent";
            cursorOutline.style.borderColor = "#A78BFA";
        });
    });
}
attachMagneticEffect();

// --- 6. TYPEWRITER EFFECT ---
const textElement = document.getElementById('typewriter');
const phrases = ["Perfect Training Data", "Precise Image Labels", "Expert Transcription", "High-Quality RLHF", "Accurate Datasets"];
let phraseIndex = 0, charIndex = 0, isDeleting = false, typeSpeed = 100;

function typeEffect() {
    if (!textElement) return;
    const currentPhrase = phrases[phraseIndex];
    if (isDeleting) {
        textElement.textContent = currentPhrase.substring(0, charIndex - 1);
        charIndex--;
        typeSpeed = 50;
    } else {
        textElement.textContent = currentPhrase.substring(0, charIndex + 1);
        charIndex++;
        typeSpeed = 100;
    }
    if (!isDeleting && charIndex === currentPhrase.length) {
        isDeleting = true;
        typeSpeed = 2000;
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        typeSpeed = 500;
    }
    setTimeout(typeEffect, typeSpeed);
}
typeEffect();

// --- 7. FAQ ACCORDION ---
function toggleFAQ(button) {
    const content = button.nextElementSibling;
    const icon = button.querySelector('svg');
    if (content.style.maxHeight && content.style.maxHeight !== '0px') {
        content.style.maxHeight = '0px';
        if(icon) icon.style.transform = 'rotate(0deg)';
    } else {
        content.style.maxHeight = content.scrollHeight + "px";
        if(icon) icon.style.transform = 'rotate(180deg)';
    }
}

// --- 8. BACKGROUND PARTICLES ---
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
    function animateParticles() { ctx.clearRect(0, 0, canvas.width, canvas.height); particles.forEach(p => { p.update(); p.draw(); }); requestAnimationFrame(animateParticles); }
    initCanvas();
    for (let i = 0; i < 60; i++) particles.push(new Particle());
    animateParticles();
    window.addEventListener('resize', initCanvas);
}

// --- 9. MISC UI ---
window.onclick = (e) => {
    Object.values(elements).forEach(modal => { if (e.target == modal) { modal.style.display = 'none'; document.body.style.overflow = 'auto'; } });
};
