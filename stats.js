const { ipcRenderer } = require('electron');

let all = [];
let filter = 'all';

const order = { problem: 0, learning: 1, new: 2, good: 3 };

function render() {
  const counts = { new: 0, learning: 0, problem: 0, good: 0 };
  all.forEach((w) => counts[w.status]++);
  document.getElementById('chips').innerHTML = `
    <span class="chip problem"><b>${counts.problem}</b> problem</span>
    <span class="chip learning"><b>${counts.learning}</b> learning</span>
    <span class="chip new"><b>${counts.new}</b> new</span>
    <span class="chip good"><b>${counts.good}</b> good</span>
  `;

  const rows = all
    .filter((w) => filter === 'all' || w.status === filter)
    .sort((a, b) => order[a.status] - order[b.status] || a.front.localeCompare(b.front));

  document.getElementById('tbody').innerHTML = rows.map((w) => `
    <tr>
      <td class="front">${w.front}</td>
      <td>${w.answers.join(', ')}</td>
      <td>${w.level != null ? w.level : ''}</td>
      <td><span class="st ${w.status}">${w.status}</span></td>
      <td>${w.correct}</td>
      <td>${w.wrong}</td>
      <td>${w.streak}</td>
    </tr>
  `).join('');
}

document.getElementById('filters').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  filter = e.target.dataset.f;
  document.querySelectorAll('.filters button').forEach((b) => b.classList.toggle('active', b === e.target));
  render();
});

ipcRenderer.invoke('get-stats').then((data) => {
  all = data;
  render();
});
