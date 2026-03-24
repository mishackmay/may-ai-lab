document.addEventListener('DOMContentLoaded', () => {
    loadModules();
});

function loadModules() {
    const modules = [
        { name: 'Website Generator', desc: 'Create websites from descriptions', icon: '🌐' },
        { name: 'Business Dashboard', desc: 'Manage customers & bookings', icon: '📊' },
        { name: 'Troubleshooting AI', desc: 'Step-by-step problem solver', icon: '🔧' },
        { name: 'Face Recognition', desc: 'Secure login with webcam', icon: '👤' }
    ];
    
    const grid = document.getElementById('modules-grid');
    grid.innerHTML = modules.map(module => `
        <div class="module-card">
            <div class="module-icon">${module.icon}</div>
            <h3>${module.name}</h3>
            <p>${module.desc}</p>
        </div>
    `).join('');
}