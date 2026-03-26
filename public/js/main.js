document.addEventListener('DOMContentLoaded', () => {
    loadModules();
    initMobileMenu();
});

function loadModules() {
    const modules = [
        { name: 'Website Generator', desc: 'Create websites from descriptions', icon: '🌐', link: '/website-gen' },
        { name: 'Business Dashboard', desc: 'Manage customers & bookings', icon: '📊', link: '/business' },
        { name: 'Troubleshooting AI', desc: 'Step-by-step problem solver', icon: '🔧', link: '/troubleshooting' },
        { name: 'Face Recognition', desc: 'Secure login with webcam', icon: '👤', link: '/face-auth' }
    ];
    
    const grid = document.getElementById('modules-grid');
    if (grid) {
        grid.innerHTML = modules.map(module => `
            <a href="${module.link}" class="module-card">
                <div class="module-icon">${module.icon}</div>
                <h3>${module.name}</h3>
                <p>${module.desc}</p>
            </a>
        `).join('');
    }
}

// Mobile menu toggle function
function initMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    const navLinks = document.getElementById('navLinks');
    
    if (mobileMenu && navLinks) {
        mobileMenu.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
        
        // Close menu when a link is clicked (optional)
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
            });
        });
    }
}