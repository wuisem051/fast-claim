// FastClaim Landing Page Interactive Script

document.addEventListener('DOMContentLoaded', () => {
  // ─── Calculator Logic ──────────────────────────────────
  const claimsInput = document.getElementById('claimsPerDay');
  const referralsInput = document.getElementById('referralsPerMonth');
  
  const claimsVal = document.getElementById('claimsVal');
  const refsVal = document.getElementById('refsVal');
  const totalArpaEl = document.getElementById('totalArpa');
  const totalUsdtEl = document.getElementById('totalUsdt');

  // Values aligned with backend server.js:
  // BONUS_AMOUNT = 0.5 ARPA per claim
  // REFERRAL_REWARD = 1.0 ARPA per friend
  // Assumed conversion ~ 0.10 USDT per ARPA
  const CLAIM_REWARD = 0.5;
  const REF_REWARD = 1.0;
  const ARPA_TO_USDT = 0.10;

  function calculateEarnings() {
    const dailyClaims = parseInt(claimsInput.value, 10);
    const monthlyRefs = parseInt(referralsInput.value, 10);

    claimsVal.textContent = dailyClaims;
    refsVal.textContent = monthlyRefs;

    const monthlyClaimArpa = dailyClaims * 30 * CLAIM_REWARD;
    const monthlyRefArpa = monthlyRefs * REF_REWARD;
    const totalArpa = monthlyClaimArpa + monthlyRefArpa;
    const totalUsdt = totalArpa * ARPA_TO_USDT;

    totalArpaEl.textContent = `+${totalArpa.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ARPA`;
    totalUsdtEl.textContent = `≈ $${totalUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  }

  if (claimsInput && referralsInput) {
    claimsInput.addEventListener('input', calculateEarnings);
    referralsInput.addEventListener('input', calculateEarnings);
    calculateEarnings();
  }

  // ─── App Access Modal Logic ────────────────────────────
  const modal = document.getElementById('accessModal');
  const openButtons = document.querySelectorAll('.open-access-modal');
  const closeButton = document.getElementById('closeModal');

  function openModal(e) {
    if (e) e.preventDefault();
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal() {
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  openButtons.forEach(btn => {
    btn.addEventListener('click', openModal);
  });

  if (closeButton) {
    closeButton.addEventListener('click', closeModal);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // ─── Navbar background blur on scroll ─────────────────
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      navbar.style.background = 'rgba(8, 8, 22, 0.9)';
      navbar.style.borderBottomColor = 'rgba(139, 92, 246, 0.2)';
    } else {
      navbar.style.background = 'rgba(8, 8, 22, 0.7)';
      navbar.style.borderBottomColor = 'rgba(255, 255, 255, 0.05)';
    }
  });
});
