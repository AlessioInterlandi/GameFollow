document.querySelectorAll('.settings-nav button[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.settings-nav button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.settings-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === tab);
    });
  });
});

const billingButtons = document.querySelectorAll('.billing-toggle button');
const planAmounts = document.querySelectorAll('.plan-price .amount, .compare-table .amount');
const planNotes = document.querySelectorAll('.plan-note');

function applyBillingCycle(cycle) {
  planAmounts.forEach((el) => {
    const price = el.dataset[cycle];
    if (price) el.textContent = price;
  });
  planNotes.forEach((note) => {
    note.hidden = cycle !== 'annual';
  });
}

billingButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    billingButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    applyBillingCycle(btn.dataset.billing);
  });
});

const compareToggle = document.getElementById('compare-toggle');
const compareTable = document.getElementById('compare-table');
if (compareToggle && compareTable) {
  compareToggle.addEventListener('click', (event) => {
    event.preventDefault();
    const willShow = compareTable.hidden;
    compareTable.hidden = !willShow;
    compareToggle.textContent = willShow ? 'Hide detailed comparison　⌃' : 'Compare all plans in detail　⌄';
  });
}
