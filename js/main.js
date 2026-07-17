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
  const teamId = 73449;
  const apiUrl = `https://www.extra-life.org/api/1.6/teams/${teamId}`;

  fetch(apiUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error('API request failed');
      }
      return response.json();
    })
    .then(data => {
      const raisedElement = document.getElementById('raised-amount');
      if (raisedElement && data.sumDonations !== undefined) {
        const amount = Math.round(data.sumDonations * 100) / 100;
        raisedElement.textContent = '$' + amount.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
      }
    })
    .catch(error => {
      console.error('Error fetching raised amount:', error);
    });
}
