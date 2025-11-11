# PWA Testing Guide

This guide covers how to test Progressive Web App (PWA) features of Smart Money Tracker.

## Prerequisites

- The app must be served over HTTPS (or localhost for development)
- Use a PWA-compatible browser (Chrome, Edge, Firefox, Safari)

## Testing PWA Installation

### Desktop Installation Test (Chrome/Edge)

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Open in Chrome/Edge:**
   - Navigate to `http://localhost:5173` (or your dev server URL)

3. **Check for install prompt:**
   - Look for the install icon in the address bar
   - Or check the app menu for "Install Smart Money Tracker"

4. **Install the app:**
   - Click the install button
   - Confirm the installation
   - The app should open in a standalone window

5. **Verify installation:**
   - Check your OS applications/programs list
   - The app should appear with its icon
   - Opening it should launch in a standalone window without browser UI

### Mobile Installation Test (Android - Chrome)

1. **Deploy to a test server** (required for mobile):
   - Build: `npm run build`
   - Deploy to a hosting service with HTTPS

2. **Open on Android device:**
   - Open Chrome on your Android device
   - Navigate to your deployed URL

3. **Install the app:**
   - Look for the "Add to Home Screen" banner at the bottom
   - Or tap menu (⋮) → "Install app"
   - Confirm the installation

4. **Verify installation:**
   - Check your home screen for the app icon
   - Open the app - it should launch fullscreen without browser UI
   - Check Android app drawer - the app should appear there

### Mobile Installation Test (iOS - Safari)

1. **Open in Safari:**
   - Navigate to your deployed HTTPS URL in Safari

2. **Add to Home Screen:**
   - Tap the Share button (square with arrow pointing up)
   - Scroll down and tap "Add to Home Screen"
   - Edit the name if desired and tap "Add"

3. **Verify installation:**
   - Check your home screen for the app icon
   - Open the app - it should launch with minimal Safari UI
   
**Note:** iOS has limited PWA support compared to Android. The install prompt won't show automatically; users must manually use "Add to Home Screen".

## Testing Offline Mode

### Test Offline Functionality

1. **Open DevTools:**
   - Press F12 or right-click → Inspect

2. **Go to Application tab:**
   - Click "Application" in the DevTools menu
   - Look for "Service Workers" in the left sidebar

3. **Verify Service Worker is registered:**
   - You should see the service worker listed
   - Status should be "activated and running"

4. **Test offline mode:**
   - In DevTools, go to Network tab
   - Check "Offline" in the throttling dropdown
   - OR: Turn off your internet connection

5. **Reload the page:**
   - Press Ctrl+R or Cmd+R
   - The app should still load from cache

6. **Try navigating:**
   - Navigate to different pages
   - Cached pages should load normally
   - Uncached pages should show the offline fallback

7. **Check cache storage:**
   - In Application tab → Cache Storage
   - You should see workbox caches
   - Inspect cached resources

### Test Cache Updates

1. **Make a code change:**
   - Edit a file and save

2. **Rebuild the app:**
   ```bash
   npm run build
   ```

3. **With app open, reload:**
   - The new service worker should install in the background
   - Check Service Workers in DevTools
   - You may see "waiting to activate"

4. **Close and reopen the app:**
   - The new service worker should activate
   - Changes should be visible

## Lighthouse PWA Audit

### Running Lighthouse in Chrome DevTools

1. **Open DevTools:**
   - Press F12 or right-click → Inspect

2. **Go to Lighthouse tab:**
   - Click "Lighthouse" in the DevTools menu
   - If not visible, click the ≫ button to show more tools

3. **Configure the audit:**
   - Check "Progressive Web App"
   - Optionally check other categories (Performance, Accessibility, etc.)
   - Select "Desktop" or "Mobile" mode
   - Choose "Navigation" report type

4. **Generate report:**
   - Click "Analyze page load"
   - Wait for the audit to complete (15-30 seconds)

5. **Review the results:**
   - PWA score should be **90+** for full PWA compliance
   - Check for any failing audits
   - Review suggestions for improvements

### Key PWA Audit Criteria

