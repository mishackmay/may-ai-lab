AOS.init({ duration: 1000, once: true });

document.querySelector('.mobile-menu')?.addEventListener('click', () => {
    document.querySelector('.nav-links')?.classList.toggle('active');
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
    });
});

document.getElementById('contactForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Thank you! We will get back to you soon.');
    e.target.reset();
});

window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 100) navbar.style.background = 'rgba(255,255,255,0.98)';
    else navbar.style.background = 'white';
});

const stats = document.querySelectorAll('.stat-number');
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const stat = entry.target;
            const target = parseInt(stat.getAttribute('data-count'));
            let current = 0;
            const timer = setInterval(() => {
                current += target / 50;
                if (current >= target) {
                    stat.textContent = target;
                    clearInterval(timer);
                } else {
                    stat.textContent = Math.floor(current);
                }
            }, 20);
            observer.unobserve(stat);
        }
    });
}, { threshold: 0.5 });

stats.forEach(stat => observer.observe(stat));