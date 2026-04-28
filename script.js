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
// --- FLOATING PARTICLES LOGIC ---
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

let particles = [];
const particleCount = 40; 

function initCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

class Particle {
    constructor() {
        this.reset();
    }
    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.speedY = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.5;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas.width || this.x < 0 || this.y > canvas.height || this.y < 0) {
            this.reset();
        }
    }
    draw() {
        ctx.fillStyle = `rgba(167, 139, 250, ${this.opacity})`; 
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function createParticles() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
        p.update();
        p.draw();
    });
    requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
    initCanvas();
    createParticles();
});

initCanvas();
createParticles();
animate();
