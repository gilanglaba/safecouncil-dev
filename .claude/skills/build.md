---
name: build
description: Build the frontend for production deployment
---

Build the SafeCouncil frontend for production.

## Steps

1. **Run the build**:
   ```bash
   cd /Users/gilang/Project/Capstone/safecouncil-dev/frontend && npm run build
   ```

2. **Show output**: Report success, errors, or warnings from the build.

3. **List built files**:
   ```bash
   ls -lh /Users/gilang/Project/Capstone/safecouncil-dev/frontend/dist/
   ```

4. **Remind** the user: `frontend/vercel.json` contains the API proxy rewrite to Railway. If the Railway backend URL has changed, update vercel.json before deploying.
