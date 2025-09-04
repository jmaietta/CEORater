// delete-account.js — minimal modal wiring for in-app deletion (Apple Guideline 5.1.1(v))
import { auth, db } from './firebase-init.js';
import { deleteCurrentUserWithPassword, deleteCurrentUserSmart, fetchProviderForEmail } from './auth.js';

// ---- DOM ----
const $accountBtn = document.getElementById('accountBtn');
const $logoutBtn  = document.getElementById('logoutBtn');
const $loginBtn   = document.getElementById('loginBtn');

const $modal   = document.getElementById('deleteModal');
const $pwd     = document.getElementById('deletePassword');
const $cancel  = document.getElementById('cancelDeleteBtn');
const $confirm = document.getElementById('confirmDeleteBtn');
const $close   = document.getElementById('closeDeleteModalBtn');

// Replace with your deployed backend URL:
const PURGE_ENDPOINT = 'https://YOUR_BACKEND_DOMAIN/purgeUserData';

// Show Account/Delete only when logged in
auth.onAuthStateChanged((u) => {
  const authed = !!u;
  $accountBtn?.classList.toggle('hidden', !authed);
  $logoutBtn?.classList.toggle('hidden', !authed);
  $loginBtn?.classList.toggle('hidden', authed);
});

function openModal() { if ($pwd) $pwd.value = ''; $modal?.classList.remove('hidden'); }
function closeModal() { $modal?.classList.add('hidden'); }

$accountBtn?.addEventListener('click', openModal);
$cancel?.addEventListener('click', closeModal);
$close?.addEventListener('click', closeModal);

$confirm?.addEventListener('click', async () => {
  const user = auth.currentUser;
  const password = ($pwd?.value || '').trim();

  if (!user) { alert('No signed-in user.'); return; }

  try {
    // Pick reauth flow based on provider; if password account, require password.
    const which = user.email ? await fetchProviderForEmail(user.email) : null;

    if (which === 'password') {
      if (!password) { alert('Please enter your password.'); return; }
      await deleteCurrentUserWithPassword(password, PURGE_ENDPOINT);
    } else {
      await deleteCurrentUserSmart({ password, purgeEndpoint: PURGE_ENDPOINT });
    }

    closeModal();
    alert('Your account has been permanently deleted.');
    window.location.href = '/';
  } catch (e) {
    console.error(e);
    alert(e?.message || 'Could not delete account. Please try again.');
  }
});