Lighthouse checks for:
- ✅ **Installable**: Web app manifest with required fields
- ✅ **Service Worker**: Registered and responds to fetch events
- ✅ **HTTPS**: Served over secure connection
- ✅ **Viewport Meta Tag**: Mobile-friendly viewport
- ✅ **Icons**: Provides adequate icon sizes
- ✅ **Theme Color**: Defines theme color
- ✅ **Splash Screen**: Has icons for splash screen

### Running Lighthouse CLI

For automated testing:

```bash
# Install Lighthouse globally
npm install -g lighthouse

# Run audit on deployed URL
lighthouse https://your-app-url.com --view

# Run PWA audit only
lighthouse https://your-app-url.com --only-categories=pwa --view

# Save report as JSON
lighthouse https://your-app-url.com --output json --output-path ./report.json
```

## Platform-Specific Tips

### Chrome (Desktop & Android)
- **Best PWA support** with full install prompt
- Service worker debugging is excellent in DevTools
- Supports background sync and push notifications (if implemented)
- `beforeinstallprompt` event works reliably

### Edge (Desktop)
- Nearly identical to Chrome (Chromium-based)
- Install prompts work the same way
- Good service worker debugging

### Firefox (Desktop)
- Service workers supported
- Limited install prompt support (no `beforeinstallprompt`)
- Users can manually install via address bar icon
- Good for testing service worker functionality

### Safari (iOS & macOS)
- **Limited PWA support** compared to Chrome
- No automatic install prompt
- Users must manually "Add to Home Screen"
- Service worker support is improving but has limitations
- Test thoroughly on iOS devices
- Some service worker features may not work

### Safari Specific Issues to Test

1. **App Icon Display:**
   - Ensure `apple-touch-icon.png` displays correctly
   - Should be 180x180 pixels

2. **Splash Screen:**
   - iOS generates splash screen from icon and theme color
   - May not be customizable

3. **Storage Limits:**
   - Safari has stricter storage limits
   - Test with real-world data amounts

4. **Updates:**
   - Service worker updates may be delayed
   - Users may need to manually clear cache

## Common Issues and Solutions

### Install Prompt Not Showing

**Possible causes:**
- Not served over HTTPS (except localhost)
- Manifest missing or invalid
- Service worker not registered
- User has previously dismissed the prompt
- Browser doesn't support `beforeinstallprompt`

**Solutions:**
- Check browser console for errors
- Verify manifest.json loads correctly
- Ensure service worker registers successfully
- Clear browser cache and storage
- Test in Chrome/Edge for best support

### Service Worker Not Updating

**Solutions:**
- Hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)
- Clear browser cache: DevTools → Application → Clear storage
- Check "Update on reload" in Application → Service Workers
- Unregister old service worker and reload

### Offline Mode Not Working

**Check:**
- Service worker is activated
- Correct resources are cached (check Cache Storage)
- No service worker errors in console
- Network requests are being intercepted

**Debug:**
- Use DevTools Network tab to see if requests are served from service worker
- Check Service Worker status in Application tab
- Look for fetch event handlers in service worker code

### Icons Not Displaying

**Solutions:**
- Verify icon files exist in `/public` directory
- Check icon paths in manifest
- Ensure correct sizes (192x192, 512x512 minimum)
- Test icon URLs directly in browser
- For iOS: Ensure `apple-touch-icon.png` is present

## Best Practices

1. **Always test on real devices:** Emulators may not accurately represent PWA behavior
2. **Test across browsers:** Chrome, Safari, Firefox, Edge
3. **Test both online and offline:** Ensure graceful degradation
4. **Monitor cache size:** Don't cache too aggressively
5. **Test updates:** Ensure new versions deploy correctly
6. **Use HTTPS in production:** Required for service workers
7. **Test on slow networks:** Use DevTools throttling

## Useful Resources

- [MDN PWA Guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Google PWA Docs](https://web.dev/progressive-web-apps/)
- [Workbox Documentation](https://developers.google.com/web/tools/workbox)
- [Can I Use - PWA](https://caniuse.com/serviceworkers)

## Automated Testing

For CI/CD pipelines, consider adding:

```bash
# In your CI/CD script
npm run build
npx lighthouse-ci autorun
```

Configure `.lighthouserc.json`:
```json
{
  "ci": {
    "collect": {
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:pwa": ["error", {"minScore": 0.9}]
      }
    }
  }
}
```

This ensures your PWA score stays above 90 in automated tests.
