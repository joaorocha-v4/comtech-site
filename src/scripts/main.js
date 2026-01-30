/* ========================================
   COMTECH SAÚDE - Main JavaScript
   Core Functionality
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initMobileMenu();
  initSmoothScroll();
  initScrollAnimations();
  initAccordion();
  initFormValidation();
});

/* ========================================
   HEADER SCROLL BEHAVIOR
   ======================================== */

function initHeader() {
  const header = document.querySelector('.header');
  if (!header) return;

  const scrollThreshold = 50;

  function updateHeader() {
    if (window.scrollY > scrollThreshold) {
      header.classList.remove('header-transparent');
      header.classList.add('header-solid');
    } else {
      header.classList.remove('header-solid');
      header.classList.add('header-transparent');
    }
  }

  // Initial check
  updateHeader();

  // Throttled scroll listener
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateHeader();
        ticking = false;
      });
      ticking = true;
    }
  });
}

/* ========================================
   MOBILE MENU
   ======================================== */

function initMobileMenu() {
  const toggle = document.querySelector('.mobile-toggle');
  const menu = document.querySelector('.mobile-menu');
  const body = document.body;

  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
    menu.classList.toggle('active');
    body.classList.toggle('menu-open');
  });

  // Close menu on link click
  const mobileLinks = menu.querySelectorAll('a');
  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      toggle.classList.remove('active');
      menu.classList.remove('active');
      body.classList.remove('menu-open');
    });
  });

  // Handle submenus
  const submenuTriggers = menu.querySelectorAll('.mobile-nav-link[data-submenu]');
  submenuTriggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const submenuId = trigger.getAttribute('data-submenu');
      const submenu = document.getElementById(submenuId);
      if (submenu) {
        submenu.classList.toggle('active');
        trigger.classList.toggle('active');
      }
    });
  });
}

/* ========================================
   SMOOTH SCROLL
   ======================================== */

function initSmoothScroll() {
  const anchors = document.querySelectorAll('a[href^="#"]');

  anchors.forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const headerOffset = 80;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

/* ========================================
   SCROLL ANIMATIONS (Intersection Observer)
   ======================================== */

function initScrollAnimations() {
  const animatedElements = document.querySelectorAll('.fade-in, .slide-left, .slide-right, .scale-in, .stagger-children');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          // Optionally unobserve after animation
          // observer.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      rootMargin: '0px 0px -80px 0px',
      threshold: 0.1
    });

    animatedElements.forEach(el => observer.observe(el));
  } else {
    // Fallback for older browsers
    animatedElements.forEach(el => el.classList.add('visible'));
  }
}

/* ========================================
   ACCORDION
   ======================================== */

function initAccordion() {
  const accordionHeaders = document.querySelectorAll('.accordion-header');

  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const isActive = item.classList.contains('active');

      // Close all other items (optional - for single open)
      const accordion = item.parentElement;
      accordion.querySelectorAll('.accordion-item').forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove('active');
        }
      });

      // Toggle current item
      item.classList.toggle('active', !isActive);
    });
  });
}

/* ========================================
   FORM VALIDATION
   ======================================== */

function initFormValidation() {
  const forms = document.querySelectorAll('form[data-validate]');

  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      let isValid = true;
      const requiredFields = form.querySelectorAll('[required]');

      requiredFields.forEach(field => {
        removeError(field);

        if (!field.value.trim()) {
          showError(field, 'Este campo é obrigatório');
          isValid = false;
        } else if (field.type === 'email' && !isValidEmail(field.value)) {
          showError(field, 'Por favor, insira um e-mail válido');
          isValid = false;
        } else if (field.type === 'tel' && !isValidPhone(field.value)) {
          showError(field, 'Por favor, insira um telefone válido');
          isValid = false;
        }
      });

      if (!isValid) {
        e.preventDefault();
      }
    });
  });
}

function showError(field, message) {
  field.classList.add('form-error');
  const hint = field.parentElement.querySelector('.form-hint');
  if (hint) {
    hint.textContent = message;
    hint.classList.add('form-error');
  } else {
    const errorHint = document.createElement('span');
    errorHint.className = 'form-hint form-error';
    errorHint.textContent = message;
    field.parentElement.appendChild(errorHint);
  }
}

function removeError(field) {
  field.classList.remove('form-error');
  const hint = field.parentElement.querySelector('.form-hint.form-error');
  if (hint) {
    hint.remove();
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^[\d\s\(\)\-\+]{10,}$/.test(phone);
}

/* ========================================
   COUNTER ANIMATION
   ======================================== */

function animateCounters() {
  const counters = document.querySelectorAll('.stat-number[data-target]');

  counters.forEach(counter => {
    const target = parseInt(counter.getAttribute('data-target'), 10);
    const duration = 2000;
    const step = target / (duration / 16);
    let current = 0;

    const updateCounter = () => {
      current += step;
      if (current < target) {
        counter.textContent = Math.floor(current);
        requestAnimationFrame(updateCounter);
      } else {
        counter.textContent = target;
      }
    };

    updateCounter();
  });
}

// Trigger counter animation when stats section is visible
document.addEventListener('DOMContentLoaded', () => {
  const statsSection = document.querySelector('.stats-grid');
  if (statsSection && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounters();
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    observer.observe(statsSection);
  }
});

/* ========================================
   WHATSAPP HELPER
   ======================================== */

function openWhatsApp(message = '') {
  const phone = '5562993451441';
  const encodedMessage = encodeURIComponent(message);
  const url = `https://wa.me/${phone}?text=${encodedMessage}`;
  window.open(url, '_blank');
}

// Expose to global scope for inline onclick
window.openWhatsApp = openWhatsApp;
