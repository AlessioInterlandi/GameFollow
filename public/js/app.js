const recentReviewsEl = document.getElementById('recent-reviews');
if (recentReviewsEl) {
  const recentReviews = [['ShadowPlayer_98', '●', '★★★★☆', '1 hour ago', 'The game is good but the multiplayer is terrible. I keep getting disconnected.', 'Negative', 'Multiplayer, Connection'], ['AlexM', '▶', '★★★★★', '3 hours ago', 'Amazing game! The atmosphere is incredible.', 'Positive', 'Atmosphere'], ['GameHunter_42', '●', '★★★☆☆', '5 hours ago', 'Some bugs in the UI, but overall fun.', 'Neutral', 'UI, Bugs']];
  recentReviewsEl.innerHTML = recentReviews.map(([name, source, stars, when, text, feeling, tag], index) => `<div class="review-line"><span class="review-avatar a${index}">${name.slice(0, 1)}</span><div class="review-copy"><b>${name}　${source}</b><span class="review-stars">${stars}</span><small>${when}</small><p>${text}</p><em>${tag}</em></div><div><span class="feeling ${feeling.toLowerCase()}">${feeling}</span><button>Reply</button></div></div>`).join('');
}

const navToggle = document.querySelector('.nav-toggle');
const sidebarEl = document.querySelector('.sidebar');
if (navToggle && sidebarEl) {
  navToggle.addEventListener('click', () => sidebarEl.classList.toggle('open'));
  sidebarEl.querySelectorAll('.main-nav a').forEach(link => link.addEventListener('click', () => sidebarEl.classList.remove('open')));
}
