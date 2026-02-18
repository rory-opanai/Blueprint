export default function SetupPage() {
  return (
    <main style={{ maxWidth: 760, margin: "48px auto", padding: "0 20px", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Authentication Not Configured</h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>
        Blueprint requires Google SSO before users can sign in.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 12 }}>
        Add these Vercel Production environment variables and redeploy:
      </p>
      <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
        <li>
          <code>NEXTAUTH_SECRET</code> (or <code>AUTH_SECRET</code>)
        </li>
        <li>
          <code>NEXTAUTH_URL</code> = <code>https://blueprint-sigma-silk.vercel.app</code>
        </li>
        <li>
          <code>NEXTAUTH_GOOGLE_ID</code> (or <code>GOOGLE_OAUTH_CLIENT_ID</code>)
        </li>
        <li>
          <code>NEXTAUTH_GOOGLE_SECRET</code> (or <code>GOOGLE_OAUTH_CLIENT_SECRET</code>)
        </li>
      </ul>
    </main>
  );
}
