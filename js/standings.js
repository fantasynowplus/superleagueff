class StandingsManager {
  constructor(config = {}) {
    this.dataUrl = config.dataUrl || 'data/standings.json';
    this.containerSelector = config.containerSelector || '#standings-table-body';
    this.loadingSelector = config.loadingSelector || '#standings-loading';
    this.errorSelector = config.errorSelector || '#standings-error';
    this.divisionFilterSelector = config.divisionFilterSelector || '#division-filter';
    
    this.allData = [];
    this.filteredData = [];
    this.currentDivision = '';
  }

  async init() {
    try {
      await this.fetchData();
      this.populateDivisionFilter();
      this.render();
      this.attachEventListeners();
    } catch (error) {
      this.showError(error.message);
    }
  }

  async fetchData() {
    try {
      const response = await fetch(this.dataUrl);
      if (!response.ok) throw new Error('Failed to load standings data');
      
      const data = await response.json();
      this.allData = this.sortStandings(data);
      this.filteredData = [...this.allData];
      this.hideLoading();
    } catch (error) {
      throw new Error('Unable to fetch standings: ' + error.message);
    }
  }

  sortStandings(data) {
    return data.sort((a, b) => {
      const pointsForA = parseFloat(a.pointsFor) || 0;
      const pointsForB = parseFloat(b.pointsFor) || 0;

      if (pointsForB !== pointsForA) {
        return pointsForB - pointsForA;
      }

      const winsA = parseInt(a.record.split('-')[0]) || 0;
      const winsB = parseInt(b.record.split('-')[0]) || 0;

      return winsB - winsA;
    });
  }

  populateDivisionFilter() {
    const divisions = [...new Set(this.allData.map(item => item.division))].sort();
    const filterSelect = document.querySelector(this.divisionFilterSelector);
    
    if (!filterSelect) return;

    const currentValue = filterSelect.value;
    filterSelect.innerHTML = '<option value="">All Divisions</option>';
    
    divisions.forEach(division => {
      const option = document.createElement('option');
      option.value = division;
      option.textContent = division;
      filterSelect.appendChild(option);
    });

    if (currentValue) {
      filterSelect.value = currentValue;
    }
  }

  filterByDivision(division) {
    this.currentDivision = division;
    
    if (division === '') {
      this.filteredData = [...this.allData];
    } else {
      this.filteredData = this.allData.filter(team => team.division === division);
    }

    this.render();
  }

  render() {
    const tbody = document.querySelector(this.containerSelector);
    
    if (!tbody) {
      console.warn('Table body container not found:', this.containerSelector);
      return;
    }

    if (this.filteredData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="standings-empty">No teams found</td></tr>';
      return;
    }

    tbody.innerHTML = this.filteredData.map((team, index) => `
      <tr>
        <td>${index + 1}</td>
        <td class="team-name">
          <a href="${team.link}" target="_blank" class="team-link">${this.escapeHtml(team.team)}</a>
        </td>
        <td>
          <span class="division-badge">${this.escapeHtml(team.division)}</span>
        </td>
        <td class="points-for">${parseFloat(team.pointsFor).toFixed(2)}</td>
        <td class="record-display">${this.escapeHtml(team.record)}</td>
      </tr>
    `).join('');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  hideLoading() {
    const loadingEl = document.querySelector(this.loadingSelector);
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
  }

  showError(message) {
    const errorEl = document.querySelector(this.errorSelector);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
    this.hideLoading();
  }

  attachEventListeners() {
    const filterSelect = document.querySelector(this.divisionFilterSelector);
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        this.filterByDivision(e.target.value);
      });
    }
  }

  refresh() {
    this.init();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const standings = new StandingsManager({
    dataUrl: 'https://script.google.com/macros/s/AKfycbxusGQpD7XHV7wbI2RjtbnZLsp9SgSOXIxFAx8z3jRroOUFQpqqH2H4v61un1HutWM_kg/exec',
    containerSelector: '#standings-table-body',
    loadingSelector: '#standings-loading',
    errorSelector: '#standings-error',
    divisionFilterSelector: '#division-filter'
  });

  standings.init();
  window.standingsManager = standings;
});
