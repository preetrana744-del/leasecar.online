const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat('en-IN').format(value);
const fleet = [
  { id: 1, name: 'Mahindra Thar Roxx', daily_price: 6500, image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Mahindra%20Thar%20ROXX%20on%20dirt.jpg' },
  { id: 2, name: 'Toyota Fortuner Legender', daily_price: 8500, image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Toyota%20Fortuner%204x4%20Legender%20%28LTD%29%202-Tone%20White%20Pearl-Black.jpg' },
  { id: 3, name: 'Toyota Innova Hycross', daily_price: 6800, image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Toyota%20Zenix%202.0%20Q%20HEV%202023.jpg' },
  { id: 4, name: 'Maruti Suzuki Dzire', daily_price: 3400, image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Suzuki%20Dzire%202024%20ZXI%2B.jpg' },
  { id: 5, name: 'Hyundai Creta', daily_price: 4800, image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/2024%20Hyundai%20Creta%20Alpha.jpg' },
  { id: 6, name: 'Tata Curvv EV', daily_price: 5600, image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Tata%20Curvv.EV.jpg' }
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function enableDragScroll(element) {
  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  element.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') return;
    dragging = true;
    startX = event.clientX;
    startScroll = element.scrollLeft;
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove', event => {
    if (!dragging) return;
    element.scrollLeft = startScroll - (event.clientX - startX);
  });
  const stop = () => { dragging = false; };
  element.addEventListener('pointerup', stop);
  element.addEventListener('pointercancel', stop);
}

function renderHeroGallery() {
  const gallery = $('#heroGallery');
  const index = $('#galleryIndex');
  if (!gallery) return;
  gallery.innerHTML = fleet.map((car, position) => `<figure class="hero-car" data-position="${position}">
    <img src="${escapeHtml(car.image_url)}" alt="${escapeHtml(car.name)}" draggable="false" referrerpolicy="no-referrer" />
    <figcaption class="hero-car-meta"><p>${escapeHtml(car.name)}</p><span>0${position + 1}</span></figcaption>
  </figure>`).join('');
  const cards = [...gallery.children];
  const cardLeft = card => card.offsetLeft - gallery.offsetLeft;
  const nearestCard = () => cards.reduce((closest, card, position) => Math.abs(cardLeft(card) - gallery.scrollLeft) < Math.abs(cardLeft(cards[closest]) - gallery.scrollLeft) ? position : closest, 0);
  const scrollToCard = direction => {
    const next = Math.max(0, Math.min(cards.length - 1, nearestCard() + direction));
    gallery.scrollTo({ left: cardLeft(cards[next]), behavior: 'smooth' });
  };
  $('#galleryPrev')?.addEventListener('click', () => scrollToCard(-1));
  $('#galleryNext')?.addEventListener('click', () => scrollToCard(1));
  gallery.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); scrollToCard(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); scrollToCard(1); }
  });
  gallery.addEventListener('scroll', () => { if (index) index.textContent = String(nearestCard() + 1).padStart(2, '0'); }, { passive: true });
  enableDragScroll(gallery);
}

function renderFleet() {
  const grid = $('#fleetGrid');
  if (!grid) return;
  grid.innerHTML = fleet.map((car, position) => `<article class="car-card">
    <img class="car-img" src="${escapeHtml(car.image_url)}" alt="${escapeHtml(car.name)}" loading="lazy" referrerpolicy="no-referrer" />
    <div class="car-top"><span class="availability">AVAILABLE</span><span class="car-index">0${position + 1}</span></div>
    <div class="car-info"><div><h3>${escapeHtml(car.name)}</h3><div class="rate"><strong>₹${money(car.daily_price)}</strong> / day</div></div><button class="reserve-btn" type="button" aria-label="Preview ${escapeHtml(car.name)}">↗</button></div>
  </article>`).join('');
}

function initOwnerDialog() {
  const button = $('#ownerPreviewBtn');
  const dialog = $('#ownerPreviewDialog');
  if (!button || !dialog) return;
  button.addEventListener('click', () => dialog.showModal());
  $('#ownerPreviewClose')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}

renderHeroGallery();
renderFleet();
initOwnerDialog();
