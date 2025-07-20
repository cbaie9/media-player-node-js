
    document.getElementById('login-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const errorDiv = document.getElementById('login-error');
      errorDiv.textContent = '';
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        if (res.ok) {
          window.location.href = '/';
        } else {
          const data = await res.json().catch(() => ({}));
          errorDiv.textContent = data.error || 'Erreur de connexion';
        }
      } catch {
        errorDiv.textContent = 'Erreur de connexion';
      }
    });