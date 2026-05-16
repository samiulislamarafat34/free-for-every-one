/* ==========================================
   Amanat - Animations & Interactions
   Premium Apple-Style Animations
   ========================================== */

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
  initAnimations();
});

function initAnimations() {
  // Initialize floating orbs parallax on mouse move
  initOrbParallax();

  // Add scroll animations
  initScrollAnimations();

  // Initialize toast system
  initToastSystem();
}

// Orb Parallax Effect
function initOrbParallax() {
  const orbs = document.querySelectorAll('.orb');
  if (!orbs.length) return;

  document.addEventListener('mousemove', function(e) {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;

    orbs.forEach((orb, index) => {
      const speed = (index + 1) * 5;
      orb.style.transform = `translate(${x * speed}px, ${y * speed}px)`;
    });
  });
}

// Scroll Animations
function initScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
      }
    });
  }, observerOptions);

  document.querySelectorAll('.feature-card, .about-item, .folder-card, .file-card, .device-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

// Add animation class when in view
document.addEventListener('scroll', () => {
  document.querySelectorAll('.feature-card, .about-item, .folder-card, .file-card, .device-item').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight - 100) {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }
  });
});

// Toast Notification System
function initToastSystem() {
  window.showToast = function(message, type = 'info') {
    const container = document.querySelector('.toast-container');
    if (!container) {
      const newContainer = document.createElement('div');
      newContainer.className = 'toast-container';
      document.body.appendChild(newContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'fa-check-circle' :
                 type === 'error' ? 'fa-exclamation-circle' :
                 'fa-info-circle';

    toast.innerHTML = `
      <i class="fas ${icon}"></i>
      <span>${message}</span>
    `;

    document.querySelector('.toast-container').appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };
}

// Analyzing Screen Functions
window.showAnalyzing = function(messages, callback) {
  const screen = document.querySelector('.analyzing-screen');
  if (!screen) return;

  const textEl = screen.querySelector('.analyzing-text');
  const dotsEl = screen.querySelector('.analyzing-dots');

  if (!textEl || !dotsEl) return;

  screen.classList.add('active');

  let index = 0;

  function showNextMessage() {
    if (index < messages.length) {
      textEl.textContent = messages[index].text;
      dotsEl.innerHTML = '<span></span><span></span><span></span>';

      setTimeout(() => {
        showNextMessage();
      }, messages[index].delay);
      index++;
    } else {
      setTimeout(() => {
        screen.classList.remove('active');
        if (callback) callback();
      }, 1000);
    }
  }

  showNextMessage();
};

// Form validation helpers
window.validateEmail = function(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

window.validatePassword = function(password) {
  return password.length >= 6;
};

// File type detection
window.getFileType = function(mimeType) {
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/') || mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
  return 'other';
};

// Format file size
window.formatFileSize = function(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format date to Bengali
window.formatDateBN = function(date) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(date).toLocaleDateString('bn-BD', options);
};

// Convert number to Bengali
window.toBangla = function(num) {
  const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return num.toString().replace(/\d/g, d => banglaDigits[d]);
};

// Format file size
window.formatSize = function(bytes) {
  if (!bytes || bytes === 0) return '০ MB';
  const k = 1024;
  const sizes = ['বাইট', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
  return toBangla(size) + ' ' + sizes[Math.min(i, sizes.length - 1)];
};

// Modal helpers
window.openModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
};

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
};

// Close modal on outside click
document.querySelectorAll('.modal-overlay').forEach(modal => {
  modal.addEventListener('click', function(e) {
    if (e.target === this) {
      this.classList.remove('active');
    }
  });
});

// Close modal on escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
      modal.classList.remove('active');
    });
  }
});

// Loading state helper
window.setLoading = function(button, loading) {
  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> লোড হচ্ছে...';
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalText || button.innerHTML;
  }
};

// Debounce function
window.debounce = function(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Local storage helpers with encryption simulation
window.storage = {
  set: function(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  get: function(key) {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  },
  remove: function(key) {
    localStorage.removeItem(key);
  },
  clear: function() {
    localStorage.clear();
  }
};

// API helper
window.api = {
  get: async function(url) {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include'
    });
    return response.json();
  },
  post: async function(url, data) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
      credentials: 'include'
    });
    return response.json();
  },
  upload: async function(url, formData) {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    return response.json();
  }
};

// Initialize common functionality
console.log('Amanat Animations Initialized');