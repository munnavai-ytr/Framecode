# Framecode

AI video application that generates vertical 9:16 videos by writing code.

## Environment Variables

Configure the following environment variables in your server environment (e.g. `.env.local` or host settings):

- `KEYS_SECRET`: Required secret string (minimum 32 characters) used to encrypt user API keys in httpOnly cookies.
- `PIXABAY_API_KEY`: Required API key for Pixabay stock footage and image search.
- `APP_URL`: The URL where the application is hosted.

Users bring their own API keys (BYOK) for Claude, OpenRouter, or Gemini directly in the in-app Settings page.
