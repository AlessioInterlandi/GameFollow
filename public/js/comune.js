/* Logica condivisa dall'intestazione (.topbar), presente in ogni pagina
 * dopo il login: nome del locale, menu account, logout.
 *
 * Ogni pagina che include questo file deve avere nel proprio HTML:
 * #org-nome #avatar #account-dropdown #logout-link
 *
 * account e' un dato finto: quando ci sara' il backend arriva da /api/auth/me.
 */

const account = {
  ristorante: 'Trattoria da Mario',
  iniziali: 'MR',
};

function escapeHtml(testo) {
  const div = document.createElement('div');
  div.textContent = testo;
  return div.innerHTML;
}

function caricaAccount() {
  document.getElementById('org-nome').textContent = account.ristorante;
  document.getElementById('avatar').textContent = account.iniziali;
}

function initMenu(bottoneId, menuId) {
  const bottone = document.getElementById(bottoneId);
  const menu = document.getElementById(menuId);

  bottone.addEventListener('click', (evento) => {
    evento.stopPropagation();
    const apri = menu.hidden;
    menu.hidden = !apri;
    bottone.setAttribute('aria-expanded', String(apri));
  });

  document.addEventListener('click', () => {
    menu.hidden = true;
    bottone.setAttribute('aria-expanded', 'false');
  });
}

document.getElementById('logout-link').addEventListener('click', async (evento) => {
  evento.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = 'login.html';
});

caricaAccount();
initMenu('avatar', 'account-dropdown');
