async signup(email, password, name) {
  if (!email || !password || !name) {
    throw new Error('Please fill in all fields.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid email address.');
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(this.getErrorMessage(data));
  }

  if (data.session && data.session.access_token) {
    localStorage.setItem('sb-auth-token', data.session.access_token);
    this.user = data.user;
  }

  if (data.user) {
    await this.saveSignupName(email, name);
  }

  return { success: true, requiresConfirmation: !data.session };
}

async saveSignupName(email, name) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ name }),
    }
  );
  return res.ok;
}
