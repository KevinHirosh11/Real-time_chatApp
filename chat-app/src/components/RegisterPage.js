function RegisterPage({ registerForm, setRegisterForm, authLoading, onSubmit }) {
  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <label htmlFor="register-username">Username</label>
      <input
        id="register-username"
        type="text"
        value={registerForm.username}
        onChange={(event) => setRegisterForm({ ...registerForm, username: event.target.value })}
        placeholder="Your name"
        autoComplete="username"
      />

      <label htmlFor="register-email">Email</label>
      <input
        id="register-email"
        type="email"
        value={registerForm.email}
        onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
        placeholder="you@email.com"
        autoComplete="email"
      />

      <label htmlFor="register-password">Password</label>
      <input
        id="register-password"
        type="password"
        value={registerForm.password}
        onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
        placeholder="At least 6 characters"
        autoComplete="new-password"
      />

      <button type="submit" disabled={authLoading}>
        {authLoading ? 'Creating account...' : 'Create account'}
      </button>
    </form>
  );
}

export default RegisterPage;
