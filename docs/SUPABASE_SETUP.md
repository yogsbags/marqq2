# Supabase Authentication Setup

This application now uses Supabase for authentication. Follow these steps to set it up:

## 1. Create a Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in your project details:
   - Name: `torqq-ai` (or your preferred name)
   - Database Password: (save this securely)
   - Region: Choose closest to your users
5. Wait for the project to be created (takes ~2 minutes)

## 2. Get Your API Keys

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (under "Project URL")
   - **anon/public key** (under "Project API keys")

## 3. Configure Environment Variables

Create a `.env` file in the root of the project:

```bash
# .env
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

**Example:**
```
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 4. Configure Supabase Auth Settings

1. In Supabase dashboard, go to **Authentication** → **URL Configuration**
2. Add your site URL (for production) or `http://localhost:5173` (for development)
3. Add redirect URLs if needed

## 5. Optional: Configure Email Templates

1. Go to **Authentication** → **Email Templates**
2. Customize the email templates for:
   - Confirm signup
   - Reset password
   - Magic link
   - Change email address

## 6. Test the Setup

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Try signing up with a new account
3. Check your email for the confirmation link (if email confirmation is enabled)
4. Try logging in with your credentials

## Troubleshooting

### "Supabase environment variables not set" warning
- Make sure your `.env` file is in the project root
- Restart the dev server after creating/updating `.env`
- Check that variable names start with `VITE_` (required for Vite)

### Authentication not working
- Verify your API keys are correct
- Check browser console for errors
- Ensure Supabase project is active
- Check Supabase dashboard → Authentication → Logs for errors

### Email confirmation required
- If email confirmation is enabled in Supabase, users must verify their email before logging in
- You can disable this in **Authentication** → **Settings** → **Enable email confirmations**

## Features Implemented

✅ Email/Password authentication
✅ Sign up with name, email, and password
✅ Sign in with email and password
✅ Session persistence (stays logged in on page refresh)
✅ Automatic token refresh
✅ Sign out functionality
✅ User metadata (name, avatar, role) stored in Supabase

## Next Steps

- [ ] Set up Row Level Security (RLS) policies in Supabase
- [ ] Add password reset functionality
- [ ] Add social authentication (Google, GitHub, etc.)
- [ ] Add email verification flow
- [ ] Set up user profiles table in Supabase

