# Deployment Guide

This project is configured to deploy to GitHub Pages automatically using GitHub Actions.

## Quick Start

1. **Push to GitHub**: Make sure your code is pushed to the `main` or `master` branch
2. **Enable GitHub Pages**: 
   - Go to your repository Settings → Pages
   - Under "Source", select "GitHub Actions"
3. **Deploy**: The workflow will automatically run on every push to `main`/`master`

## Base Path Configuration

The app is configured with base path `/zip2mp/` by default. This means:
- Repository name: `zip2mp`
- GitHub Pages URL: `https://yourusername.github.io/zip2mp/`

### To Change the Base Path

1. Edit `frontend/vite.config.ts`
2. Change the `base` property:
   ```typescript
   base: '/your-repo-name/',  // For subdirectory
   // or
   base: '/',                  // For root domain (custom domain)
   ```

### For Custom Domain

If you're using a custom domain:
1. Set `base: '/'` in `vite.config.ts`
2. Add your custom domain in GitHub Pages settings
3. Update your DNS records as instructed by GitHub

## Manual Deployment

If you prefer to deploy manually:

```bash
cd frontend
npm install
npm run build
```

Then copy the contents of `frontend/dist/` to your `gh-pages` branch.

## Troubleshooting

### 404 Errors on GitHub Pages

- Make sure the `base` path in `vite.config.ts` matches your repository name
- Ensure `.nojekyll` file exists in `frontend/public/`
- Check that GitHub Actions workflow completed successfully

### CORS Errors

All APIs used support CORS and work from the browser. If you see CORS errors:
- Check browser console for specific API errors
- Verify the API endpoints are still available
- Some APIs may have rate limits

### Build Failures

- Check GitHub Actions logs for specific errors
- Ensure Node.js version is compatible (18+)
- Verify all dependencies are installed correctly
