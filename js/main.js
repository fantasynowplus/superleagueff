document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
    });
  }

  fetchRaisedAmount();
});

function fetchRaisedAmount() {
  fetch('data/fundraising.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to load fundraising data');
      }
      return response.json();
    })
    .then(amount => {
      const raisedElement = document.getElementById('raised-amount');
      if (raisedElement && typeof amount === 'number') {
        const roundedAmount = Math.round(amount * 100) / 100;
        raisedElement.textContent = '$' + roundedAmount.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
      }
    })
    .catch(error => {
      console.error('Error fetching raised amount:', error);
    });
}
